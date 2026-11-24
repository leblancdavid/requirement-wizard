import assert from "node:assert/strict";
import test from "node:test";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { AppHelper, HelperView } from "../runtime/embedded/app-helper.js";

test("helper API requires local token, same-origin POST and explicit strict consent, never grants model/project work", async () => {
  const store = new ProjectStore(":memory:");
  const project = store.create("Helper API fixture", "Keep decisions", { providerID: "openai", modelID: "fixture" });
  const calls: string[] = [];
  const view: HelperView = { available: true, enabled: false, process: "stopped", operation: "idle", result: "none", message: "Fixture" };
  const helper: AppHelper = {
    async status() { calls.push("status"); return view; },
    async start(action, consent) { assert.equal(consent, true); calls.push(action); return view; },
    async stop() { calls.push("stop"); return view; }, async close() { calls.push("close"); },
  };
  const app = await startApp({ store, helper, port: 0, adapter: { async analyze() { assert.fail("Helper cannot infer"); } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown, auth = headers) => fetch(`${app.origin}/api/helper/${action}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${app.origin}/api/helper`)).status, 403);
    for (const action of ["check", "login", "stop"]) {
      const body = action === "stop" ? {} : { acceptSDKStorage: true };
      assert.equal((await post(action, body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
      assert.equal((await post(action, body, { ...headers, Origin: "https://foreign.invalid" })).status, 403);
      assert.equal((await fetch(`${app.origin}/api/helper/${action}`, { headers })).status, 405);
    }
    for (const body of [{}, { acceptSDKStorage: false }, { acceptSDKStorage: true, bundleDirectory: "unsafe" }, { acceptSDKStorage: true, prompt: "infer" }])
      assert.equal((await post("login", body)).status, 400);
    assert.deepEqual(calls, []);
    assert.equal((await fetch(`${app.origin}/api/helper`, { headers })).status, 200);
    assert.equal((await post("check", { acceptSDKStorage: true })).status, 202);
    assert.equal((await post("login", { acceptSDKStorage: true })).status, 202);
    assert.equal((await post("stop", {})).status, 202);
    assert.equal((await post("prompt", {})).status, 404);
    assert.equal((await post("stop", { confirmReset: true })).status, 400);
    assert.deepEqual(calls, ["status", "check", "login", "stop"]);
    assert.deepEqual(store.get(project.id), project); assert.deepEqual(store.jobs(project.id), []);
    await app.close(); assert.equal(calls.at(-1), "close");
  } finally { await app.close(); store.close(); }
});

test("helper API hides native errors and unavailable setups never attempt a fallback", async () => {
  for (const configured of [true, false]) {
    const store = new ProjectStore(":memory:");
    const helper: AppHelper = { async status() { throw new Error("synthetic-secret"); }, async start() { throw new Error("synthetic-secret"); }, async stop() { throw new Error("synthetic-secret"); }, async close() {} };
    const app = await startApp({ store, helper: configured ? helper : undefined, port: 0, adapter: { async analyze() { assert.fail("No inference"); } } });
    const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
    try {
      const response = await fetch(`${app.origin}/api/helper/login`, { method: "POST", headers, body: JSON.stringify({ acceptSDKStorage: true }) });
      assert.equal(response.status, configured ? 400 : 503); assert.ok(!(await response.text()).includes("synthetic-secret"));
      const status = await fetch(`${app.origin}/api/helper`, { headers });
      assert.equal(status.status, configured ? 400 : 200); assert.ok(!(await status.text()).includes("synthetic-secret"));
    } finally { await app.close(); store.close(); }
  }
});
