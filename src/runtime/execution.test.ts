import assert from "node:assert/strict";
import test from "node:test";
import { OpenCodeExecution, type ExecutionRequest } from "./execution.js";
import type { startRuntime } from "./server.js";
import { executionConfigSchema } from "../core/execution.js";
import { ExecutionContextError } from "../core/execution-context.js";
import { assessmentSkill, executionSkill, implementationSkill } from "../core/execution-skills.js";
import { resolve } from "node:path";
import { executionPermissions } from "./skills.js";

const config = executionConfigSchema.parse({ repository: "fixture/repository", strategy: "requirement-pr", branch: "build", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
function request(extra: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return { directory: "unused", config, coding: true, requirementID: "r1", prompt: "Reqwizit task r1/attempt\nImplement only r1", signal: new AbortController().signal, onSession: () => {}, onProgress: () => {}, ...extra };
}
function runtime(messages: unknown[] = [], options: { coding?: boolean; planning?: boolean; missing?: boolean; loaded?: boolean; versionMismatch?: boolean; permissions?: ReturnType<typeof executionPermissions> } = {}) {
  const skill = executionSkill(options.coding ?? true, options.planning), skillPath = resolve("fixture-skills", skill.name, "SKILL.md");
  const calls = { starts: 0, prompts: 0, creates: 0, closes: 0, permissions: [] as unknown[], toolMaps: [] as Record<string, boolean>[], updates: 0 };
  const factory = async () => {
    calls.starts++;
    return { directory: "unused", skillPath, close: async () => { calls.closes++; }, client: {
      app: { skills: async () => ({ data: options.missing ? [] : [{ ...skill, location: skillPath, content: options.versionMismatch ? "Old skill" : skill.body }] }) },
      provider: { list: async () => ({ data: { connected: ["openai"], all: [{ id: "openai", models: { fixture: {} } }] } }) },
      session: {
        get: async () => ({ data: { id: "saved-session", permission: options.permissions ?? [] } }), messages: async () => ({ data: [...messages, ...(calls.prompts && options.loaded !== false ? [{ parts: [{ type: "tool", tool: "skill", state: { status: "completed", input: { name: skill.name }, output: skill.body } }] }] : [])] }),
        update: async () => { calls.updates++; return {}; },
        create: async (input: { permission: unknown }) => { calls.permissions.push(input.permission); return { data: { id: `session-${++calls.creates}` } }; },
        prompt: async (input: { tools: Record<string, boolean> }) => { calls.toolMaps.push(input.tools); calls.prompts++; return { data: { info: { providerID: "openai", modelID: "fixture" }, parts: [{ type: "text", text: '{"outcome":"complete","summary":"Done"}' }] } }; },
      },
      event: { subscribe: async () => ({ stream: (async function* () {})() }) }, tool: { ids: async () => ({ data: ["skill", "read", "bash", "task", "webfetch"] }) },
    } };
  };
  return { calls, adapter: new OpenCodeExecution(factory as unknown as typeof startRuntime) };
}

test("oversized full prompts block before starting a runtime or creating a session", async () => {
  const { calls, adapter } = runtime();
  await assert.rejects(adapter.perform(request({ prompt: "x".repeat(48000) })), ExecutionContextError);
  assert.equal(calls.starts, 0); assert.equal(calls.prompts, 0); assert.equal(calls.creates, 0);
});

test("planning has a distinct read-only skill and rejects coding or resumed sessions", async () => {
  const { calls, adapter } = runtime([], { coding: false, planning: true });
  await adapter.perform(request({ coding: false, planning: true, prompt: "Propose a dependency plan" }));
  assert.deepEqual(calls.toolMaps[0], { skill: true, read: false, bash: false, task: false, webfetch: false });
  assert.deepEqual(calls.permissions[0], executionPermissions(false, true));
  await assert.rejects(adapter.perform(request({ planning: true })), /fresh read-only/);
  await assert.rejects(adapter.perform(request({ coding: false, planning: true, sessionID: "old" })), /fresh read-only/);
  await assert.rejects(adapter.perform(request({ coding: false, planning: true, prompt: "x".repeat(48000) })), ExecutionContextError);
  assert.equal(calls.starts, 1);
});

test("resumed requirement transcripts count toward preflight and cannot grow silently beyond the budget", async () => {
  const { calls, adapter } = runtime([{ info: { role: "user" }, parts: [{ type: "text", text: "old tool/code history".repeat(5000) }] }]);
  await assert.rejects(adapter.perform(request({ sessionID: "saved-session" })), (error) => error instanceof ExecutionContextError && error.context.historyCharacters > 48000);
  assert.equal(calls.prompts, 0); assert.equal(calls.creates, 0); assert.equal(calls.closes, 1);
});

test("completed matching task responses recover without replay, even when retained history is large", async () => {
  const messages = [
    { info: { role: "user" }, parts: [{ type: "text", text: "older history".repeat(5000) }] },
    { info: { role: "user" }, parts: [{ type: "text", text: "Reqwizit task r1/attempt\nImplement only r1" }] },
    { info: { role: "assistant", providerID: "openai", modelID: "fixture", time: { completed: 1 } }, parts: [{ type: "text", text: '{"outcome":"complete","summary":"Already done"}' }] },
  ];
  const { calls, adapter } = runtime(messages);
  const response = await adapter.perform(request({ sessionID: "saved-session" }));
  assert.equal(JSON.parse(response).summary, "Already done"); assert.equal(calls.prompts, 0); assert.equal(calls.creates, 0); assert.equal(calls.closes, 1);
});

test("fresh requirements create fresh sessions rather than sharing a growing conversation", async () => {
  const { calls, adapter } = runtime(), sessions: string[] = [];
  await adapter.perform(request({ onSession: (id) => sessions.push(id) }));
  await adapter.perform(request({ requirementID: "r2", prompt: "Reqwizit task r2/attempt\nImplement only r2", onSession: (id) => sessions.push(id) }));
  assert.deepEqual(sessions, ["session-1", "session-2"]); assert.equal(calls.prompts, 2); assert.equal(calls.closes, 2);
});

test("a saved session containing another requirement's task marker cannot be resumed", async () => {
  const { calls, adapter } = runtime([{ info: { role: "user" }, parts: [{ type: "text", text: "Reqwizit task run/r-other/attempt\nAn unrelated task" }] }]);
  await assert.rejects(adapter.perform(request({ sessionID: "foreign-session" })), /belongs to another requirement/);
  assert.equal(calls.prompts, 0); assert.equal(calls.creates, 0); assert.equal(calls.closes, 1);
});

test("skills are role-scoped, assessment gains no source/tools access, and missing or unconsumed skills cannot complete", async () => {
  for (const coding of [false, true]) {
    const { calls, adapter } = runtime([], { coding });
    await adapter.perform(request({ coding }));
    const name = coding ? implementationSkill.name : assessmentSkill.name;
    assert.ok((calls.permissions[0] as { permission: string; pattern: string; action: string }[]).some((p) => p.permission === "skill" && p.pattern === name && p.action === "allow"));
    assert.deepEqual(calls.toolMaps[0], { skill: true, read: coding, bash: coding, task: false, webfetch: false });
  }
  for (const options of [{ missing: true }, { versionMismatch: true }, { loaded: false }]) {
    const { calls, adapter } = runtime([], options);
    await assert.rejects(adapter.perform(request()), /skill/);
    assert.equal(calls.prompts, options.loaded === false ? 1 : 0);
    assert.equal(calls.closes, 1);
  }
  const resumed = runtime();
  await resumed.adapter.perform(request({ sessionID: "saved-session" }));
  assert.equal(resumed.calls.updates, 1, "Resuming a pre-skill session explicitly refreshes its permissions");
  const alreadyScoped = runtime([], { permissions: executionPermissions(true) });
  await alreadyScoped.adapter.perform(request({ sessionID: "saved-session" }));
  assert.equal(alreadyScoped.calls.updates, 0, "Repeated resumes do not append duplicate permission profiles");
});
