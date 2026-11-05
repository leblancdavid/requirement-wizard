import assert from "node:assert/strict";
import test from "node:test";
import { DesktopBackend } from "./backend-host.js";
import { backendFailure, type BackendFailure } from "./backend-failure.js";

const fixture = new URL("./fixtures/backend-worker.mjs", import.meta.url);
test("startup stages are allowlisted and display failures cannot change backend readiness or shutdown", async () => {
  const stages: string[] = [];
  const backend = new DesktopBackend("normal", "unused", () => assert.fail(), fixture, (phase) => { stages.push(phase); throw new Error("Display failed"); });
  try { assert.equal(await backend.ready, "http://127.0.0.1:12345"); assert.deepEqual(stages, ["opening-data", "checking-data"]); }
  finally { await backend.close(); }
});

test("CPU-bound backend startup leaves owner responsive; close waits for flush and is idempotent", async () => {
  let ticks = 0, failures = 0;
  const timer = setInterval(() => ticks++, 20);
  const backend = new DesktopBackend("normal", "unused", () => failures++, fixture);
  try {
    assert.equal(await backend.ready, "http://127.0.0.1:12345");
    assert.ok(ticks >= 3, `Owner event loop continued during synchronous backend work (${ticks} ticks)`);
    const started = Date.now(), closing = backend.close();
    assert.equal(backend.close(), closing);
    await closing;
    assert.ok(Date.now() - started >= 90, "Shutdown awaits the worker's durable flush");
    assert.equal(failures, 0);
  } finally { clearInterval(timer); await backend.close(); }
});

test("close during startup retains ownership until backend cleanup finishes", async () => {
  let failures = 0;
  const backend = new DesktopBackend("normal", "unused", () => failures++, fixture);
  await backend.close();
  assert.equal(failures, 0);
});

for (const mode of ["startup-failure", "unexpected-exit", "runtime-failure"]) {
  test(`backend ${mode} is reported once and cannot be mistaken for clean shutdown`, async () => {
    let failures = 0;
    let notify: () => void;
    const failed = new Promise<void>((resolve) => { notify = resolve; });
    const backend = new DesktopBackend(mode, "unused", () => { failures++; notify(); }, fixture);
    if (mode === "runtime-failure") await backend.ready;
    else await assert.rejects(backend.ready, /stopped unexpectedly/);
    await failed;
    await assert.rejects(backend.close(), /cleanup did not complete/);
    assert.equal(failures, 1);
  });
}

test("worker diagnostics classify memory/string/stack failures without exporting raw messages, paths or credentials", () => {
  const error = new RangeError("Invalid string length: private project text, Bearer secret-fixture");
  error.stack = "RangeError: private project text\n    at exportState (D:\\private-user\\src\\storage\\portable.js:240:19)\n    at secret-fixture (file:///D:/private-user/store.js:330:7)\n    at https://private.example/api?access_token=secret-fixture:4:2";
  const diagnostic = backendFailure(error);
  assert.equal(diagnostic.category, "string-size-limit"); assert.equal(diagnostic.name, "RangeError");
  assert.deepEqual(diagnostic.locations, ["portable.js:240:19", "store.js:330:7"]);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|secret|Bearer|https|exportState/);
  assert.equal(backendFailure(new RangeError("Maximum call stack size exceeded")).category, "stack-overflow");
  assert.equal(backendFailure({ code: "ERR_WORKER_OUT_OF_MEMORY", message: "private" }).category, "out-of-memory");
  assert.equal(backendFailure({ name: "private-project", code: "private-token", message: "private" }).name, "Error");
  assert.equal(backendFailure({ code: "private-token" }).code, undefined);
  assert.equal(backendFailure(undefined).category, "worker-error");
});

test("runtime worker error preserves safe diagnostic code once and display failure cannot prevent cleanup", async () => {
  const diagnostics: BackendFailure[] = [];
  let notify: () => void;
  const failed = new Promise<void>((resolve) => { notify = resolve; });
  const backend = new DesktopBackend("runtime-memory-error", "unused", (detail) => { diagnostics.push(detail); notify(); throw new Error("Display failed"); }, fixture);
  await backend.ready; await failed;
  await assert.rejects(backend.close(), /cleanup did not complete/);
  assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0]!.category, "out-of-memory");
  assert.equal(diagnostics[0]!.code, "ERR_WORKER_OUT_OF_MEMORY");
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-fixture|Bearer|heap out of memory/);
});
