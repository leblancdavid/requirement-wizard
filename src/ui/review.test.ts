import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema, reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { DuplicateRemovalForm, ReviewQueue, reviewItems } from "./review.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pageWindow, PagedList } from "./pagination.js";
import { ReviewUpdateNotice } from "./review-update.js";
import { GapExplorationStatus } from "./gap-status.js";
import type { Job } from "../core/model.js";
import { searchPrefixAuxEvidence } from "../core/gap-prefix-aux.js";
import { planGapContext } from "../core/gap-context.js";

test("gap backlog status distinguishes saved checks, unresolved decisions and no-call reuse without a completeness claim", () => {
  const job: Job = { id: "gap-job", projectID: "project", expectedRevision: 1, model: { providerID: "openai", modelID: "fixture" },
    status: "completed", leaseUntil: null, gapReport: { format: 1, state: "idle", checked: 2, pending: 0, waiting: 1, blocked: 1,
      total: 4, modelCalls: 0, explanation: "Bounded task checks are not proof of completeness." } };
  const before = structuredClone(job), html = renderToStaticMarkup(createElement(GapExplorationStatus, { job }));
  assert.match(html, /Gap exploration backlog/); assert.match(html, /2 checked/); assert.match(html, /waiting for decisions/);
  assert.match(html, /No model request made/); assert.match(html, /not live completeness/); assert.match(html, /not proof of completeness/);
  assert.ok(!html.includes("100%")); assert.deepEqual(job, before);
});

test("pilot status distinguishes requested default from saved experimental policy and explains bounded auxiliary omissions", () => {
  const p = fixture(), context = planGapContext(p, [], "inbox");
  const request = { searchEvidence: { format: 1 as const, query: "gameplay", limit: 2 } };
  const result = searchPrefixAuxEvidence(p, context, request);
  const job: Job = { id: "pilot-job", projectID: p.id, expectedRevision: p.revision, model: p.model, status: "failed", leaseUntil: null,
    gapReport: { format: 1, state: "planned", checked: 0, pending: 3, waiting: 0, blocked: 0, total: 3, modelCalls: 1, explanation: "Not proof of completeness." },
    retrievalWork: { format: 1, research: false, requestedPolicy: "prefix", attempts: 1, stages: [{ revision: p.revision,
      contextKey: "0".repeat(64), includedIDs: context.manifest.includedIDs, request, searchResult: result }] } };
  const before = structuredClone(job), html = renderToStaticMarkup(createElement(GapExplorationStatus, { job }));
  assert.match(html, /Requested for new searches in this job: Default prefix search/);
  assert.match(html, /Saved policy: Experimental prefix-preserving auxiliary merge/);
  assert.match(html, /1,000,000 scan characters/); assert.match(html, /auxiliary records text-limited/);
  assert.match(html, /Zero omissions is not proof/); assert.match(html, /No candidate continuation offered/);
  assert.match(html, /96,000-character evidence cap/); assert.deepEqual(job, before);
});

test("page windows bound large lists and clamp empty, negative and shortened pages", () => {
  assert.deepEqual(pageWindow(500, 25, 25), { page: 1, pages: 20, start: 25, end: 50 });
  assert.deepEqual(pageWindow(26, 499, 25), { page: 1, pages: 2, start: 25, end: 26 });
  assert.deepEqual(pageWindow(0, 25, 25), { page: 0, pages: 1, start: 0, end: 0 });
  assert.equal(pageWindow(100, -25, 10).start, 0);
  assert.equal(pageWindow(101, 100, 50).end, 101);
});

test("secondary histories only render the first 25 rows without changing saved items", () => {
  const items = Array.from({ length: 500 }, (_, id) => ({ id: String(id) }));
  const html = renderToStaticMarkup(createElement(PagedList<{ id: string }>, { items, itemID: (item) => item.id, label: "History", children: (item) => createElement("article", null, item.id) }));
  assert.equal((html.match(/<article>/g) ?? []).length, 25);
  assert.match(html, /1–25 of 500/);
  assert.match(html, /Page 1 of 20/);
  assert.equal(items.length, 500);
});

