import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectSchema } from "../core/model.js";
import type { DefinitionReviewEntry } from "../core/definition-review-history.js";
import { DefinitionReviewAttempt, definitionReviewLabel } from "./definition-review-history.js";

const entry: DefinitionReviewEntry = { id: "saved-job", epicID: "project", revision: 10, status: "failed", latestForArea: false,
  diagnostic: "Original schema failure <script>not code</script> access_token=private-secret", blockReason: null,
  savedSteps: 0, batches: 4, attempts: 1, subdivisions: 0, interruptionCause: null, detailLimited: false };
const fixtureProject = () => projectSchema.parse({ id: "project", name: "Fixture", revision: 1, model: { providerID: "openai", modelID: "fixture" },
  sources: [], questions: [], requirements: [], summary: "Keep originals", goals: [], actors: [], assumptions: [] });

test("assessment outcomes distinguish failures, evidence blocks and pauses without replacing the original error", () => {
  assert.equal(definitionReviewLabel(entry), "Failed");
  assert.equal(definitionReviewLabel({ ...entry, blockReason: "Too large" }), "Evidence blocked");
  assert.equal(definitionReviewLabel({ ...entry, status: "interrupted", interruptionCause: "refresh-time-reserve" }), "Paused—progress saved");
  assert.equal(definitionReviewLabel({ ...entry, status: "completed" }), "Finished");
  const project = fixtureProject();
  const original = structuredClone(entry);
  const html = renderToStaticMarkup(createElement(DefinitionReviewAttempt, { entry, project }));
  assert.match(html, /Earlier attempt—history only/); assert.match(html, /Failure details/);
  assert.match(html, /Original schema failure &lt;script&gt;not code&lt;\/script&gt;/);
  assert.ok(!html.includes("private-secret")); assert.ok(!html.includes("<script>"));
  assert.match(html, /0 review steps saved/); assert.match(html, /1 of 3 attempts/);
  assert.deepEqual(entry, original);
});

test("missing historical details and bounded diagnostic previews are disclosed, not invented", () => {
  const project = fixtureProject();
  const html = renderToStaticMarkup(createElement(DefinitionReviewAttempt, { project, entry: { ...entry, diagnostic: null, attempts: null, savedSteps: null, latestForArea: true } }));
  assert.match(html, /Latest saved attempt/); assert.match(html, /No diagnostic was recorded/); assert.match(html, /Attempt count not recorded/);
  assert.ok(!html.includes("0 of 3"));
  const bounded = renderToStaticMarkup(createElement(DefinitionReviewAttempt, { project, entry: { ...entry, detailLimited: true } }));
  assert.match(bounded, /Display limited to 16,000/);
});
