import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireHelperState, helperLeaseDirectory, helperStateFile } from "./state.js";
import { helperEnvironment } from "./environment.js";
import { boundedIPC, helperReplySchema, helperRequestSchema, nativeSessionID, sessionHandle } from "./protocol.js";
import { startEmbeddedHelper } from "./client.js";

async function temporary() {
  const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "reqwizit-helper-test-"));
  const workspace = join(root, "workspace"); await mkdir(workspace);
  return { root, workspace, dataDirectory: join(root, "data"), bundleDirectory: join(root, "bundle") };
}

test("helper protocol has no prompt/tool/auth/config surface, rejects unknown fields and bounds envelopes", () => {
  for (const op of ["session.prompt", "shell", "credential.get", "config.get", "provider.list", "initialize.future"])
    assert.equal(helperRequestSchema.safeParse({ v: 1, id: 1, op }).success, false);
  for (const extra of [{ permissions: [] }, { model: "other" }, { research: true }])
    assert.equal(helperRequestSchema.safeParse({ v: 1, id: 1, op: "session.create", title: "offline", ...extra }).success, false);
  assert.equal(helperRequestSchema.safeParse({ v: 2, id: 1, op: "health" }).success, false);
  assert.equal(helperRequestSchema.safeParse({ v: 1, id: -1, op: "health" }).success, false);
  assert.equal(boundedIPC({ title: "é".repeat(9000) }), false);
  const circular: { self?: unknown } = {}; circular.self = circular;
  assert.equal(boundedIPC(circular), false);
  assert.equal(helperReplySchema.safeParse({ v: 1, id: 1, ok: false, code: "sdk-failure", raw: "secret" }).success, false);
});

test("helper session handles separate backend, format and store identities", () => {
  const store = randomUUID(), handle = sessionHandle(store, "ses_example");
  assert.equal(nativeSessionID(handle, store), "ses_example");
  for (const wrong of ["ses_example", sessionHandle(randomUUID(), "ses_example"), handle.replace(":v1:", ":v2:"), handle + "/outside"])
    assert.throws(() => nativeSessionID(wrong, store), /does not belong/);
  assert.throws(() => sessionHandle(store, "../session"), /Invalid/);
});

test("helper environment isolates credentials, config, home and temporary state before import", () => {
  const env = helperEnvironment("isolated", { Path: "executables", OPENAI_API_KEY: "synthetic-secret", OPENCODE_CONFIG_CONTENT: "private", NODE_OPTIONS: "--require=unsafe", HTTPS_PROXY: "secret" });
  assert.equal(env.Path, "executables");
  for (const key of ["OPENAI_API_KEY", "OPENCODE_CONFIG_CONTENT", "NODE_OPTIONS", "HTTPS_PROXY"]) assert.equal(env[key], undefined);
  assert.equal(env.XDG_DATA_HOME, join("isolated", "data"));
  assert.equal(env.OPENCODE_TEST_HOME, env.HOME);
  assert.equal(env.TEMP, join("isolated", "tmp"));
});

test("helper state reopens stable identities, rejects concurrent owners and does not invalidate completed empty sessions", async () => {
  const options = await temporary(), first = await acquireHelperState(options.dataDirectory, options.workspace);
  const original = await readFile(join(first.root, helperStateFile), "utf8");
  await writeFile(join(first.root, "completed-evidence.fixture"), "unchanged");
  await assert.rejects(acquireHelperState(options.dataDirectory, options.workspace), /locked/);
  await first.release(); await first.release();
  const second = await acquireHelperState(options.dataDirectory, options.workspace);
  assert.equal(second.state.storeID, first.state.storeID);
  assert.equal(await readFile(join(second.root, helperStateFile), "utf8"), original);
  assert.equal(await readFile(join(second.root, "completed-evidence.fixture"), "utf8"), "unchanged");
  await second.release();
});

test("helper state rejects future/damaged formats and other workspaces without overwriting evidence", async () => {
  for (const representation of ["not-json", JSON.stringify({ format: 99 }), JSON.stringify({ format: 1, profile: "coding-future-v2" })]) {
    const options = await temporary(); await mkdir(options.dataDirectory);
    const marker = join(options.dataDirectory, helperStateFile); await writeFile(marker, representation);
    await assert.rejects(acquireHelperState(options.dataDirectory, options.workspace), /Unsupported or damaged/);
    assert.equal(await readFile(marker, "utf8"), representation);
    assert.ok(!(await readdir(options.dataDirectory)).includes(helperLeaseDirectory));
  }
  const options = await temporary(), state = await acquireHelperState(options.dataDirectory, options.workspace); await state.release();
  const other = join(options.root, "other"); await mkdir(other);
  await assert.rejects(acquireHelperState(options.dataDirectory, other), /different workspace/);
  assert.ok(!(await readdir(options.dataDirectory)).includes(helperLeaseDirectory));
});