function fixture(): Project {
  const project = projectSchema.parse({ id: "project", name: "Game", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    sources: [{ id: "idea", kind: "initial", text: "A game" }], questions: [], summary: "Game", goals: [], actors: [], assumptions: [],
    requirements: ["jump", "aim", "pause"].map((id, index) => ({ id, statement: `Behavior ${id}`, rationale: "Gameplay", sourceIDs: ["idea"], epicID: "inbox", acceptance: ["Observable outcome"], status: index ? "proposed" : "accepted" })),
  });
  project.refinements = project.requirements.slice(0, 2).map((r) => ({ id: `cleanup-${r.id}`, requirementID: r.id, original: structuredClone(r),
    fingerprint: reviewFingerprint(r), status: "pending", statement: `Refined ${r.id}`, rationale: "Observable behavior", acceptance: ["Behavior is preserved"], reason: "Abstracted code", createdAtRevision: 1 }));
  return project;
}

test("Review uses Refine as the single duplicate/conflict workflow without running it on render", () => {
  const p = fixture(), before = structuredClone(p);
  let calls = 0;
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => { calls++; }, submit: async () => true, reviewRefinement: async () => true }));
  assert.match(html, /Refine requirements/);
  assert.match(html, /possible duplicates\/conflicts/);
  assert.ok(!html.includes("Check approved requirements for duplicates and conflicts"));
  assert.ok(!html.includes("Approved requirement audit"));
  assert.equal(calls, 0);
  assert.deepEqual(p, before);
});

test("requirement review places duplicate removal after Reject in the same button row", () => {
  const p = fixture();
  p.refinements = [];
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => {}, submit: async () => true, reviewRefinement: async () => true, removeDuplicate: async () => true }));
  assert.match(html, /<div class="button-row"><button[^>]*>Approve<\/button><button[^>]*>Reject<\/button><button[^>]*>Remove as duplicate…<\/button><\/div>/);
});

test("refinement review places duplicate removal next to the keep action in the same button row", () => {
  const p = fixture();
  p.requirements = p.requirements.filter((r) => r.id !== "pause");
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => {}, submit: async () => true, reviewRefinement: async () => true, removeDuplicate: async () => true }));
  assert.match(html, /<div class="button-row"><button[^>]*>Approve refinement<\/button><button[^>]*>Keep current wording<\/button><button[^>]*>Remove as duplicate…<\/button><\/div>/);
});

test("Review bounds a 500-item pending list without limiting its counts or mutating evidence", () => {
  const p = fixture();
  p.refinements = [];
  p.requirements = Array.from({ length: 500 }, (_, index) => ({ ...p.requirements[1]!, id: `pending-${index}`, statement: `Pending behavior ${index}` }));
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => assert.fail("Paging must not invoke a model"), submit: async () => true, reviewRefinement: async () => true }));
  assert.equal((html.match(/class="question-card review-card"/g) ?? []).length, 25);
  assert.match(html, /1–25 of 500/);
  assert.ok(!html.includes("Pending behavior 25<"));
  assert.deepEqual(p, before);
});

test("unified review includes approved-target refinements without duplicating their pending original and restores the original after dismissal", () => {
  const p = fixture();
  assert.deepEqual(reviewItems(p, [], "pending").map((item) => item.id), ["requirement:pause", "refinement:cleanup-jump", "refinement:cleanup-aim"]);
  assert.equal(p.requirements[0]!.status, "accepted");
  assert.equal(reviewItems(p, [], "refinements").length, 2);
  assert.equal(reviewItems(p, [], "pending", "project").length, 0);
  p.refinements[1]!.status = "dismissed";
  assert.ok(reviewItems(p, [], "pending").some((item) => item.id === "requirement:aim"));
  p.refinements[0]!.status = "accepted";
  assert.equal(reviewItems(p, [], "refinements").length, 0);
  assert.deepEqual(reviewItems(p, [], "reviewed").filter((item) => item.kind === "refinement").map((item) => item.refinement.status), ["accepted", "dismissed"]);
});

test("stale cleanup does not hide changed requirements or pending review submissions", () => {
  const p = fixture();
  p.requirements[1]!.statement = "Changed aim behavior";
  assert.ok(reviewItems(p, [], "pending").some((item) => item.id === "requirement:aim"));
  const waiting: Submission = { id: "submission", projectID: p.id, status: "queued", applied: false, auto: false, research: false, submittedAt: "2026-01-01", input: {
    type: "review", requirementID: "aim", requirementText: p.requirements[1]!.statement, fingerprint: reviewFingerprint(p.requirements[1]!), action: "accepted", note: "",
  } };
  assert.ok(!reviewItems(p, [waiting], "pending").some((item) => item.id === "requirement:aim"));
  assert.ok(reviewItems(p, [waiting], "pending").some((item) => item.id === "refinement:cleanup-aim"));
  assert.equal(reviewItems(p, [waiting], "submitted").length, 0, "submitted records use their separate durable submission list");
});

