import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectSchema, reviewFingerprint, type Submission } from "../core/model.js";
import { decisionAvailability } from "../core/decision-availability.js";
import { RetainedReviewNotice } from "./decision-recovery.js";

function fixture() {
  const project = projectSchema.parse({ id: "project", name: "Recovery", revision: 5, model: { providerID: "openai", modelID: "fixture" },
    summary: "Recovery", goals: [], actors: [], assumptions: [],
    sources: [{ id: "idea", kind: "initial", text: "Original idea" }],
    requirements: [{ id: "requirement", statement: "Requested behavior", rationale: "Human intent", sourceIDs: ["idea"], epicID: "inbox", acceptance: ["Observable outcome"], status: "proposed" }],
    questions: [{ id: "clarification", text: "Which behavior should be preserved?", whyItMatters: "Avoid guessing", epicID: "project", status: "answered", sourceID: "answer", evidenceIDs: ["requirement"], options: [{ label: "One", consequence: "First path" }, { label: "Two", consequence: "Second path" }] }],
  });
  const submission: Submission = { id: "old-review", projectID: project.id, status: "needs-attention", applied: false, conflict: true,
    submittedAt: "2026-10-20", auto: false, research: false,
    diagnostic: "Answer the linked clarification in Design and process its follow-up before applying this decision.",
    input: { type: "review", requirementID: "requirement", requirementText: "Requested behavior", fingerprint: reviewFingerprint(project.requirements[0]!), action: "accepted", note: "Keep my exact note\n" } };
  return { project, submission };
}

test("legacy failed review explains that answered clarification is no longer a blocker without applying or replaying anything", () => {
  const { project, submission } = fixture(), before = structuredClone({ project, submission });
  const html = renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission], submission,
    reviewCurrent: () => assert.fail("Rendering must not apply or resubmit decisions") }));
  assert.match(html, /earlier blocker is no longer active/);
  assert.match(html, /saved decision has not been applied/);
  assert.match(html, /Review current requirement with saved note/);
  assert.ok(!html.includes("Current blocker:"));
  assert.deepEqual({ project, submission }, before);
});

for (const status of ["pending", "deferred", "delegated"] as const) {
  test(`current ${status} clarification is named, linked, and still blocks the retained decision`, () => {
    const { project, submission } = fixture();
    project.questions[0]!.status = status;
    const availability = decisionAvailability(project, ["requirement"], [submission]);
    assert.deepEqual(availability.questionIDs, ["clarification"]);
    assert.match(availability.reason!, /Which behavior should be preserved/);
    assert.ok(availability.reason!.includes(status));
    const html = renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission], submission,
      reviewCurrent: () => {}, openQuestion: () => assert.fail("Navigation must be explicit") }));
    assert.match(html, /Current blocker:/);
    assert.match(html, /Open blocking clarification in Design/);
    assert.ok(!html.includes("earlier blocker is no longer active"));
  });
}

test("legacy rejection blocked by an unanswered clarification offers explicit retry with its retained note", () => {
  const { project, submission } = fixture();
  project.questions[0]!.status = "pending";
  if (submission.input.type === "review") submission.input.action = "rejected";
  const before = structuredClone({ project, submission });
  const html = renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission], submission,
    reviewCurrent: () => assert.fail("Retry must be explicit"), openQuestion: () => {} }));
  assert.match(html, /earlier blocker is no longer active/);
  assert.match(html, /saved decision has not been applied/);
  assert.match(html, /Review current requirement with saved note/);
  assert.ok(!html.includes("Open blocking clarification"));
  assert.deepEqual({ project, submission }, before);
});

test("resolved question does not hide a different unfinished input or changed requirement", () => {
  const { project, submission } = fixture();
  project.requirements[0]!.statement = "Updated behavior";
  const waiting: Submission = { id: "note", projectID: project.id, status: "saved", applied: true, submittedAt: "2026-10-20", auto: false, research: false,
    input: { type: "note", text: "A new constraint", epicID: "project" } };
  const html = renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission, waiting], submission, reviewCurrent: () => {} }));
  assert.match(html, /Current blocker: Process the pending human input/);
  assert.match(html, /requirement changed since this saved review/);
  assert.ok(!html.includes("earlier blocker is no longer active"));
});

test("applied reviews are never offered another-review recovery as if their decisions were unapplied", () => {
  const { project, submission } = fixture();
  submission.applied = true;
  assert.equal(renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission], submission, reviewCurrent: () => {} })), "");
});
