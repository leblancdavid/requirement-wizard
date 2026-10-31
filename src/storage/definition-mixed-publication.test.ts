import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { mixedPublicationFixture, mixedPublicationReply } from "./definition-mixed-publication-fixture.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedSavedReviewSchema, verifiedMixedPublicationReceipt } from "../core/definition-mixed-publication.js";
import { executionConfigSchema, assessmentCurrent, deliveredRequirement, type Assessment } from "../core/execution.js";
import { planningConfigFingerprint, planningCurrent } from "../core/implementation-planning.js";
import { requirementFingerprint } from "../core/implementation.js";
import { assessmentContextFingerprint } from "../core/execution-context.js";
import { implementationRevisionMatches } from "../core/implementation-revisions.js";
import { renderWorkspace } from "./workspace.js";
import { decodePortable } from "./portable.js";
import { coverage } from "../core/coverage.js";
import { randomUUID } from "node:crypto";
import { startApp } from "../web/server.js";
import { DefinitionScopeReviewService } from "../service/definition-scope-review.js";
import { DefinitionMixedReviewService } from "../service/definition-mixed-review.js";
import { dimensions } from "../core/definition-dimensions.js";

async function saved(f: Awaited<ReturnType<typeof mixedPublicationFixture>>) {
  const preview = f.store.previewMixedPublication(f.p.id, f.query); if (preview.status !== "recorded") assert.fail(preview.reason);
  const result = f.store.saveMixedReview(f.p.id, { ...f.query, previewKey: preview.preview.previewKey, confirmReviewed: true }); if (result.status !== "recorded") assert.fail(result.reason);
  const query = { revision: f.p.revision, snapshotKey: f.query.snapshotKey, reviewID: result.review.id, reviewKey: result.review.reviewKey };
  return { review: result.review, preview: preview.preview, query };
}
test("mixed reviewed preview/save/history preserve exact originals and current differences without new calls or project writes", async () => {
  const f = await mixedPublicationFixture();
  try {
    const jobs = f.store.jobs(f.p.id), execution = f.store.execution(f.p.id), { preview, review } = await saved(f);
    assert.deepEqual(preview.assembly.findings.map((v) => v.originalFinding), review.preview.assembly.findings.map((v) => v.originalFinding));
    assert.equal(preview.currentFindings.find((c) => c?.dimension === "rules")!.status, "unknown");
    assert.equal(preview.assembly.findings.find((c) => c.origin.dimension === "rules")!.originalFinding.status, "partial");
    assert.equal(review.preview.respondedAt, f.completed.run.respondedAt); assert.equal(review.canPublish, false);
    assert.equal(f.store.mixedReviewHistory(f.p.id, { epicID: "orders" }).entries[0]!.id, review.id);
    assert.deepEqual(f.store.readMixedReview(f.p.id, review.id), { status: "recorded", review });
    assert.equal(f.store.readMixedReview("foreign", review.id).status, "unavailable");
    const again = f.store.saveMixedReview(f.p.id, { ...f.query, previewKey: preview.previewKey, confirmReviewed: true }); assert.equal(again.status === "recorded" && again.reused, true);
    assert.throws(() => f.store.saveMixedReview(f.p.id, { ...f.query, previewKey: preview.previewKey, confirmReviewed: false }));
    assert.equal(f.store.saveMixedReview(f.p.id, { ...f.query, previewKey: "f".repeat(64), confirmReviewed: true }).status, "unavailable");
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.deepEqual(f.store.execution(f.p.id), execution);
    f.reopen(); assert.deepEqual(f.store.readMixedReview(f.p.id, review.id), { status: "recorded", review });
    f.store.note(f.p.id, f.p.revision, "Later product choice"); assert.deepEqual(f.store.readMixedReview(f.p.id, review.id), { status: "recorded", review });
  } finally { f.cleanup(); }
});

