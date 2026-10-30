import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { prepareDefinitionReviewScope, definitionReviewScopeContext } from "../core/definition-review-scope.js";
import { definitionScopeDiscoveryAdapter } from "./definition-scope-adapter.js";
import { DefinitionScopeReviewService } from "./definition-scope-review.js";
import { OpenCodeDiscovery, discoveryPrompt } from "../runtime/discovery.js";
import type { startRuntime } from "../runtime/server.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { ConnectionManager } from "../providers/connections.js";
import { CredentialStore } from "../providers/credentials.js";
import type { DiscoveryOptions } from "./discovery.js";

const fakeAccount = { id: "scope-fixture-account", clientID: "scope-fixture-client", subject: "fixture-human", accessToken: "scope-fixture-access-not-real",
  refreshToken: "scope-fixture-refresh-not-real", idToken: "scope-fixture-id-not-real", expiresAt: Date.now() + 3600000, scopes: ["chatgpt.tokens.use.direct"] };

function fixture(connectionID?: string) {
  const store = new ProjectStore(":memory:"), p = store.create("Scope adapter", "Keep original human input", { providerID: "openai", modelID: "fixture", ...(connectionID ? { connectionID } : {}) });
  const request = { projectID: p.id, epicID: "inbox", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: ["rules"] };
  const packet = prepareDefinitionReviewScope(p, request); if (packet.status !== "prepared") assert.fail(packet.reason);
  return { store, p, packet, input: { request, confirmAIUsage: true }, options: { project: p, model: p.model, signal: AbortSignal.timeout(5000), research: false as const, tools: false as const } };
}
function reply(scopeKey: string, contextKey: string, recordID: string) { return { scopeKey, contextKey,
  checks: [{ dimension: "rules", importance: "important", status: "partial", explanation: "Uncertainty remains", evidenceIDs: [recordID] }], crossDimensionConcerns: [] }; }
function fromPrompt(prompt: string, recordID: string) {
  const scopeKey = /^Expected scopeKey: ([a-f0-9]{64})$/m.exec(prompt)?.[1], contextKey = /^Expected contextKey: ([a-f0-9]{64})$/m.exec(prompt)?.[1];
  assert.ok(scopeKey && contextKey); return reply(scopeKey, contextKey, recordID);
}
const discoveryOptions = (f: ReturnType<typeof fixture>): DiscoveryOptions => ({ signal: AbortSignal.timeout(5000), context: definitionReviewScopeContext(f.packet),
  research: false, onProgress: () => {}, onSession: () => {}, onTelemetry: () => {}, onResearch: () => {} });

test("scope prompt preserves complete evidence and rejects mixed/changed profiles before provider startup", async () => {
  const f = fixture(); let starts = 0;
  const runtime = new OpenCodeDiscovery("unused", async () => { starts++; assert.fail("Invalid scope cannot start a runtime"); });
  try {
    const context = definitionReviewScopeContext(f.packet), prompt = discoveryPrompt(f.p, context);
    assert.ok(prompt.startsWith("SCOPED DEFINITION REVIEW ONLY")); assert.ok(prompt.includes(f.p.sources[0]!.text));
    assert.ok(prompt.includes(`Expected contextKey: ${f.packet.contextKey}`)); assert.ok(prompt.includes("crossDimensionConcerns"));
    assert.throws(() => discoveryPrompt(f.p, context, true), /research/);
    for (const change of ["omit", "mixed", "characters"] as const) {
      const altered = structuredClone(context);
      if (change === "omit") (altered.data as typeof f.packet.context).evidence.sources = [];
      if (change === "mixed") altered.manifest.definitionAssessment = { format: 1, epicID: "inbox", inputKey: "0".repeat(64) };
      if (change === "characters") altered.manifest.characters++;
      await assert.rejects(runtime.analyze(f.p, { ...discoveryOptions(f), context: altered }), /exact complete/);
    }
    await assert.rejects(runtime.analyze(f.p, { ...discoveryOptions(f), scan: true }), /scan/);
    assert.equal(starts, 0);
  } finally { f.store.close(); }
});

