import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { OpenCode } from "@opencode/client";
import { runtimeClient, nativePermissions } from "./client.js";

const assistant = (id = "answer") => ({ id, type: "assistant", agent: "requirements-spike", model: { providerID: "openai", id: "fixture" },
  time: { created: 2, completed: 3 }, content: [{ type: "text", text: '{"summary":"Done"}' }], tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } });
const user = { id: "queued", type: "user", text: "Exact prompt", time: { created: 1 } };
const idle = { id: "idle", type: "idle", outcome: "succeeded", time: { created: 4 } };
async function fixture(history: unknown[] = [user, assistant(), idle], holdWait = false) {
  const calls: { method: string; path: string; body: any }[] = [];
  let modelLoaded = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost"), path = url.pathname;
    let text = ""; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined; calls.push({ method: req.method!, path, body });
    res.setHeader("content-type", "application/json");
    const send = (value: unknown) => res.end(JSON.stringify(value));
    if (path === "/api/model") { modelLoaded = true; return send({ location: { directory: "fixture" }, data: [{ providerID: "openai", id: "fixture", name: "Fixture", enabled: true, headers: { secret: "never-project" } }] }); }
    if (path === "/api/provider") return send({ location: {}, data: modelLoaded ? [{ id: "openai", name: "OpenAI", activation: "auto", settings: { apiKey: "never-project" } }] : [] });
    if (path === "/api/integration") return send({ location: {}, data: [{ id: "openai", connections: [{ type: "credential", method: "oauth", id: "private-account", label: "Private" }], methods: [] }] });
    if (path === "/api/session" && req.method === "POST") return send({ data: { id: "session", permissions: body.permissions } });
    if (path === "/api/session/session" && req.method === "GET") return send({ data: { id: "session", permissions: [{ action: "*", resource: "*", effect: "deny" }] } });
    if (path === "/api/session/session/prompt") return send({ data: { id: "queued", sessionID: "session", type: "user", time: { created: 1 }, payload: { text: body.text }, delivery: "queue" } });
    if (path === "/api/session/session/message") {
      assert.ok(!url.searchParams.has("cursor") || !url.searchParams.has("order"), "V2 cursor carries its own ordering");
      const second = url.searchParams.has("cursor");
      return send({ data: second ? history.slice(1) : history.slice(0, 1), cursor: second ? {} : { next: "next-page" } });
    }
    if (holdWait && /\/wait$/.test(path)) return;
    if (/\/interrupt$/.test(path)) return send({ interrupted: true });
    if (req.method === "PATCH" || /\/(?:wait|agent|model)$/.test(path)) { res.statusCode = 204; return res.end(); }
    res.statusCode = 404; send({ _tag: "NotFoundError", message: "Fixture route missing" });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const client = runtimeClient(OpenCode.make({ baseUrl: `http://127.0.0.1:${address.port}` }), "fixture");
  const prompt = (signal = AbortSignal.timeout(5000)) => client.session.prompt({ sessionID: "session", model: { providerID: "openai", modelID: "fixture" }, agent: "requirements-spike",
    tools: { shell: false, webfetch: true }, parts: [{ type: "text", text: "Exact prompt" }] }, { signal });
  return { calls, client, prompt, close: async () => { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); } };
}

test("V2 catalog initializes models before providers and projects no account/settings secrets", async () => {
  const f = await fixture();
  try {
    const catalog = (await f.client.provider.list()).data;
    assert.deepEqual(catalog, { connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] });
    assert.ok(!JSON.stringify(catalog).includes("never-project")); assert.ok(!JSON.stringify(catalog).includes("private-account"));
  } finally { await f.close(); }
});

test("V2 queued prompt waits, paginates exact messages and accepts only its own successful terminal response", async () => {
  const f = await fixture();
  try {
    const response = await f.prompt(); assert.equal(response.data.parts[0]!.type, "text");
    assert.equal(response.data.info.modelID, "fixture");
    const wait = f.calls.findIndex((c) => /\/wait$/.test(c.path)), message = f.calls.findIndex((c) => /\/message$/.test(c.path));
    assert.ok(wait >= 0 && message > wait);
    assert.deepEqual(f.calls.find((c) => /\/model$/.test(c.path))!.body, { model: { providerID: "openai", id: "fixture" } });
    assert.deepEqual(f.calls.find((c) => c.method === "PATCH")!.body.permissions.at(-1), { action: "shell", resource: "*", effect: "deny" });
    const saved = (await f.client.session.messages({ sessionID: "session" })).data;
    assert.equal(saved.at(-1)!.info.role, "assistant", "V2 idle markers must not prevent completed coding-response recovery");
  } finally { await f.close(); }
});

test("V2 failures, missing queued input, wrong identity and intervening human input never reuse older output", async () => {
  const wrong = assistant(); wrong.model.id = "another-model";
  for (const history of [[assistant(), idle], [user, assistant()], [user, assistant(), { ...idle, outcome: "failed", error: { type: "UnknownError", message: "Token refresh failed: 401" } }],
    [user, wrong, idle], [{ ...user, text: "Changed after queueing" }, assistant(), idle],
    [{ ...user, files: [{ uri: "file:///unreviewed" }] }, assistant(), idle], [user, assistant(), { ...user, id: "other-user" }, idle]]) {
    const f = await fixture(history);
    try { await assert.rejects(f.prompt(), /queued prompt|finish|Token refresh|different provider|Another prompt|attachments/); }
    finally { await f.close(); }
  }
});

test("legacy permission names convert to native V2 deny-by-default rules without external access grants", () => {
  assert.deepEqual(nativePermissions([{ permission: "*", pattern: "*", action: "deny" }, { permission: "bash", pattern: "*", action: "allow" },
    { permission: "patch", pattern: "*", action: "allow" }, { permission: "external_directory", pattern: "*", action: "deny" }]),
  [{ action: "*", resource: "*", effect: "deny" }, { action: "shell", resource: "*", effect: "allow" }, { action: "edit", resource: "*", effect: "allow" }, { action: "external_directory", resource: "*", effect: "deny" }]);
});

test("V2 carries earlier tool steps into publication checks instead of hiding them behind final JSON", async () => {
  const tool = (name: string) => ({ ...assistant("tool-step"), content: [{ type: "tool", id: "call", name,
    state: { status: "completed", input: { url: "https://example.invalid" }, content: [{ type: "text", text: "Exact fetched evidence" }] }, time: { created: 2, completed: 3 } }] });
  for (const name of ["shell", "webfetch"]) {
    const f = await fixture([user, tool(name), assistant(), idle]);
    try {
      if (name === "shell") await assert.rejects(f.prompt(), /outside this request's permission profile/);
      else { const response = await f.prompt(); assert.equal(response.data.parts[0]!.type, "tool"); assert.equal(response.data.parts.at(-1)!.type, "text"); }
    } finally { await f.close(); }
  }
});

test("V2 wait remains cancellable and interrupt targets only the owned session", async () => {
  const f = await fixture(undefined, true), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Fixture cancellation")), 100);
  try {
    await assert.rejects(f.prompt(controller.signal), /Fixture cancellation|abort/i);
    await f.client.session.abort({ sessionID: "session" });
    assert.equal(f.calls.filter((c) => /\/interrupt$/.test(c.path)).length, 1);
    assert.equal(f.calls.filter((c) => /\/message$/.test(c.path)).length, 0, "A cancelled request cannot load/accept a late response");
  } finally { clearTimeout(timer); await f.close(); }
});