test("mixed apply requires separate consent/plan, publishes unchanged findings at low confidence and reuses a durable receipt", async () => {
  const f = await mixedPublicationFixture();
  try {
    const { review, query } = await saved(f), jobs = f.store.jobs(f.p.id), grants = { workflow: f.store.workflow(f.p.id), maintenance: f.store.maintenance(f.p.id) };
    const preview = f.store.previewMixedApply(f.p.id, query); if (preview.status !== "eligible") assert.fail();
    assert.ok(preview.plan.proposedPercent > preview.plan.currentPercent);
    assert.throws(() => f.store.applyMixedReview(f.p.id, { ...query, applyKey: preview.plan.applyKey, confirmApply: false }));
    assert.equal(f.store.applyMixedReview(f.p.id, { ...query, applyKey: "f".repeat(64), confirmApply: true }).status, "unavailable");
    const input = { ...query, applyKey: preview.plan.applyKey, confirmApply: true }, result = f.store.applyMixedReview(f.p.id, input); if (result.status !== "applied") assert.fail();
    assert.equal(result.reused, false); assert.equal(result.project.revision, f.p.revision + 1);
    const a = result.project.assessments.find((a) => a.epicID === "orders")!; assert.equal(a.confidence, "low");
    assert.deepEqual(a.checks, review.preview.assembly.findings.map((f) => f.originalFinding)); assert.deepEqual(a.mixedReview!.assembly, review.preview.assembly);
    assert.equal(a.mixedReview!.consistency.respondedAt, f.completed.run.respondedAt); assert.equal(a.mixedReview!.publicationID, result.receipt.publicationID);
    assert.deepEqual(result.project.requirements, f.p.requirements); assert.deepEqual(result.project.sources, f.p.sources); assert.deepEqual(result.project.questions, f.p.questions);
    assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.deepEqual({ workflow: f.store.workflow(f.p.id), maintenance: f.store.maintenance(f.p.id) }, grants);
    assert.equal(coverage(result.project).epics.find((e) => e.epicID === "orders")!.stale, false);
    const execution = f.store.execution(f.p.id); assert.equal(execution.definitionRevision!.fromRevision, f.p.revision); assert.equal(execution.definitionRevision!.throughRevision, result.project.revision);
    f.reopen(); const repeat = f.store.applyMixedReview(f.p.id, input); assert.equal(repeat.status === "applied" && repeat.reused, true);
    assert.deepEqual(f.store.execution(f.p.id), execution); assert.deepEqual(f.store.get(f.p.id), result.project);
    assert.deepEqual(f.store.previewMixedApply(f.p.id, query), { status: "applied", receipt: result.receipt, current: true });
    const portable = decodePortable(renderWorkspace(result.project, execution), result.project.model); assert.deepEqual(portable.project.assessments, result.project.assessments);
    assert.deepEqual(portable.execution.definitionRevision, execution.definitionRevision);
    f.store.note(f.p.id, result.project.revision, "Real later edit");
    assert.deepEqual(f.store.previewMixedApply(f.p.id, query), { status: "applied", receipt: result.receipt, current: false });
    assert.equal(f.store.applyMixedReview(f.p.id, input).status, "unavailable");
    assert.throws(() => verifiedMixedPublicationReceipt(result.receipt, f.p.id, "other-area", query));
  } finally { f.cleanup(); }
});

