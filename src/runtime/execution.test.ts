import assert from "node:assert/strict";
import test from "node:test";
import { OpenCodeExecution, type ExecutionRequest } from "./execution.js";
import type { startRuntime } from "./server.js";
import { executionConfigSchema } from "../core/execution.js";
import { ExecutionContextError } from "../core/execution-context.js";

const config = executionConfigSchema.parse({ repository: "fixture/repository", strategy: "requirement-pr", branch: "build", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
function request(extra: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return { directory: "unused", config, coding: true, requirementID: "r1", prompt: "Reqwizit task r1/attempt\nImplement only r1", signal: new AbortController().signal, onSession: () => {}, onProgress: () => {}, ...extra };
}
function runtime(messages: unknown[] = []) {
  const calls = { starts: 0, prompts: 0, creates: 0, closes: 0 };
  const factory = async () => {
    calls.starts++;
    return { directory: "unused", close: async () => { calls.closes++; }, client: {
      provider: { list: async () => ({ data: { connected: ["openai"], all: [{ id: "openai", models: { fixture: {} } }] } }) },
      session: {
        get: async () => ({ data: { id: "saved-session" } }), messages: async () => ({ data: messages }),
        create: async () => ({ data: { id: `session-${++calls.creates}` } }),
        prompt: async () => { calls.prompts++; return { data: { info: { providerID: "openai", modelID: "fixture" }, parts: [{ type: "text", text: '{"outcome":"complete","summary":"Done"}' }] } }; },
      },
      event: { subscribe: async () => ({ stream: (async function* () {})() }) }, tool: { ids: async () => ({ data: [] }) },
    } };
  };
  return { calls, adapter: new OpenCodeExecution(factory as unknown as typeof startRuntime) };
}

test("oversized full prompts block before starting a runtime or creating a session", async () => {
  const { calls, adapter } = runtime();
  await assert.rejects(adapter.perform(request({ prompt: "x".repeat(48000) })), ExecutionContextError);
  assert.equal(calls.starts, 0); assert.equal(calls.prompts, 0); assert.equal(calls.creates, 0);
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
