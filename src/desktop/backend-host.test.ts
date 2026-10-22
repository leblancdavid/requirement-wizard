import assert from "node:assert/strict";
import test from "node:test";
import { DesktopBackend } from "./backend-host.js";

const fixture = new URL("./fixtures/backend-worker.mjs", import.meta.url);

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
