import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema, reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { DuplicateRemovalForm, ReviewQueue, ReviewComparison, reviewItems, reviewReadiness, reviewProcessingScope } from "./review.js";
import { decisionClarifications, decisionContextKey, decisionEvidenceSources } from "../core/decision-availability.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pageWindow, PagedList } from "./pagination.js";
import { ReviewUpdateNotice } from "./review-update.js";
import { GapExplorationStatus } from "./gap-status.js";
import { GapContinuation } from "./gap-continuation.js";
import type { Job } from "../core/model.js";
import { searchPrefixAuxEvidence } from "../core/gap-prefix-aux.js";
import { planGapContext } from "../core/gap-context.js";
import { ChangeRequestForm } from "./change-request.js";
import { DefinitionAssessment } from "./definition-assessment.js";
import { coverage } from "../core/coverage.js";

test("definition inspection exposes outdated category explanations and exact linked evidence, never gap-free unknown areas", () => {
  const project = fixture();
  project.revision = 2;
  project.assessments = [{ epicID: "project", atRevision: 1, confidence: "low", explanation: "Earlier whole-area review", answerVersions: {},
    checks: [{ dimension: "failures", importance: "critical", status: "unknown", explanation: "Recovery after failed saves is undecided.", evidenceIDs: [project.requirements[0]!.id, "missing-evidence"] }] }];
  const before = JSON.stringify(project);
  const html = renderToStaticMarkup(createElement(DefinitionAssessment, { project, area: coverage(project).epics.find((e) => e.epicID === "project")! }));
  assert.match(html, /previous findings, not confirmed current gaps/);
  assert.match(html, /Assessed at revision 1; current revision 2/);
  assert.match(html, /Failure behavior/);
  assert.match(html, /Recovery after failed saves is undecided/);
  assert.ok(html.includes(project.requirements[0]!.statement));
  assert.match(html, /Evidence unavailable/);
  assert.match(html, /Previously flagged critical area/);
  const unassessed = renderToStaticMarkup(createElement(DefinitionAssessment, { project, area: coverage(project).epics.find((e) => e.epicID === "inbox")! }));
  assert.match(unassessed, /gaps are unknown/);
  assert.doesNotMatch(unassessed, /0 critical gaps/);
  project.assessments[0]!.atRevision = 2;
  const current = renderToStaticMarkup(createElement(DefinitionAssessment, { project, area: coverage(project).epics.find((e) => e.epicID === "project")! }));
  assert.match(current, /Critical area needs clarification/);
  assert.doesNotMatch(current, /Previously flagged/);
  project.assessments[0]!.atRevision = 1;
  assert.equal(JSON.stringify(project), before);
});

test("gap backlog status distinguishes saved checks, unresolved decisions and no-call reuse without a completeness claim", () => {
  const job: Job = { id: "gap-job", projectID: "project", expectedRevision: 1, model: { providerID: "openai", modelID: "fixture" },
    status: "completed", leaseUntil: null, gapReport: { format: 1, state: "idle", checked: 2, pending: 0, waiting: 1, blocked: 1,
      total: 4, modelCalls: 0, explanation: "Bounded task checks are not proof of completeness." } };
  const before = structuredClone(job), html = renderToStaticMarkup(createElement(GapExplorationStatus, { job }));
  assert.match(html, /Gap exploration backlog/); assert.match(html, /2 checked/); assert.match(html, /waiting for decisions/);
  assert.match(html, /No model request made/); assert.match(html, /not live completeness/); assert.match(html, /not proof of completeness/);
  assert.ok(!html.includes("100%")); assert.deepEqual(job, before);
});

test("gap status separates request-limit blockers from context blockers and names the incomplete saved check", () => {
  const project = fixture(), target = project.requirements[0]!;
  const job: Job = { id: "next-gap-job", projectID: project.id, expectedRevision: project.revision, model: project.model,
    status: "completed", leaseUntil: null, gapReport: { format: 1, state: "checked", checked: 1, pending: 0, waiting: 1, blocked: 2,
      total: 4, modelCalls: 1, requestBlocked: 1, exhaustedTasks: [{ format: 1, compatibility: "gap-evidence-v1", lens: "behavior",
        targetRecordID: target.id, inputKey: "0".repeat(64), sourceJobID: "saved-six-attempt-job" }], explanation: "Partial task check only." } };
  const before = structuredClone(job);
  const html = renderToStaticMarkup(createElement(GapExplorationStatus, { job, project }));
  assert.match(html, /1 context blocked/); assert.match(html, /1 request-limit blocked/);
  assert.match(html, /remain incomplete after six attempts/); assert.match(html, /continues other pending checks/);
  assert.ok(html.includes(target.statement)); assert.deepEqual(job, before);
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
  assert.match(html, /Zero omissions is not proof/); assert.match(html, /No candidate search-page continuation offered/);
  assert.match(html, /96,000-character evidence cap/); assert.deepEqual(job, before);
});

