import assert from "node:assert/strict";
import test from "node:test";
import { connectedCatalog, OpenCodeCatalog } from "./catalog.js";
import { selectModel } from "./contract.js";

const raw = { connected: ["custom"], all: [
  { id: "custom", name: "Custom provider", key: "private", options: { token: "private" }, env: ["SECRET"], models: { luna: { name: "Luna", headers: { Authorization: "private" } } } },
  { id: "disconnected", name: "Not connected", models: { hidden: { name: "Hidden" } } },
] };
test("catalog projects only connected provider/model identities and names, without credentials", () => {
  assert.deepEqual(connectedCatalog(raw), [{ id: "custom", name: "Custom provider", models: [{ id: "luna", name: "Luna" }] }]);
  assert.deepEqual(selectModel(raw, "custom", "luna"), { providerID: "custom", modelID: "luna" });
  assert.throws(() => selectModel(raw, "disconnected", "hidden"), /not connected/);
  assert.throws(() => connectedCatalog({ ...raw, all: [{ id: "bad", models: {} }] }));
});
test("catalog coalesces reads, caches, refreshes and dates stale fallback without replacing valid data", async () => {
  let calls = 0, fail = false;
  const source = new OpenCodeCatalog("unused", async () => { calls++; if (fail) throw new Error("private token"); return raw; });
  try {
    const [first, second] = await Promise.all([source.get(), source.get()]);
    assert.deepEqual(first, second); assert.equal(calls, 1);
    assert.deepEqual(await source.get(), first); assert.equal(calls, 1);
    await source.get(true); assert.equal(calls, 2);
    fail = true;
    const stale = await source.get(true);
    assert.equal(stale.stale, true); assert.deepEqual(stale.providers, first.providers);
    assert.equal(JSON.stringify(stale).includes("private"), false);
    fail = false; assert.equal((await source.get(true)).stale, false);
  } finally { await source.close(); }
});
test("initial catalog failures and malformed results are safe and retryable", async () => {
  let valid = false;
  const source = new OpenCodeCatalog("unused", async () => valid ? raw : { secret: "private" });
  await assert.rejects(source.get(), /Could not load OpenCode/);
  valid = true; assert.equal((await source.get()).providers.length, 1);
  await source.close(); assert.throws(() => source.get(), /abort/i);
});
test("catalog shutdown cancels only its owned discovery and awaits cleanup", async () => {
  let started!: () => void, stopped = false;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const source = new OpenCodeCatalog("unused", async (signal) => {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { stopped = true; reject(signal.reason); }, { once: true }));
  });
  const pending = source.get(); const rejected = assert.rejects(pending, /stopped/);
  await ready; await source.close(); await rejected;
  assert.equal(stopped, true);
});