test("mixed publication retains valid legacy/modern assessments and approved plans while leaving stale work stale", async () => {
  const f = await mixedPublicationFixture();
  try {
    const state = f.store.execution(f.p.id); state.config = executionConfigSchema.parse({ repository: "fixture/repo", providerID: "openai", modelID: "fixture", strategy: "main", checks: ["fixture-check"] });
    for (const [i, r] of f.p.requirements.entries()) {
      const a: Assessment = { fingerprint: requirementFingerprint(r), specificationRevision: i === 1 ? f.p.revision - 1 : f.p.revision,
        status: "complete", explanation: "Original code evidence", evidenceIDs: [], scenarios: [], head: "original-head", scope: "workspace", capturedAt: "2026-10-31", files: [], omissions: 0, verified: false };
      if (i === 2) a.contextFingerprint = assessmentContextFingerprint(f.p, r.id); state.assessments[r.id] = a;
      (state.mainAssessments ??= {})[r.id] = { ...a, scope: "main", verified: true };
      state.delivered[r.id] = { fingerprint: i === 1 ? "already-stale" : requirementFingerprint(r), contextFingerprint: assessmentContextFingerprint(f.p, r.id), main: "original-main", at: "2026-10-31", repository: "fixture/repo", checks: [] };
    }
    state.planning = { format: 1, id: "original-plan", revision: f.p.revision, bindingID: "fixture-binding", createdAt: "2026-10-31", approvedAt: "original-approval", status: "approved",
      model: f.p.model, configFingerprint: planningConfigFingerprint(state), sessions: ["original-session"], output: { summary: "Original", packages: f.p.requirements.map((r) => ({ requirementID: r.id, title: r.statement, reason: "Original", steps: ["Build"], verification: ["Check"], prerequisites: [], questions: [] })) } };
    state.run = { id: "original-run", revision: f.p.revision, bindingID: "fixture-binding", repositoryRoot: "original-root", config: structuredClone(state.config), scope: {}, requirementIDs: f.p.requirements.map((r) => r.id),
      units: [{ id: "original-unit", epicID: "orders", branch: "original-branch", base: "original-base", directory: "original-worktree", delivery: "awaiting-merge", pr: "https://example.test/pr/1",
        items: [{ requirementID: f.p.requirements[0]!.id, fingerprint: requirementFingerprint(f.p.requirements[0]!), status: "verified", sessionID: "original-coding-session", commit: "original-commit", checks: [] }] }],
      status: "interrupted", progress: ["Original progress"], createdAt: "2026-10-31" };
    state.history = [{ ...structuredClone(state.run), id: "earlier-run", revision: f.p.revision - 1 }];
    f.store.saveExecution(f.p.id, state); const before = f.store.execution(f.p.id), { query } = await saved(f);
    const plan = f.store.previewMixedApply(f.p.id, query); if (plan.status !== "eligible") assert.fail();
    const applied = f.store.applyMixedReview(f.p.id, { ...query, applyKey: plan.plan.applyKey, confirmApply: true }); if (applied.status !== "applied") assert.fail();
    const after = f.store.execution(f.p.id); assert.deepEqual(after.assessments, before.assessments); assert.deepEqual(after.planning, before.planning);
    const { version: _beforeVersion, definitionRevision: _beforeCertificate, ...oldEvidence } = before;
    const { version: _afterVersion, definitionRevision: _afterCertificate, ...newEvidence } = after;
    assert.deepEqual(newEvidence, oldEvidence, "No original plan/approval/session/run/attempt/delivery evidence is rebased");
    assert.equal(planningCurrent(applied.project, after, "fixture-binding"), true);
    for (const [i, r] of f.p.requirements.entries()) { assert.equal(assessmentCurrent(applied.project, after, r.id), i !== 1); assert.equal(deliveredRequirement(applied.project, after, r.id), i !== 1); }
    assert.equal(implementationRevisionMatches(applied.project, after, f.p.revision - 1), false);
    const edited = structuredClone(applied.project); edited.sources[0]!.text = "Changed intent at equal revision";
    assert.equal(planningCurrent(edited, after, "fixture-binding"), false);
  } finally { f.cleanup(); }
});

for (const mode of ["source-edit", "equal-revision", "source-damage", "conflict"] as const) test(`mixed publication rejects ${mode} without overwriting saved evidence`, async () => {
  const f = await mixedPublicationFixture(mode === "conflict"), db = new Database(f.path);
  try {
    if (mode === "conflict") { assert.equal(f.store.previewMixedPublication(f.p.id, f.query).status, "unavailable"); return; }
    const { query, review } = await saved(f), plan = f.store.previewMixedApply(f.p.id, query); if (plan.status !== "eligible") assert.fail();
    if (mode === "source-edit") f.store.note(f.p.id, f.p.revision, "A real product change");
    if (mode === "equal-revision") { const replacement = structuredClone(f.p); replacement.sources[0]!.text = "Equal-version replacement"; db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(replacement), f.p.id); }
    if (mode === "source-damage") db.prepare("UPDATE definition_scope_reviews SET payload = json_set(payload, '$.respondedAt', ?) WHERE job_id = ?").run("2020-01-01T00:00:00.000Z", f.scoped.job.id);
    const before = f.store.get(f.p.id), execution = f.store.execution(f.p.id);
    assert.equal(f.store.applyMixedReview(f.p.id, { ...query, applyKey: plan.plan.applyKey, confirmApply: true }).status, "unavailable");
    assert.deepEqual(f.store.get(f.p.id), before); assert.deepEqual(f.store.execution(f.p.id), execution); assert.deepEqual(f.store.readMixedReview(f.p.id, review.id), { status: "recorded", review });
  } finally { db.close(); f.cleanup(); }
});

