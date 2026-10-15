import assert from "node:assert/strict";
import test from "node:test";
import { interpretation, positiveMilliseconds, safeMessage, selectModel } from "./contract.js";

test("diagnostics redact common credential formats", () => {
  const result = safeMessage('Bearer abc123 sk-example ghp_example access_token="secret"');
  for (const secret of ["abc123", "sk-example", "ghp_example", "secret"]) assert.equal(result.includes(secret), false);
});

test("rejects malformed model output rather than trusting the requested schema", () => {
  assert.equal(interpretation.safeParse({ summary: "A job app", assumptions: [], questions: [] }).success, false);
  assert.equal(interpretation.safeParse({ summary: "A job app", assumptions: [], questions: [
    { question: "Who uses it?", whyItMatters: "Determines permissions", options: ["Owner", "Team"] },
  ] }).success, true);
});

test("does not fall back to an unconnected provider or an unknown model", () => {
  const catalog = { all: [{ id: "openai", models: { example: {} } }], connected: ["openai"] };
  assert.deepEqual(selectModel(catalog, "openai", "example"), { providerID: "openai", modelID: "example" });
  assert.throws(() => selectModel(catalog, "github-copilot", "example"), /not connected/);
  assert.throws(() => selectModel(catalog, "openai", "missing"), /unavailable/);
  assert.throws(() => selectModel(catalog, "openai", "toString"), /unavailable/);
});

test("bounded timeouts reject invalid or unbounded waits", () => {
  for (const value of ["0", "-1", "NaN", "Infinity", "1.5", "600001"]) {
    assert.throws(() => positiveMilliseconds(value, "timeout"));
  }
  assert.equal(positiveMilliseconds("120000", "timeout"), 120000);
});