test("outdated proposals expose explicit dismissal, targeted refresh and human duplicate removal without inference", () => {
  const p = fixture();
  p.requirements = p.requirements.filter((r) => r.id !== "pause");
  p.requirements[0]!.statement = "Current jump wording";
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => assert.fail("No model calls on render"), refreshRefinement: () => assert.fail("No refresh on render"),
    removeDuplicate: async () => assert.fail("No decisions on render"), submit: async () => true, reviewRefinement: async () => true }));
  assert.match(html, /Dismiss outdated proposal/);
  assert.match(html, /Refresh this requirement/);
  assert.match(html, /Remove as duplicate/);
  assert.match(html, /No full refinement run is needed/);
  const form = renderToStaticMarkup(createElement(DuplicateRemovalForm, { project: p, removeID: "aim", keepID: "jump", disabled: false,
    save: async () => assert.fail("No automatic removal"), close: () => {} }));
  assert.match(form, /Current jump wording/);
  assert.match(form, /Confirm removal as duplicate/);
  assert.match(form, /survivor will not be rewritten/);
  assert.deepEqual(p, before);
});

test("review and duplicate removal explain pending evidence without invoking decisions or losing editable input", () => {
  const p = fixture();
  // Make a refinement the first expanded card.
  p.requirements = p.requirements.filter((r) => r.id !== "pause");
  const waiting: Submission = { id: "pending-note", projectID: p.id, status: "needs-attention", applied: true, auto: false, research: false, submittedAt: "2026-10-20",
    input: { type: "note", epicID: "project", text: "A changed shared choice" } };
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [waiting], epicID: "all", sending: [], disabled: false,
    refine: () => assert.fail("No model calls"), submit: async () => assert.fail("No submission on render"), reviewRefinement: async () => assert.fail("No approval on render") }));
  assert.match(html, /Process the pending human input/);
  assert.match(html, /aria-disabled="true"[^>]*>Approve refinement/);
  const form = renderToStaticMarkup(createElement(DuplicateRemovalForm, { project: p, submissions: [waiting], removeID: "aim", keepID: "jump", disabled: false,
    save: async () => assert.fail("No removal on render"), close: () => {} }));
  assert.match(form, /pending human input/);
  assert.match(form, /aria-disabled="true"[^>]*>Confirm removal as duplicate/);
  p.refinements = [];
  const ordinary = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [waiting], epicID: "all", sending: [], disabled: false,
    refine: () => {}, submit: async () => true, reviewRefinement: async () => true }));
  assert.match(ordinary, /A saved review will need your attention instead of applying automatically/);
  assert.match(ordinary, /<textarea/);
  assert.deepEqual({ ...p, refinements: before.refinements }, before);
});

test("completion notices expose job/revision provenance and withdrawn suggestions leave actionable review without losing history", () => {
  const p = fixture(), proposal = p.refinements[0]!;
  proposal.status = "dismissed";
  p.reviewUpdates = { format: 1, items: [{ recordID: proposal.id, recordType: "refinement", kind: "withdrawn", jobID: "completed-job", revision: 2, submissionIDs: ["saved-response"], reason: "Related input changed its review basis; no human rejection was inferred." }] };
  const before = structuredClone(p);
  assert.ok(!reviewItems(p, [], "pending").some((item) => item.id === `refinement:${proposal.id}`));
  assert.ok(reviewItems(p, [], "reviewed").some((item) => item.id === `refinement:${proposal.id}`));
  const html = renderToStaticMarkup(createElement(ReviewUpdateNotice, { project: p, recordType: "refinement", recordID: proposal.id }));
  assert.match(html, /Proposal withdrawn after processing/); assert.match(html, /no human rejection was inferred/);
  assert.match(html, /completed-job/); assert.match(html, /saved-response/); assert.match(html, /revision 2/);
  assert.deepEqual(p, before);
});