for (const target of ["receipt", "revision", "activity", "execution"] as const) test(`mixed apply ${target} failure rolls back project/history/execution/receipt atomically`, async () => {
  const f = await mixedPublicationFixture(), db = new Database(f.path);
  try {
    const { query } = await saved(f), plan = f.store.previewMixedApply(f.p.id, query); if (plan.status !== "eligible") assert.fail();
    const input = { ...query, applyKey: plan.plan.applyKey, confirmApply: true }, execution = f.store.execution(f.p.id);
    const trigger = target === "receipt" ? "BEFORE INSERT ON definition_mixed_publications" : target === "revision" ? "BEFORE INSERT ON revisions WHEN NEW.reason = 'Reviewed mixed definition assessment applied'"
      : target === "activity" ? "BEFORE INSERT ON project_activity WHEN NEW.event_id LIKE 'mixed-publication:%'" : "BEFORE INSERT ON execution_state";
    db.exec(`CREATE TRIGGER fail_mixed_apply ${trigger} BEGIN SELECT RAISE(ABORT, 'Injected mixed apply failure'); END;`);
    assert.throws(() => f.store.applyMixedReview(f.p.id, input), /Injected/);
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.execution(f.p.id), execution);
    assert.equal(db.prepare("SELECT 1 FROM definition_mixed_publications").get(), undefined);
    assert.equal(db.prepare("SELECT 1 FROM revisions WHERE project_id = ? AND revision = ?").get(f.p.id, f.p.revision + 1), undefined);
    db.exec("DROP TRIGGER fail_mixed_apply"); assert.equal(f.store.applyMixedReview(f.p.id, input).status, "applied");
  } finally { db.close(); f.cleanup(); }
});

test("22→23 upgrade preserves saved sources/execution/live leases, retries interruption and rejects future saved-review formats", async () => {
  const f = await mixedPublicationFixture(); let db: Database.Database | undefined;
  try {
    const p = f.store.create("Other live worker", "Keep lease", f.p.model), job = f.store.beginJob(p.id, p.revision).job;
    f.store.claimJob(job.id, Date.now() + 60000); const lease = f.store.getJob(job.id), source = f.store.definitionMixedReview(f.completed.job.id), execution = f.store.execution(f.p.id);
    f.close(); db = new Database(f.path); db.exec("DROP TABLE definition_mixed_publications; DROP TABLE definition_mixed_saved_reviews; DELETE FROM migration_history WHERE version = 23; PRAGMA user_version = 22;"); db.close(); db = undefined;
    const reopened = new ProjectStore(f.path); assert.deepEqual(reopened.get(f.p.id), f.p); assert.deepEqual(reopened.getJob(job.id), lease); assert.deepEqual(reopened.definitionMixedReview(f.completed.job.id), source); assert.deepEqual(reopened.execution(f.p.id), execution); reopened.close();
    // The fixture handle was explicitly closed above; use fresh owners from here.
    const next = new ProjectStore(f.path), preview = next.previewMixedPublication(f.p.id, f.query); if (preview.status !== "recorded") assert.fail();
    const saved = next.saveMixedReview(f.p.id, { ...f.query, previewKey: preview.preview.previewKey, confirmReviewed: true }); if (saved.status !== "recorded") assert.fail(); next.close();
    db = new Database(f.path); const original = JSON.stringify(saved.review);
    db.prepare("UPDATE definition_mixed_saved_reviews SET payload = ? WHERE review_id = ?").run(JSON.stringify({ ...saved.review, format: 999 }), saved.review.id);
    db.exec("DELETE FROM migration_history WHERE version = 23; PRAGMA user_version = 22;"); db.close(); db = undefined;
    assert.throws(() => new ProjectStore(f.path), /Saved mixed review/);
    db = new Database(f.path); assert.equal(db.pragma("user_version", { simple: true }), 22); assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version = 23").get(), undefined);
    db.prepare("UPDATE definition_mixed_saved_reviews SET payload = ? WHERE review_id = ?").run(original, saved.review.id); db.close(); db = undefined;
    const repaired = new ProjectStore(f.path); assert.equal(repaired.readMixedReview(f.p.id, saved.review.id).status, "recorded"); assert.deepEqual(repaired.getJob(job.id), lease); repaired.close();
    assert.equal(definitionMixedSavedReviewSchema.parse(JSON.parse(original)).reviewKey, digest((({ reviewKey: _, ...fields }) => fields)(saved.review)));
  } finally { db?.close(); f.cleanup(); }
});