test("unfamiliar directories and interrupted leases are not silently adopted or stolen", async () => {
  const options = await temporary(); await mkdir(options.dataDirectory);
  await writeFile(join(options.dataDirectory, "projects.sqlite"), "synthetic application evidence");
  await assert.rejects(acquireHelperState(options.dataDirectory, options.workspace), /not adopted/);
  assert.deepEqual(await readdir(options.dataDirectory), ["projects.sqlite"]);
  const other = await temporary(), state = await acquireHelperState(other.dataDirectory, other.workspace);
  await writeFile(join(state.root, helperLeaseDirectory, "owner.json"), JSON.stringify({ token: "another-owner", pid: 1 }));
  await assert.rejects(state.release(), /ownership changed/);
  await assert.rejects(acquireHelperState(other.dataDirectory, other.workspace), /locked/);
  await writeFile(join(state.root, helperLeaseDirectory, "owner.json"), "invalid-owner-json");
  await assert.rejects(state.release(), /Cannot validate/);
  assert.ok((await readdir(state.root)).includes(helperLeaseDirectory));
});

// Synthetic IPC worker: no SDK/model/provider access. Real SDK checks use the separate pilot.
const fixtureSource = `
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
const mode = process.argv[2]; let store;
const send = (id, data) => process.send({ v: 1, id, ok: true, data });
process.on('message', async request => {
  await appendFile(join(process.env.REQWIZIT_EMBEDDED_ROOT, 'requests.fixture'), request.op + '\\n');
  if (request.op === 'initialize') {
    store = request.storeID;
    if (mode === 'startup-hang') return;
    send(request.id, { kind: 'ready', sdkVersion: '2.1.4', nodeVersion: '26.4.0', storeID: mode === 'wrong-store' ? '00000000-0000-4000-8000-000000000000' : store });
  } else if (request.op === 'close') {
    if (mode === 'close-hang') return;
    send(request.id, { kind: 'closed' }); process.disconnect();
  } else if (request.op === 'health') {
    if (mode === 'request-hang') return;
    if (mode === 'wrong-kind') { send(request.id, { kind: 'removed' }); return; }
    if (mode === 'raw-error') { process.send({ v: 1, id: request.id, ok: false, code: 'sdk-failure', raw: 'synthetic-secret' }); return; }
    send(request.id, { kind: 'health', sdkVersion: '2.1.4', nodeVersion: '26.4.0', prompts: 0, networkAttempts: 0, listenerAttempts: 0 });
  } else if (request.op === 'session.remove') send(request.id, { kind: 'removed' });
  else send(request.id, { kind: 'session', handle: 'reqwizit-embedded:v1:' + store + ':ses_fixture', denyAll: true });
});
`;
async function transportFixture(mode = "healthy") {
  const options = await temporary(); await mkdir(options.bundleDirectory);
  await writeFile(join(options.bundleDirectory, "helper-bundle.json"), JSON.stringify({ format: 1, profile: "metadata-only-v1", platform: "win32", arch: "x64",
    sdkVersion: "2.1.4", nodeVersion: "26.4.0", entry: "worker.js", executable: "node_modules/node-win-x64/bin/node.exe" }));
  const entry = join(options.root, "fake-worker.mjs"); await writeFile(entry, fixtureSource);
  let child: ChildProcess | undefined, launches = 0;
  const launch = (_bundle: unknown, env: NodeJS.ProcessEnv, workspace: string) => {
    launches++;
    child = spawn(process.execPath, [entry, mode], { cwd: workspace, env, detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore", "ipc"] });
    return child;
  };
  return { options: { ...options, startupTimeoutMs: 3000, requestTimeoutMs: 2000, shutdownTimeoutMs: 1000 }, launch, child: () => child!, launches: () => launches };
}
const windowsOnly = { skip: process.platform !== "win32" || process.arch !== "x64" };

test("IPC client uses one explicit helper, scopes sessions locally, closes idempotently and reopens the same store", windowsOnly, async () => {
  const fixture = await transportFixture(), helper = await startEmbeddedHelper(fixture.options, fixture.launch);
  assert.equal((await helper.health()).kind, "health");
  const handle = await helper.createSession("offline"); await helper.getSession(handle);
  await assert.rejects(helper.getSession("legacy-session"), /does not belong/);
  await assert.rejects(helper.getSession(sessionHandle(randomUUID(), "ses_fixture")), /does not belong/);
  await assert.rejects(helper.createSession("x".repeat(257)));
  await helper.removeSession(handle);
  await Promise.all([helper.close(), helper.close()]);
  assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
  const again = await startEmbeddedHelper(fixture.options, fixture.launch);
  assert.equal(again.storeID, helper.storeID); await again.getSession(handle); await again.close();
  assert.equal(fixture.launches(), 2);
  const requests = await readFile(join(fixture.options.dataDirectory, "requests.fixture"), "utf8");
  assert.equal(requests.split("session.get").length - 1, 2);
});

test("IPC startup timeout and cancellation stop only the owned helper and release its lease without retry", windowsOnly, async () => {
  for (const cancel of [false, true]) {
    const fixture = await transportFixture("startup-hang");
    await assert.rejects(startEmbeddedHelper({ ...fixture.options, startupTimeoutMs: 300, ...(cancel ? { signal: AbortSignal.timeout(200) } : {}) }, fixture.launch));
    assert.equal(fixture.launches(), 1);
    assert.ok(fixture.child().exitCode !== null || fixture.child().signalCode !== null);
    assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
  }
});

test("IPC request timeout, operation cancellation and close during work terminate the exclusive helper without replay", windowsOnly, async () => {
  for (const mode of ["timeout", "cancel", "close"]) {
    const fixture = await transportFixture("request-hang"), helper = await startEmbeddedHelper({ ...fixture.options, requestTimeoutMs: 300 }, fixture.launch);
    const pending = assert.rejects(helper.health(mode === "cancel" ? AbortSignal.timeout(100) : undefined));
    if (mode === "close") await helper.close();
    await pending; await helper.close();
    assert.equal(fixture.launches(), 1);
    assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
  }
});

test("IPC malformed/mismatched replies, wrong store and failed close are fail-closed with redacted errors", windowsOnly, async () => {
  for (const mode of ["wrong-store", "wrong-kind", "raw-error", "close-hang"]) {
    const fixture = await transportFixture(mode);
    if (mode === "wrong-store") await assert.rejects(startEmbeddedHelper(fixture.options, fixture.launch), /different store/);
    else {
      const helper = await startEmbeddedHelper({ ...fixture.options, shutdownTimeoutMs: 200 }, fixture.launch);
      if (mode === "close-hang") await assert.rejects(helper.close(), /deadline/);
      else {
        await assert.rejects(helper.health(), error => error instanceof Error && !error.message.includes("synthetic-secret"));
        await helper.close();
      }
    }
    assert.equal(fixture.launches(), 1);
    assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
  }
});

test("IPC unexpected process exit retains state and releases only the confirmed-dead owner's lease", windowsOnly, async () => {
  const fixture = await transportFixture(), helper = await startEmbeddedHelper(fixture.options, fixture.launch);
  await helper.createSession("retained");
  const marker = await readFile(join(fixture.options.dataDirectory, helperStateFile), "utf8");
  const exited = once(fixture.child(), "exit"); fixture.child().kill(); await exited;
  await assert.rejects(helper.health()); await helper.close();
  assert.equal(await readFile(join(fixture.options.dataDirectory, helperStateFile), "utf8"), marker);
  assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
});

test("unknown bundle versions never launch a helper or change helper/application state", windowsOnly, async () => {
  const fixture = await transportFixture();
  await writeFile(join(fixture.options.bundleDirectory, "helper-bundle.json"), JSON.stringify({ format: 99 }));
  await assert.rejects(startEmbeddedHelper(fixture.options, fixture.launch), /Unsupported or missing/);
  assert.equal(fixture.launches(), 0);
  await assert.rejects(readdir(fixture.options.dataDirectory), { code: "ENOENT" });
});

test("a missing packaged executable fails without fallback and releases the never-started owner's lease", windowsOnly, async () => {
  const fixture = await transportFixture(); let launches = 0;
  await assert.rejects(startEmbeddedHelper(fixture.options, (_bundle, env, workspace) => {
    launches++;
    return spawn(join(fixture.options.root, "missing-node.exe"), [], { cwd: workspace, env, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  }));
  assert.equal(launches, 1);
  assert.ok(!(await readdir(fixture.options.dataDirectory)).includes(helperLeaseDirectory));
  assert.ok((await readdir(fixture.options.dataDirectory)).includes(helperStateFile));
});