test("provider bridge requires actual-model telemetry and retains violations even if an adapter swallows callback errors", async () => {
  const f = fixture();
  try {
    for (const mode of ["missing-model", "wrong-model", "malformed-model", "research", "malformed-research", "wrong-response"] as const) {
      let calls = 0;
      const adapter = definitionScopeDiscoveryAdapter({ async analyze(_project, options) {
        calls++; assert.equal(options.research, false);
        if (mode === "malformed-model") try { options.onTelemetry({} as any); } catch { /* A later valid callback must not erase this violation. */ }
        if (mode === "malformed-research") try { options.onResearch(undefined as any); } catch { /* Deliberately swallowed. */ }
        if (mode !== "missing-model") try { options.onTelemetry({ actualModel: { providerID: "openai", modelID: mode === "wrong-model" ? "different" : "fixture" }, usage: null, runtimeReportedCost: null }); } catch { /* Deliberately swallowed. */ }
        if (mode === "research") try { options.onResearch([{ url: "https://example.invalid", excerpt: "unrequested", retrievedAt: "now", kind: "fetched-page" }]); } catch { /* Deliberately swallowed. */ }
        return { ...reply(f.packet.scope.scopeKey, f.packet.contextKey, f.packet.scope.recordIDs[0]!), ...(mode === "wrong-response" ? { scopeKey: "0".repeat(64) } : {}) };
      } });
      await assert.rejects(adapter.review(f.packet, f.options)); assert.equal(calls, 1);
    }
    let calls = 0;
    const adapter = definitionScopeDiscoveryAdapter({ async analyze() { calls++; assert.fail("Invalid preflight cannot dispatch"); } });
    await assert.rejects(adapter.review(f.packet, { ...f.options, model: { ...f.p.model, modelID: "different" } }));
    const omitted = structuredClone(f.packet); omitted.context.evidence.sources = [];
    await assert.rejects(adapter.review(omitted, f.options)); assert.equal(calls, 0);
  } finally { f.store.close(); }
});

test("direct scope preflight rejects scan/research/help and changed contexts before touching accounts or legacy adapters", () => {
  const f = fixture(fakeAccount.id); let auth = 0, fallback = 0;
  const manager = { withAccount() { auth++; assert.fail("Invalid scope cannot read credentials"); } } as unknown as ConnectionManager;
  const connected = new ConnectedDiscovery(manager, { async analyze() { fallback++; assert.fail("Invalid scope cannot fall back"); } });
  try {
    const options = discoveryOptions(f);
    for (const changes of [{ scan: true }, { research: true }]) assert.throws(() => connected.analyze(f.p, { ...options, ...changes }), /scan or research/);
    const altered = structuredClone(options.context); altered.manifest.includedIDs = [];
    assert.throws(() => connected.analyze(f.p, { ...options, context: altered }), /exact complete/);
    assert.throws(() => connected.clarify(f.p, { questionID: "unused", action: "rephrase" }, options), /question-help/);
    const runtime = new OpenCodeDiscovery("unused", async () => { assert.fail("Invalid help profile cannot start a runtime"); });
    assert.throws(() => runtime.clarify(f.p, { questionID: "unused", action: "rephrase" }, options), /question-help/);
    assert.equal(auth, 0); assert.equal(fallback, 0);
  } finally { f.store.close(); }
});

test("legacy OpenCode selection does not touch app-owned direct credentials when routed through the scope bridge", async () => {
  const f = fixture(); let auth = 0, legacy = 0;
  const manager = { withAccount() { auth++; assert.fail("Legacy selections must not read direct credentials"); } } as unknown as ConnectionManager;
  const connected = new ConnectedDiscovery(manager, { async analyze(project, options) {
    legacy++; assert.deepEqual(project.model, f.p.model); assert.equal(options.research, false);
    options.onTelemetry({ actualModel: { providerID: "openai", modelID: "fixture" }, usage: null, runtimeReportedCost: null });
    return reply(f.packet.scope.scopeKey, f.packet.contextKey, f.packet.scope.recordIDs[0]!);
  } });
  try {
    const result = await new DefinitionScopeReviewService(f.store, definitionScopeDiscoveryAdapter(connected)).review(f.p.id, f.input);
    assert.equal(result.job.status, "completed"); assert.equal(legacy, 1); assert.equal(auth, 0);
  } finally { f.store.close(); }
});