test("mixed apply admission preserves live/expired leases, active jobs, automation and unfinished input", async () => {
  const f = await mixedPublicationFixture();
  try {
    const { query } = await saved(f), eligible = f.store.previewMixedApply(f.p.id, query); if (eligible.status !== "eligible") assert.fail();
    const input = { ...query, applyKey: eligible.plan.applyKey, confirmApply: true };
    f.store.claimExecution(f.p.id, "fixture", "owner");
    assert.equal(f.store.previewMixedApply(f.p.id, query).status, "unavailable"); assert.throws(() => f.store.applyMixedReview(f.p.id, input));
    const db = new Database(f.path);
    try { db.prepare("UPDATE execution_leases SET lease_until = 0 WHERE project_id = ?").run(f.p.id); assert.throws(() => f.store.applyMixedReview(f.p.id, input));
      assert.ok(db.prepare("SELECT 1 FROM execution_leases WHERE project_id = ? AND lease_until = 0").get(f.p.id)); }
    finally { db.close(); }
    f.store.releaseExecution(f.p.id, "owner");
    const job = f.store.beginJob(f.p.id, f.p.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    assert.throws(() => f.store.applyMixedReview(f.p.id, input)); assert.equal(f.store.getJob(job.id).status, "running"); f.store.failJob(job.id, "cancelled", "Fixture");
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), enabled: true, paused: false }); assert.throws(() => f.store.applyMixedReview(f.p.id, input));
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), paused: true });
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), enabled: true, paused: false }); assert.throws(() => f.store.applyMixedReview(f.p.id, input));
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), paused: true });
    f.store.enqueue(f.p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", text: "Unprocessed human decision", epicID: "project" } });
    assert.throws(() => f.store.applyMixedReview(f.p.id, input)); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.cleanup(); }
});

test("mixed publication receipt corruption fails closed without replay or changing valid saved work", async () => {
  const f = await mixedPublicationFixture(), db = new Database(f.path);
  try {
    const { query } = await saved(f), eligible = f.store.previewMixedApply(f.p.id, query); if (eligible.status !== "eligible") assert.fail();
    const input = { ...query, applyKey: eligible.plan.applyKey, confirmApply: true }, result = f.store.applyMixedReview(f.p.id, input); if (result.status !== "applied") assert.fail();
    const project = f.store.get(f.p.id), execution = f.store.execution(f.p.id);
    db.prepare("UPDATE definition_mixed_publications SET payload = ? WHERE review_id = ?").run(JSON.stringify({ ...result.receipt, format: 999 }), query.reviewID);
    assert.equal(f.store.previewMixedApply(f.p.id, query).status, "unavailable"); assert.equal(f.store.applyMixedReview(f.p.id, input).status, "unavailable");
    assert.deepEqual(f.store.get(f.p.id), project); assert.deepEqual(f.store.execution(f.p.id), execution);
    assert.throws(() => new ProjectStore(f.path), /Mixed publication receipt/);
    db.prepare("UPDATE definition_mixed_publications SET payload = ? WHERE review_id = ?").run(JSON.stringify(result.receipt), query.reviewID);
    f.reopen(); assert.equal(f.store.previewMixedApply(f.p.id, query).status, "applied");
  } finally { db.close(); f.cleanup(); }
});