test("gap continuation status shows the durable six-request limit and never grants calls on render", () => {
  const job: Job = { id: "continued-job", projectID: "project", expectedRevision: 1, model: { providerID: "openai", modelID: "fixture" },
    status: "failed", leaseUntil: null, gapReport: { format: 1, state: "planned", checked: 0, pending: 3, waiting: 0, blocked: 0,
      total: 3, modelCalls: 6, explanation: "Exploration is not complete." },
    retrievalWork: { format: 1, research: false, attempts: 6, stages: [], continuation: { format: 1, sourceJobID: "exhausted-job", fromStage: 0 } } };
  const html = renderToStaticMarkup(createElement(GapExplorationStatus, { job }));
  assert.match(html, /6 of 6 model requests/); assert.match(html, /no second grant is available/);
  const continued = () => assert.fail("Rendering must not grant requests");
  assert.equal(renderToStaticMarkup(createElement(GapContinuation, { job, available: false, disabled: false, continueExploration: continued })), "");
  const offered = renderToStaticMarkup(createElement(GapContinuation, { job: { ...job, retrievalWork: { ...job.retrievalWork!, attempts: 3, continuation: undefined } }, available: true, disabled: false, continueExploration: continued }));
  assert.match(offered, /Continue exploration/); assert.match(offered, /Ordinary Resume does not reset/);
  assert.doesNotMatch(offered, /Allow up to 3 more requests/, "cost confirmation requires a user action first");
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

test("updated Review warns immediately above decisions without an acknowledgement gate", () => {
  for (const contextOnly of [false, true]) {
    const p = fixture();
    p.refinements = [];
    const r = p.requirements[1]!;
    const draft = { note: "Keep my note", edited: true, fingerprint: reviewFingerprint(r), contextKey: decisionContextKey(p, [r.id]), revision: p.revision, original: structuredClone(r) };
    if (contextOnly) p.sources.push({ id: "new-context", kind: "note", text: "New gameplay constraint", epicID: "inbox" });
    else r.statement = "Updated aiming behavior";
    p.revision++;
    const before = structuredClone(p);
    const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
      focusRequirementID: r.id, draftStore: { current: { [r.id]: draft } }, refine: () => {}, submit: async () => true, reviewRefinement: async () => true }));
    assert.match(html, /role="alert"><strong>Updated since you started reviewing\.<\/strong>[^<]*<\/p><div class="button-row">/);
    assert.match(html, /Keep my note/);
    assert.doesNotMatch(html, /Use note with updated requirement/);
    for (const label of ["Approve", "Reject", "Request changes"]) {
      assert.match(html, new RegExp(`<button class="[^"]+">${label}</button>`));
    }
    assert.equal(draft.revision, 1, "The original comparison basis is retained");
    assert.deepEqual(p, before);
  }
});

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
  // Keep this test focused on the stale card; the queue now prefers ready work.
  p.refinements[1]!.status = "dismissed";
  p.requirements[1]!.status = "accepted";
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

test("review readiness distinguishes linked decisions, pending processing and stale proposals without treating all Design questions as blockers", () => {
  const p = fixture(); p.refinements = [];
  p.questions.push({ id: "unrelated", text: "An unrelated choice?", whyItMatters: "Another behavior", options: [], epicID: "inbox", status: "pending" });
  const item = reviewItems(p, [], "pending")[0]!;
  assert.equal(reviewReadiness(p, item, []), "ready");
  p.questions.push({ id: "linked", text: "Which aim behavior?", whyItMatters: "Required choice", options: [], epicID: "inbox", status: "pending", evidenceIDs: ["aim"] });
  for (const status of ["pending", "deferred", "delegated"] as const) {
    p.questions[1]!.status = status;
    assert.equal(reviewReadiness(p, item, []), "decision");
    assert.deepEqual(decisionClarifications(p, ["aim"]).map((q) => q.id), ["linked"]);
  }
  const job: Job = { id: "worker", projectID: p.id, expectedRevision: 1, model: p.model, status: "running", leaseUntil: Date.now() + 60000 };
  assert.equal(reviewReadiness(p, item, [], [job]), "updating");
  assert.deepEqual(decisionClarifications(p, ["aim"]).map((q) => q.id), ["linked"], "Worker priority must not hide clarification navigation");
  assert.equal(reviewReadiness(p, item, [], [job], true), "changed");
  const waiting: Submission = { id: "answer", projectID: p.id, status: "queued", auto: false, research: false, applied: false, submittedAt: "2026-10-21", input: { type: "answer", questionID: "linked", questionText: p.questions[1]!.text, sourceID: null, answer: { kind: "answer", text: "Concrete behavior" } } };
  assert.equal(reviewReadiness(p, item, [waiting]), "updating");
  waiting.conflict = true;
  assert.equal(reviewReadiness(p, item, [waiting]), "decision", "An unapplied conflicted answer must not hold the processing gate");
  p.questions[1]!.status = "answered";
  assert.equal(reviewReadiness(p, item, [waiting]), "ready");
  const failed: Submission = { ...waiting, id: "failed-review", status: "needs-attention", conflict: false, applied: true, input: { type: "review", requirementID: "aim", requirementText: p.requirements[1]!.statement, fingerprint: reviewFingerprint(p.requirements[1]!), action: "accepted", note: "" } };
  assert.equal(reviewReadiness(p, item, [failed]), "attention", "Failed follow-up must not look like active updating");
  assert.equal(p.questions[0]!.status, "pending");
});

