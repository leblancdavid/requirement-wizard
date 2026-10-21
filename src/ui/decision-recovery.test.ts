import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectSchema, reviewFingerprint, type Submission } from "../core/model.js";
import { decisionAvailability } from "../core/decision-availability.js";
import { ItemProcessingNotice, RetainedReviewNotice } from "./decision-recovery.js";
import { ReviewQueue, pendingReviews } from "./review.js";
import { AttentionInbox, attentionGroups, attentionSummary } from "./attention.js";

test("item errors show saved diagnostics and distinguish follow-up retry from decision conflicts", () => {
  const { submission } = fixture();
  const conflict = renderToStaticMarkup(createElement(ItemProcessingNotice, { submission, resume: () => assert.fail("No automatic retry") }));
  assert.match(conflict, /role="alert"/);
  assert.match(conflict, /Answer the linked clarification/);
  assert.match(renderToStaticMarkup(createElement(ItemProcessingNotice, { submission, error: "" })), /Answer the linked clarification/);
  assert.ok(!conflict.includes("Resume discovery"));
  submission.conflict = false; submission.applied = true;
  const failed = renderToStaticMarkup(createElement(ItemProcessingNotice, { submission, resume: () => {} }));
  assert.match(failed, /Resume discovery/);
  assert.match(failed, /without submitting it again/);
  submission.status = "completed";
  assert.equal(renderToStaticMarkup(createElement(ItemProcessingNotice, { submission })), "");
  assert.match(renderToStaticMarkup(createElement(ItemProcessingNotice, { error: "Request failed; draft retained" })), /Request failed; draft retained/);
});

test("default Review card contains failed review diagnostic, clarification navigation and retained note", () => {
  const { project, submission } = fixture();
  project.questions[0]!.status = "pending";
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project, submissions: [submission], epicID: "all", sending: [], disabled: false,
    submit: async () => { assert.fail("Rendering must not submit"); }, refine: () => {}, reviewRefinement: async () => false, openQuestion: () => {} }));
  assert.match(html, /Item processing error/);
  assert.match(html, /Open blocking clarification in Design/);
  assert.match(html, /Keep my exact note/);
  project.requirements[0]!.status = "accepted"; submission.applied = true; submission.conflict = false;
  assert.equal(pendingReviews(project, [submission]).length, 1, "Failed follow-up stays discoverable on the default list");
  submission.status = "completed";
  assert.equal(pendingReviews(project, [submission]).length, 0);
});

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

test("retained change requests recover feedback without presenting it as approval or rejection", () => {
  const { project, submission } = fixture();
  if (submission.input.type === "review") submission.input.action = "changes-requested";
  project.questions[0]!.status = "pending";
  const html = renderToStaticMarkup(createElement(RetainedReviewNotice, { project, submissions: [submission], submission, reviewCurrent: () => {} }));
  assert.match(html, /change request has not been applied/);
  assert.match(html, /Review current requirement with saved feedback/);
  assert.ok(!html.includes("saved decision has not been applied"));
  const queue = renderToStaticMarkup(createElement(ReviewQueue, { project, submissions: [submission], epicID: "all", sending: [], disabled: false, submit: async () => false, refine: () => {}, reviewRefinement: async () => false }));
  assert.match(queue, /Request changes/);
  assert.match(queue, /<textarea[^>]*><\/textarea>/, "Change-request feedback must not prefill approval/rejection notes");
});

test("attention inbox groups stable targets, preserves distinct notes and shows current rather than historical blockers", () => {
  const { project, submission } = fixture();
  const repeated = { ...structuredClone(submission), id: "repeat" };
  const otherProject = { ...structuredClone(submission), id: "foreign", projectID: "another" };
  const archived: Submission = { ...structuredClone(submission), id: "archived", status: "superseded", archivedAt: "2026-10-21T12:00:00Z" };
  const items = [submission, repeated, otherProject, archived];
  const before = structuredClone(items);
  assert.equal(attentionGroups(project, items).length, 1);
  assert.deepEqual(attentionGroups(project, items)[0]!.attempts.map((s) => s.id), [submission.id, repeated.id]);
  assert.match(attentionSummary(project, items, repeated)!, /earlier blocker has cleared/);
  const html = renderToStaticMarkup(createElement(AttentionInbox, { project, submissions: items, open: () => assert.fail("Explicit action required") }));
  assert.equal((html.match(/View &amp; resolve/g) ?? []).length, 1);
  assert.match(html, /2 saved attempts/);
  assert.ok(!html.includes("Answer the linked clarification in Design"));
  project.questions[0]!.status = "pending";
  assert.match(attentionSummary(project, items, repeated)!, /Which behavior should be preserved/);
  assert.deepEqual(items, before, "Grouping never rewrites or drops human notes");
});

test("focused recovery opens the exact reviewed requirement beyond 600 items regardless of feature and status filters", () => {
  const { project, submission } = fixture();
  const target = project.requirements[0]!;
  target.status = "accepted";
  project.requirements = [...Array.from({ length: 650 }, (_, i) => ({ ...target, id: `other-${i}`, statement: `Other reviewed behavior ${i}` })), target];
  project.questions[0]!.status = "pending";
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project, submissions: [submission], epicID: "unrelated", focusRequirementID: target.id, sending: [], disabled: false,
    submit: async () => assert.fail("Rendering must not submit"), refine: () => {}, reviewRefinement: async () => false, renderClarification: (q) => createElement("p", {}, `Inline answer: ${q.text}`) }));
  assert.match(html, /Requested behavior/);
  assert.match(html, /Observable outcome/);
  assert.match(html, /Inline answer: Which behavior should be preserved/);
  assert.ok(!html.includes("Other reviewed behavior"));
  assert.ok(!html.includes("Review filters"));
  assert.ok(!html.includes("Item processing error"), "Old failure text is history, not the current blocker");
  assert.match(html, /Current blocker:/);
});

test("attention paging bounds large inboxes and never merges different IDs with identical text", () => {
  const { project, submission } = fixture();
  const items = Array.from({ length: 600 }, (_, index): Submission => ({ ...submission, id: `attempt-${index}`, input: { ...submission.input, type: "review", requirementID: `requirement-${index}`, requirementText: "Identical wording", fingerprint: "legacy", action: "accepted", note: "" } }));
  assert.equal(attentionGroups(project, items).length, 600);
  const html = renderToStaticMarkup(createElement(AttentionInbox, { project, submissions: items, open: () => {} }));
  assert.match(html, /600 items/);
  assert.equal((html.match(/View &amp; resolve/g) ?? []).length, 25);
});