test("mixed publication API preserves authentication, strict consent, foreign isolation and no-provider read/apply boundaries", async () => {
  const f = await mixedPublicationFixture(), app = await startApp({ store: f.store, port: 0, adapter: { async analyze() { assert.fail("No inference, including on apply"); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const post = (action: string, body: unknown, id = f.p.id) => fetch(`${app.origin}/api/projects/${id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${app.origin}/api/projects/${f.p.id}/definition-mixed-save`, { method: "POST", body: "{}" })).status, 403);
    assert.equal((await fetch(`${app.origin}/api/projects/${f.p.id}/definition-mixed-apply`, { headers })).status, 405);
    const raw = await (await post("definition-mixed-publication-preview", f.query)).json(); assert.equal(raw.status, "recorded");
    const saveInput = { ...f.query, previewKey: raw.preview.previewKey, confirmReviewed: true };
    assert.equal((await post("definition-mixed-save", { ...saveInput, confirmReviewed: false })).ok, false);
    const saved = await (await post("definition-mixed-save", saveInput)).json(); assert.equal(saved.status, "recorded");
    const query = { revision: f.p.revision, snapshotKey: f.query.snapshotKey, reviewID: saved.review.id, reviewKey: saved.review.reviewKey };
    const plan = await (await post("definition-mixed-apply-preview", query)).json(); assert.equal(plan.status, "eligible");
    assert.equal((await post("definition-mixed-apply", { ...query, applyKey: plan.plan.applyKey, confirmApply: false })).ok, false);
    assert.equal((await (await post("definition-mixed-read", { reviewID: saved.review.id }, "foreign")).json()).status, "unavailable");
    const result = await (await post("definition-mixed-apply", { ...query, applyKey: plan.plan.applyKey, confirmApply: true })).json(); assert.equal(result.status, "applied");
    assert.equal((await (await post("definition-mixed-apply-preview", query)).json()).receipt.receiptKey, result.receipt.receiptKey);
    assert.equal((await (await post("definition-mixed-history", { epicID: "orders" })).json()).entries.length, 1);
    assert.equal(f.store.jobs(f.p.id).length, 4);
  } finally { await app.close(); f.cleanup(); }
});

test("mixed saved-review history is bounded, paginated and fails closed on unsupported rows without older substitution", async () => {
  const f = await mixedPublicationFixture(), db = new Database(f.path);
  try {
    const first = await saved(f), publication = f.store.definitionPublication(f.p.id, "orders", f.p.revision); if (publication.status !== "recorded") assert.fail();
    const assignments = [...dimensions.map((d) => [d]), ["purpose", "workflows"] as typeof dimensions[number][]];
    for (const assigned of assignments) {
      const scoped = await new DefinitionScopeReviewService(f.store, { async review(packet) { return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
        checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Scoped uncertainty", evidenceIDs: [f.p.sources[0]!.id] })), crossDimensionConcerns: [] }; } }).review(f.p.id,
        { request: { projectID: f.p.id, epicID: "orders", revision: f.p.revision, snapshotKey: f.query.snapshotKey, dimensions: assigned }, confirmAIUsage: true });
      const source = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: scoped.job.id }); if (source.status !== "recorded") assert.fail();
      const request = { revision: f.p.revision, epicID: "orders", snapshotKey: f.query.snapshotKey, selections: dimensions.map((dimension) => dimension === assigned[0]
        ? { kind: "scoped", dimension, jobID: scoped.job.id, provenanceKey: source.provenance.provenanceKey }
        : { kind: "publication", dimension, assessmentRevision: f.p.revision, certificateKey: digest(publication.certificate) }) };
      const completed = await new DefinitionMixedReviewService(f.store, { async review(prepared) { return mixedPublicationReply(prepared); } }).review(f.p.id, { request, confirmAIUsage: true });
      const query = { ...f.query, jobID: completed.job.id }, p = f.store.previewMixedPublication(f.p.id, query); if (p.status !== "recorded") assert.fail();
      assert.equal(f.store.saveMixedReview(f.p.id, { ...query, previewKey: p.preview.previewKey, confirmReviewed: true }).status, "recorded");
    }
    const page = f.store.mixedReviewHistory(f.p.id, { epicID: "orders" }); assert.equal(page.entries.length, 10); assert.ok(page.nextBefore);
    const old = f.store.mixedReviewHistory(f.p.id, { epicID: "orders", before: page.nextBefore }); assert.equal(old.entries.length, 1); assert.equal(old.entries[0]!.id, first.review.id); assert.equal(old.nextBefore, null);
    db.prepare("UPDATE definition_mixed_saved_reviews SET payload = ? WHERE review_id = ?").run("unsupported", page.entries[0]!.id);
    assert.throws(() => f.store.mixedReviewHistory(f.p.id, { epicID: "orders" }), /unsupported/);
    assert.equal(f.store.readMixedReview(f.p.id, page.entries[0]!.id).status, "unavailable"); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { db.close(); f.cleanup(); }
});