for (const mode of ["success", "tool", "wrong-model", "bad-json", "cancel"] as const) test(`OpenCode scope adapter ${mode}: one owned-runtime attempt, deny tools, exact model, bounded cleanup`, { timeout: 5000 }, async () => {
  const f = fixture(); let starts = 0, prompts = 0, closes = 0, aborts = 0;
  let releasePrompt: (() => void) | undefined, closed!: () => void;
  const cleanup = new Promise<void>((resolve) => { closed = resolve; });
  const controller = new AbortController();
  const factory = (async (...[model, workspace, signal, research]: Parameters<typeof startRuntime>) => {
    starts++; assert.equal(model, "openai/fixture"); assert.equal(workspace, "scope-workspace"); assert.equal(research, false); assert.ok(signal);
    const client = {
      provider: { list: async () => ({ data: { connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] } }) },
      session: {
        create: async (input: any) => { assert.deepEqual(input.permission, [{ permission: "*", pattern: "*", action: "deny" }]); return { data: { id: "owned-session" } }; },
        abort: async () => { aborts++; return {}; },
        prompt: async (input: any) => {
          prompts++; assert.deepEqual(input.model, { providerID: "openai", modelID: "fixture" }); assert.ok(Object.values(input.tools).every((value) => value === false));
          const prompt = input.parts[0].text; assert.ok(prompt.includes("SCOPED DEFINITION REVIEW ONLY"));
          if (mode === "cancel") {
            controller.abort(); return new Promise((resolve) => { releasePrompt = () => resolve({ data: { info: { providerID: "openai", modelID: "fixture" }, parts: [{ type: "text", text: JSON.stringify(fromPrompt(prompt, f.p.sources[0]!.id)) }] } }); });
          }
          const text = mode === "bad-json" ? "Not JSON" : JSON.stringify(fromPrompt(prompt, f.p.sources[0]!.id));
          return { data: { info: { providerID: "openai", modelID: mode === "wrong-model" ? "different" : "fixture" },
            parts: mode === "tool" ? [{ type: "tool", id: "unexpected-tool", tool: "shell", state: { status: "completed", input: {}, output: "not accepted" } }, { type: "text", text }] : [{ type: "text", text }] } };
        },
      },
      event: { subscribe: async () => ({ stream: (async function* () {})() }) },
    };
    return { client, directory: "scope-workspace", close: async () => { closes++; closed(); } };
  }) as unknown as typeof startRuntime;
  try {
    const service = new DefinitionScopeReviewService(f.store, definitionScopeDiscoveryAdapter(new OpenCodeDiscovery("scope-workspace", factory)));
    const result = await service.review(f.p.id, f.input, { signal: controller.signal });
    assert.equal(result.job.status, mode === "success" ? "completed" : mode === "cancel" ? "cancelled" : "failed");
    assert.equal(starts, 1); assert.equal(prompts, 1); assert.deepEqual(f.store.get(f.p.id), f.p);
    if (mode === "cancel") {
      assert.equal(result.run.response, undefined); assert.equal(aborts, 1);
      assert.ok(releasePrompt); releasePrompt(); await cleanup; assert.equal(closes, 1);
      assert.deepEqual(f.store.definitionScopeReview(result.job.id), result.run, "Late provider output cannot checkpoint after cancellation");
    } else assert.equal(closes, 1);
    if (mode === "success") { await service.review(f.p.id, f.input); assert.equal(prompts, 1); }
  } finally { f.store.close(); }
});

function sse(events: unknown[]) { return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } }); }