test("Review shows readiness counts and inline questions, prefers a ready card, and remains read-only on render", () => {
  const p = fixture(); p.refinements = [];
  p.questions.push({ id: "linked", text: "Which aim behavior?", whyItMatters: "Required choice", options: [], epicID: "inbox", status: "deferred", evidenceIDs: ["aim"] });
  const before = structuredClone(p);
  const props = { project: p, submissions: [], epicID: "all", sending: [], disabled: false, refine: () => assert.fail("No model call"), submit: async () => assert.fail("No submission"), reviewRefinement: async () => assert.fail("No decision") };
  const html = renderToStaticMarkup(createElement(ReviewQueue, props));
  assert.match(html, /Ready to review <span>1<\/span>/);
  assert.match(html, /Needs a decision <span>1<\/span>/);
  assert.match(html, /aria-expanded="true"[^>]*>.*?Behavior pause/);
  p.requirements = p.requirements.filter((r) => r.id !== "pause");
  const inline = renderToStaticMarkup(createElement(ReviewQueue, { ...props, renderClarification: (q) => createElement("p", null, `Inline: ${q.text}`) }));
  assert.match(inline, /Decisions needed before approval/);
  assert.match(inline, /Inline: Which aim behavior\?/);
  assert.match(inline, /aria-disabled="true"[^>]*>Approve<\/button>/);
  assert.match(inline, /<button class="secondary">Reject<\/button>/);
  assert.match(inline, /Deferring or delegating does not settle/);
  assert.deepEqual({ ...p, requirements: before.requirements }, before);
});

test("processing a Review blocker follows a shared clarification outside the target feature and retains broader queue scope for mixed input", () => {
  const p = fixture();
  p.questions.push({ id: "shared", text: "Shared decision?", whyItMatters: "Affects aim", options: [], epicID: "project", status: "pending", evidenceIDs: ["aim"] });
  const answer: Submission = { id: "answer", projectID: p.id, status: "queued", auto: false, research: false, applied: false, submittedAt: "2026-10-21", input: { type: "answer", questionID: "shared", questionText: "Shared decision?", sourceID: null, answer: { kind: "answer", text: "Human choice" } } };
  const note: Submission = { ...answer, id: "note", input: { type: "note", epicID: "inbox", text: "Feature constraint" } };
  const before = structuredClone({ p, answer, note });
  assert.deepEqual(reviewProcessingScope(p, [answer, note], ["answer"]), { focusEpicID: "project" });
  assert.deepEqual(reviewProcessingScope(p, [answer, note], ["note"]), { focusEpicID: "inbox" });
  assert.deepEqual(reviewProcessingScope(p, [answer, note], ["answer", "note"]), {});
  assert.deepEqual({ p, answer, note }, before);
});

test("Review comparison shows new relevant human evidence even when the requirement does not directly cite the new answer", () => {
  const p = fixture(), original = structuredClone(p.requirements[1]!);
  const originalEvidence = decisionEvidenceSources(p, ["aim"]).map((s) => s.id);
  p.sources.push({ id: "shared-answer", kind: "answer", text: "Never expose private reports", epicID: "project", questionID: "shared" });
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(ReviewComparison, { project: p, original, current: p.requirements[1]!, evidenceIDs: originalEvidence }));
  assert.match(html, /wording and scenarios are unchanged/);
  assert.match(html, /New supporting evidence/);
  assert.match(html, /Never expose private reports/);
  assert.ok(!original.sourceIDs.includes("shared-answer"));
  // New scoped bases retain shared evidence; legacy key compatibility is checked separately.
  assert.deepEqual(JSON.parse(decisionContextKey(p, ["aim"])), ["human-review-basis-v2", [["aim", reviewFingerprint(original)]], ["idea", "shared-answer"], [["inbox", false, []], ["project", false, []]], [], []]);
  assert.deepEqual(p, before);
});

test("change requests use a separate required feedback editor without treating feedback as a decision", () => {
  const html = renderToStaticMarkup(createElement(ChangeRequestForm, { initialText: "", disabled: false, change: () => {}, send: async () => assert.fail("No submission on render"), close: () => {} }));
  assert.match(html, /Requested changes/); assert.match(html, /not approval or rejection/);
  assert.match(html, /maxlength="12000"/i); assert.match(html, /aria-disabled="true"[^>]*>Send change request/);
  const retained = renderToStaticMarkup(createElement(ChangeRequestForm, { initialText: "Keep my exact requested changes", disabled: true, reason: "Review updated evidence first", change: () => {}, send: async () => false, close: () => {} }));
  assert.match(retained, /Keep my exact requested changes/); assert.match(retained, /Review updated evidence first/);
});
