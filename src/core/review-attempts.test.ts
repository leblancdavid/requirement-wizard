import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { projectSchema, reviewFingerprint, type Submission } from "./model.js";
import { resolvedReviewAttempts } from "./review-attempts.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryQueue } from "../service/queue.js";
import { DiscoveryService } from "../service/discovery.js";

function fixture() {
  const project = projectSchema.parse({ id: "project", name: "Review history", revision: 8, model: { providerID: "openai", modelID: "fixture" },
    summary: "History", goals: [], actors: [], assumptions: [], sources: [{ id: "idea", kind: "initial", text: "Keep intent" }], questions: [],
    requirements: [{ id: "story", statement: "Requested behavior", rationale: "Intent", acceptance: ["Observable outcome"], sourceIDs: ["idea"], epicID: "inbox", status: "proposed" }] });
  const failed: Submission = { id: "failed", projectID: project.id, submittedAt: "2026-10-20T12:00:00Z", auto: false, research: false,
    status: "needs-attention", applied: false, conflict: true, diagnostic: "Original blocker retained exactly",
    input: { type: "review", requirementID: "story", requirementText: "Requested behavior", fingerprint: reviewFingerprint(project.requirements[0]!), action: "accepted", note: "" } };
  const completed: Submission = { ...structuredClone(failed), id: "completed", submittedAt: "2026-10-20T12:01:00Z", status: "completed", applied: true, conflict: false, appliedSourceID: "approval", appliedRevision: 7 };
  project.requirements[0]!.status = "accepted"; project.requirements[0]!.sourceIDs.push("approval");
  project.sources.push({ id: "approval", kind: "confirmation", requirementID: "story", epicID: "inbox", text: "Saved human approval" });
  return { project, failed, completed };
}

test("later completed human approval resolves duplicate failed attempts without changing their originals", () => {
  const { project, failed, completed } = fixture();
  const duplicate = { ...structuredClone(failed), id: "duplicate" }, items = [failed, duplicate, completed];
  const before = structuredClone({ project, items });
  assert.deepEqual([...resolvedReviewAttempts(project, items)], [[failed.id, { submissionID: completed.id, changedWording: false }], [duplicate.id, { submissionID: completed.id, changedWording: false }]]);
  assert.deepEqual({ project, items }, before);
  assert.deepEqual([...resolvedReviewAttempts(project, items)], [...resolvedReviewAttempts(project, items)], "Reconciliation is idempotent");
});

test("a later explicit approval of updated wording replaces a plain old attempt, but is not an approval by the old attempt", () => {
  const { project, failed, completed } = fixture();
  project.requirements[0]!.statement = "Updated reviewed behavior";
  if (completed.input.type !== "review") throw new Error("fixture");
  completed.input.requirementText = project.requirements[0]!.statement;
  completed.input.fingerprint = reviewFingerprint(project.requirements[0]!);
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).get(failed.id)?.changedWording, true);
  assert.equal(failed.applied, false);
});

for (const mode of ["note", "different-action", "unfinished", "applied-failure", "missing-source", "superseded-source", "changed-wording", "needs-review", "earlier-success", "future-attempt", "malformed-fingerprint", "archived", "other-project"] as const) {
  test(`review history keeps ${mode} actionable instead of assuming it is resolved`, () => {
    const { project, failed, completed } = fixture();
    if (failed.input.type !== "review" || completed.input.type !== "review") throw new Error("fixture");
    if (mode === "note") failed.input.note = "Still needs consideration";
    if (mode === "different-action") failed.input.action = "rejected";
    if (mode === "unfinished") completed.status = "saved";
    if (mode === "applied-failure") failed.applied = true;
    if (mode === "missing-source") delete completed.appliedSourceID;
    if (mode === "superseded-source") project.sources.push({ id: "new-source", kind: "rejection", text: "Later decision", epicID: "inbox", requirementID: "story", supersedes: "approval" });
    if (mode === "changed-wording") project.requirements[0]!.acceptance.push("A newly added scenario");
    if (mode === "needs-review") project.requirements[0]!.status = "needs-review";
    if (mode === "earlier-success") completed.submittedAt = "2026-10-20T11:00:00Z";
    if (mode === "future-attempt") failed.submittedAt = "2026-10-21T12:00:00Z";
    if (mode === "malformed-fingerprint") failed.input.fingerprint = "unknown old format";
    if (mode === "archived") project.epics.find((e) => e.id === "inbox")!.archived = true;
    if (mode === "other-project") completed.projectID = "another-project";
    assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 0);
  });
}

test("later rejection resolves only a matching earlier rejection, with equal timestamps ordered durably", () => {
  const { project, failed, completed } = fixture();
  if (failed.input.type !== "review" || completed.input.type !== "review") throw new Error("fixture");
  failed.input.action = completed.input.action = "rejected";
  completed.submittedAt = failed.submittedAt;
  project.requirements[0]!.status = "rejected"; project.sources[1]!.kind = "rejection";
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 1);
  assert.equal(resolvedReviewAttempts(project, [completed, failed]).size, 0);
});

test("legacy failed attempts reconcile on repeated SQLite reopen without rewriting payloads, pausing an idle queue, or inference", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "review-history-")), path = join(directory, "projects.sqlite");
  try {
    let store = new ProjectStore(path);
    let p = store.create("History upgrade", "Preserve history", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { summary: "History", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ statement: "Requested behavior", rationale: "Intent", acceptance: ["Observable outcome"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id);
    const input = { type: "review" as const, requirementID: p.requirements[0]!.id, requirementText: p.requirements[0]!.statement, fingerprint: reviewFingerprint(p.requirements[0]!), action: "accepted" as const, note: "" };
    const old: Submission = { id: randomUUID(), projectID: p.id, status: "needs-attention", conflict: true, applied: false, auto: false, research: false, submittedAt: "2026-10-20T11:00:00Z", diagnostic: "Original historical diagnostic", input };
    const approval = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input });
    store.applyQueued(p.id);
    const applied = store.submissions(p.id).find((s) => s.id === approval.id)!;
    applied.status = "completed"; store.saveSubmission(applied);
    store.close();
    // Legacy bytes: an older unapplied conflict remains beside a later success.
    const db = new Database(path);
    db.prepare("INSERT INTO submissions VALUES (?, ?, ?)").run(old.id, p.id, JSON.stringify(old));
    // Durable order, not UUID lexical order: restore the actual legacy order.
    db.prepare("UPDATE submissions SET rowid = 0 WHERE id = ?").run(old.id);
    const original = db.prepare("SELECT payload FROM submissions ORDER BY rowid").all();
    db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      store = new ProjectStore(path);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("History recovery must never call a model"); } }));
      try {
        assert.equal(resolvedReviewAttempts(store.get(p.id), store.submissions(p.id)).size, 1);
        assert.equal(store.queuePaused(p.id), false, "Resolved conflicts must not pause an otherwise idle queue on startup");
      } finally { await queue.close(); store.close(); }
      const read = new Database(path, { readonly: true });
      assert.deepEqual(read.prepare("SELECT payload FROM submissions ORDER BY rowid").all(), original);
      read.close();
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