for (const mode of ["success", "tool-event", "tool-item", "tool-inventory", "missing-inventory", "wrong-text", "wrong-model", "unlisted", "http-error", "disconnected"] as const)
  test(`direct scope adapter ${mode}: selected account only, explicit no-tools, no fallback or secret leakage`, async () => {
    const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "scope-adapter-auth-"));
    const credentials = new CredentialStore(directory, { seal: async (value) => value, open: async (value) => value });
    await credentials.transaction(async (state) => { if (mode !== "disconnected") state.accounts.push(fakeAccount); }, AbortSignal.timeout(5000));
    const f = fixture(fakeAccount.id); let requests = 0, fallback = 0;
    const request = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/models")) return Response.json({ models: [{ slug: mode === "unlisted" ? "different" : "fixture", display_name: "Fixture", visibility: "list" }] });
      assert.ok(String(url).endsWith("/responses"), "Unexpected auth/network route"); requests++;
      assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${fakeAccount.accessToken}`);
      const body = JSON.parse(String(init?.body)); assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, "none"); assert.equal(body.parallel_tool_calls, false);
      assert.equal(body.model, "fixture"); assert.equal(body.store, false);
      if (mode === "http-error") return new Response(fakeAccount.accessToken, { status: 429 });
      const text = JSON.stringify(fromPrompt(body.input[0].content, f.p.sources[0]!.id));
      const output: unknown[] = [{ type: "reasoning", id: "reasoning" }, { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: mode === "wrong-text" ? "Different final text" : text }] }];
      if (mode === "tool-inventory") output.push({ type: "web_search_call", id: "unexpected" });
      const events: unknown[] = [];
      if (mode === "tool-event") events.push({ type: "response.function_call_arguments.delta", delta: "{}" });
      if (mode === "tool-item") events.push({ type: "response.output_item.added", item: { type: "future_tool_call", id: "unexpected" } });
      events.push({ type: "response.output_text.delta", delta: text }, { type: "response.completed", response: { id: "fixture-response", model: mode === "wrong-model" ? "different" : "fixture", status: "completed", ...(mode === "missing-inventory" ? {} : { output }) } });
      return sse(events);
    }) as typeof fetch;
    const manager = new ConnectionManager(credentials, request);
    try {
      const connected = new ConnectedDiscovery(manager, { async analyze() { fallback++; assert.fail("A direct scope task cannot silently switch to OpenCode"); } }, request);
      const service = new DefinitionScopeReviewService(f.store, definitionScopeDiscoveryAdapter(connected));
      const result = await service.review(f.p.id, f.input);
      assert.equal(result.job.status, mode === "success" ? "completed" : "failed"); assert.equal(requests, ["disconnected", "unlisted"].includes(mode) ? 0 : 1); assert.equal(fallback, 0);
      assert.deepEqual(f.store.get(f.p.id), f.p);
      const saved = JSON.stringify({ project: f.store.get(f.p.id), jobs: f.store.jobs(f.p.id), run: result.run });
      for (const secret of [fakeAccount.accessToken, fakeAccount.refreshToken, fakeAccount.idToken]) assert.equal(saved.includes(secret), false);
      if (mode === "success") { await service.review(f.p.id, f.input); assert.equal(requests, 1); }
    } finally { await manager.close(); f.store.close(); rmSync(directory, { recursive: true, force: true }); }
  });

test("adding the provider bridge preserves completed injected-pilot evidence without requalification calls or new metadata", async () => {
  const f = fixture();
  try {
    const original = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet.scope.scopeKey, packet.contextKey, packet.scope.recordIDs[0]!); } }).review(f.p.id, f.input);
    assert.equal(original.job.status, "completed"); const jobs = f.store.jobs(f.p.id), run = f.store.definitionScopeReview(original.job.id);
    const bridged = new DefinitionScopeReviewService(f.store, definitionScopeDiscoveryAdapter({ async analyze() { assert.fail("Compatible adapter wiring cannot repeat completed work"); } }));
    const reused = await bridged.review(f.p.id, f.input); assert.equal(reused.reused, true); assert.deepEqual(reused.run, run);
    assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.equal(reused.run.result!.authority, "validated-output-only");
    assert.equal(reused.run.result!.canPublish, false); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.store.close(); }
});
