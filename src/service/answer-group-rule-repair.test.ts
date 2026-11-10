import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { analysisSchema } from "../core/model.js";
import { answerGroupMaterials, planAnswerGroup, boundAnswerGroupEvidence, answerGroupContext, answerGroupProgress, acceptAnswerGroup,
  replayAnswerGroup, answerGroupRuleRepairPreview, authorizeAnswerGroupRuleRepair, adoptAnswerGroupPlay, answerGroupLookupInventory, answerGroupPlayLimits, type AnswerGroupDraft } from "../core/answer-group.js";
import { ProjectStore } from "../storage/store.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { DiscoveryService } from "./discovery.js";
import { ProjectWorkflow } from "./workflow.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { startApp } from "../web/server.js";

const empty = () => analysisSchema.parse({ summary: "Retain original decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(store: ProjectStore, large = false) {
  let p = store.create("Exact rule scope", "Retain player decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "departure", title: "Departure", purpose: "Departure rules", dependencies: [] }]);
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "departure", statement: "Both players must arrive before departure", rationale: "Original rule",
    acceptance: ["Departure waits for both players"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Keep the original rule");
  const target = p.requirements[0]!;
  if (large) for (let n = 0; n < 40; n++) p = store.note(p.id, p.revision, randomBytes(1000).toString("hex"), "project");
  const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
  store.finishJob(questions.id, { ...empty(), questions: ["May a sole survivor depart?", "Must both living players arrive?"].map(text => ({ epicID: "project", text,
    evidenceIDs: [target.id], whyItMatters: "Settle the exception", options: [{ label: "Yes", consequence: "Retain this behavior" }, { label: "No", consequence: "Review it" }] })) });
  p = store.get(p.id);
  const queued = p.questions.map(q => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "A sole survivor may depart; both living players must arrive." } } }));
  store.applyQueued(p.id, queued.map(s => s.id)); p = store.get(p.id);
  const items = store.submissions(p.id), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  let draft: AnswerGroupDraft | undefined;
  while (answerGroupProgress(w).phase === "read") {
    boundAnswerGroupEvidence(m, w, draft, 8); w.attempts++;
    draft = acceptAnswerGroup(m, w, draft, draft ? { answerGroupKeep: true } : { answerGroupDraft: { analysis: empty(),
      answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Original choice retained in this provisional draft" })) } }, job).draft;
  }
  while (answerGroupProgress(w).completed < w.batches.length * 2 - 1) {
    boundAnswerGroupEvidence(m, w, draft, 7); w.attempts++;
    acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: true, reason: "This original evidence batch agrees" } }, job);
  }
  boundAnswerGroupEvidence(m, w, draft, 7); w.attempts++;
  acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: false, reason: `Rule ${target.id} needs the settled survivor exception.` } }, job);
  const context = answerGroupContext(m, w, draft); assert.ok(context.manifest.includedIDs.includes(target.id));
  w.attempts = 3;
  acceptAnswerGroup(m, w, draft, { answerGroupBlocked: { reason: `Permission to repair rule ${target.id} in feature departure is needed; this group permits edits only within project. Settled answers need no reconfirmation.` } }, job);
  store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Saved repair needs exact feature permission");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const state = store.workflow(p.id); state.enabled = true; state.paused = true; state.phase = "needs-decision";
  state.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(p.id, state);
  const saved = store.getJob(job.id), preview = answerGroupRuleRepairPreview(p, saved)!; assert.ok(preview);
  const repaired = structuredClone(draft!);
  repaired.analysis.specificationUpdates = { format: 1, changes: [{ type: "revise", requirementID: target.id,
    statement: "Both living players must arrive; a sole survivor may depart", rationale: "Record the explicit original answers",
    acceptance: ["Both living players must arrive", "A sole survivor may depart"], sourceIDs: [items[0]!.appliedSourceID!], reason: "Faithfully record the settled exception" }] };
  return { p, items, m, w, job: saved, target, draft: draft!, repaired, preview };
}

test("rule permission is explicit, single-target, no-call and attempt-preserving; all checks restart only after actual repair", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = fixture(store, true), original = structuredClone(f.job); assert.ok(f.w.batches.length > 1);
    const denied = structuredClone(f.w); denied.attempts++;
    assert.throws(() => acceptAnswerGroup(f.m, denied, f.draft, { answerGroupRepair: f.repaired }, f.job), /same-feature/);
    let calls = 0;
    workflow = new ProjectWorkflow(store, { async analyze() { calls++; assert.fail("Permission preparation starts no inference"); } });
    const consent = { jobID: f.job.id, requirementID: f.target.id, previewKey: f.preview.previewKey }, version = store.workflow(f.p.id).settingsVersion;
    assert.throws(() => workflow!.configure(f.p.id, f.p.revision, version, "allow-shared-rule-repair"));
    assert.throws(() => workflow!.configure(f.p.id, f.p.revision, version, "allow-shared-rule-repair", { ...consent, previewKey: "0".repeat(64) }));
    assert.deepEqual(store.getJob(f.job.id), original);
    workflow.configure(f.p.id, f.p.revision, version, "allow-shared-rule-repair", consent);
    assert.equal(calls, 0); assert.equal(store.workflow(f.p.id).paused, true);
    const granted = store.getJob(f.job.id), work = granted.answerGroupWork!;
    assert.equal(work.attempts, 3); assert.deepEqual(work.receipts, original.answerGroupWork!.receipts);
    assert.deepEqual(work.batches, f.w.batches); assert.equal(answerGroupProgress(work).completed, answerGroupProgress(f.w).completed);
    assert.equal(replayAnswerGroup(f.m, work).blocked, undefined); assert.deepEqual(replayAnswerGroup(f.m, work).draft, f.draft);
    assert.equal(answerGroupRuleRepairPreview(f.p, granted), undefined);
    assert.throws(() => workflow!.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "allow-shared-rule-repair", consent));
    const context = answerGroupContext(f.m, work, f.draft);
    assert.ok(context.manifest.includedIDs.includes(f.target.id)); assert.ok(f.target.sourceIDs.every(id => context.manifest.includedIDs.includes(id)));
    assert.match(discoveryPrompt(f.p, context), /EXACT RULE-REPAIR PERMISSION/);
    let repairs = 0, checks = 0;
    const completed = await new DiscoveryService(store, { async analyze(_p, { context: c }) {
      calls++; assert.ok(c.manifest.characters <= 96000);
      if (c.manifest.answerGroupStage!.phase === "repair") { repairs++; return { answerGroupRepair: f.repaired }; }
      assert.equal(c.manifest.answerGroupStage!.phase, "check", "Paid reads must not repeat"); checks++;
      return { answerGroupCheck: { valid: true, reason: "Full repaired draft agrees with this exact original unit" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(completed.status, "completed", completed.diagnostic); assert.equal(repairs, 1); assert.ok(checks >= work.batches.length);
    assert.equal(completed.answerGroupWork!.receipts[work.receipts.length]!.attempt, 4);
    assert.deepEqual(completed.answerGroupWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(store.getJob(f.job.id), granted);
    const target = store.get(f.p.id).requirements.find(r => r.id === f.target.id)!;
    assert.equal(target.statement, f.repaired.analysis.specificationUpdates!.changes[0]!.type === "revise" ? f.repaired.analysis.specificationUpdates!.changes[0]!.statement : "");
    assert.equal(target.epicID, "departure"); assert.deepEqual(store.get(f.p.id).sources, f.p.sources);
  } finally { await workflow?.close(); store.close(); }
});

test("permission does not authorize other feature actions, other targets, invented sources, reset attempts or hidden ambiguity resolution", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), permission = authorizeAnswerGroupRuleRepair(f.m, f.w, f.job, f.preview, randomUUID());
    const forgedJob = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(forgedJob.id, Date.now() + 60000);
    assert.throws(() => store.checkpointAnswerGroup(forgedJob.id, permission, answerGroupContext(f.m, permission, f.draft).manifest), /human-authorized parent/);
    assert.equal(store.getJob(forgedJob.id).answerGroupWork, undefined);
    const injected = structuredClone(permission); injected.attempts++;
    assert.throws(() => acceptAnswerGroup(f.m, injected, f.draft, { answerGroupRepair: f.repaired, ruleRepairPermission: permission.ruleRepairPermission }, f.job));
    const tryDraft = (draft: AnswerGroupDraft) => { const work = structuredClone(permission); work.attempts++; return acceptAnswerGroup(f.m, work, f.draft, { answerGroupRepair: draft }, f.job); };
    assert.doesNotThrow(() => tryDraft(f.repaired));
    for (const mutate of [
      (draft: AnswerGroupDraft) => { draft.analysis.requirements.push({ epicID: "departure", statement: "Unrelated new rule", rationale: "Not authorized", acceptance: ["No"], sourceIDs: [f.items[0]!.appliedSourceID!] }); },
      (draft: AnswerGroupDraft) => { draft.analysis.specificationUpdates!.changes = [{ type: "activate", requirementID: f.target.id, sourceIDs: [f.items[0]!.appliedSourceID!], reason: "Not authorized by revise-only permission" }]; },
      (draft: AnswerGroupDraft) => { draft.analysis.pendingChanges = { format: 1, changes: [{ type: "withdraw-requirement", requirementID: f.target.id, sourceIDs: [f.items[0]!.appliedSourceID!], reason: "Not authorized" }] }; },
      (draft: AnswerGroupDraft) => { draft.analysis.specificationUpdates!.changes[0]!.sourceIDs = [f.target.sourceIDs[0]!]; },
      (draft: AnswerGroupDraft) => { draft.analysis.specificationUpdates!.changes[0]!.requirementID = randomUUID(); },
    ]) { const draft = structuredClone(f.repaired); mutate(draft); assert.throws(() => tryDraft(draft)); }
    const changed = structuredClone(f.p); changed.requirements.find(r => r.id === f.target.id)!.acceptance.push("A newer human constraint");
    assert.throws(() => replayAnswerGroup(answerGroupMaterials(changed, f.items), permission));
    const spent = structuredClone(permission); spent.attempts = 0; assert.throws(() => replayAnswerGroup(f.m, spent));
    const ambiguous = structuredClone(permission); ambiguous.attempts++;
    const next = acceptAnswerGroup(f.m, ambiguous, f.draft, { answerGroupBlocked: { reason: "Original human choices actually conflict; permission cannot choose precedence" } }, f.job);
    assert.ok(next.blocked); assert.equal(ambiguous.attempts, 4); assert.equal(answerGroupProgress(ambiguous).repairs, 0);
  } finally { store.close(); }
});

test("rule grant is atomic on interrupted storage and conservative for stale/exhausted/non-scope blockers", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), state = store.workflow(f.p.id), submissions = store.submissions(f.p.id);
    for (const mutate of [
      (job: typeof f.job) => { job.expectedRevision--; },
      (job: typeof f.job) => { job.answerGroupWork!.attempts = 4; },
      (job: typeof f.job) => { job.status = "interrupted"; },
      (job: typeof f.job) => { job.answerGroupWork!.receipts.at(-1)!.response = { answerGroupBlocked: { reason: `Actual human conflict about ${f.target.id}` } }; },
    ]) { const job = structuredClone(f.job); mutate(job); assert.equal(answerGroupRuleRepairPreview(f.p, job), undefined); }
    const save = store.saveSubmission.bind(store);
    store.saveSubmission = () => { throw new Error("Injected grant write interruption"); };
    assert.throws(() => store.recoverAnswerGroupSources(f.p.id, f.p.revision, state.settingsVersion, f.job.id, "rule", f.preview), /Injected/);
    store.saveSubmission = save;
    assert.deepEqual(store.getJob(f.job.id), f.job); assert.deepEqual(store.workflow(f.p.id), state);
    assert.deepEqual(store.submissions(f.p.id), submissions); assert.deepEqual(store.get(f.p.id), f.p);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, state.settingsVersion, f.job.id, "rule", f.preview);
    assert.equal(store.getJob(f.job.id).answerGroupWork!.attempts, 3);
  } finally { store.close(); }
});

test("rule permission API requires local auth, exact target/preview, revision and settings CAS, and never starts model work", async () => {
  const store = new ProjectStore(":memory:"), f = fixture(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; assert.fail("Consent starts no inference"); } } });
  try {
    const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
    const body = { revision: f.p.revision, version: store.workflow(f.p.id).settingsVersion, action: "allow-shared-rule-repair",
      ruleConsent: { jobID: f.job.id, requirementID: f.target.id, previewKey: f.preview.previewKey } };
    const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${f.p.id}/workflow`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://example.invalid" })).status, 403);
    assert.equal((await post({ ...body, revision: body.revision - 1 })).status, 409);
    assert.equal((await post({ ...body, version: body.version + 1 })).status, 409);
    assert.equal((await post({ ...body, ruleConsent: undefined })).status, 400);
    assert.equal((await post({ ...body, action: "continue-continuous" })).status, 400);
    assert.equal((await post({ ...body, ruleConsent: { ...body.ruleConsent, requirementID: randomUUID() } })).status, 409);
    assert.equal((await post({ ...body, ruleConsent: { ...body.ruleConsent, previewKey: "0".repeat(64) } })).status, 409);
    assert.deepEqual(store.getJob(f.job.id), f.job);
    assert.equal((await post(body)).status, 200); assert.equal(calls, 0);
    assert.equal(store.getJob(f.job.id).answerGroupWork!.attempts, 3); assert.equal(store.workflow(f.p.id).paused, true);
    assert.deepEqual(store.get(f.p.id), f.p);
    assert.equal((await post(body)).status, 409);
  } finally { await app.close(); store.close(); }
});

for (const failure of ["cancelled", "malformed"] as const) test(`final permitted repair ${failure} preserves paid prefix and cannot refund the spent attempt`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "rule", f.preview);
    const granted = store.getJob(f.job.id), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() {
      calls++; if (failure === "cancelled") controller.abort(new DOMException("Stopped by user", "AbortError"));
      return {};
    } });
    const stopped = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(stopped.status, failure === "cancelled" ? "cancelled" : "failed");
    assert.equal(calls, 1); assert.equal(stopped.answerGroupWork!.attempts, 4);
    assert.deepEqual(stopped.answerGroupWork!.receipts, granted.answerGroupWork!.receipts);
    assert.deepEqual(replayAnswerGroup(f.m, stopped.answerGroupWork!).draft, f.draft);
    assert.deepEqual(store.get(f.p.id), f.p); assert.deepEqual(store.getJob(f.job.id), granted);
    assert.equal(answerGroupRuleRepairPreview(f.p, stopped), undefined);
    const retry = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(retry.status, "failed"); assert.equal(calls, 1);
    assert.equal(retry.answerGroupWork!.attempts, 4); assert.deepEqual(retry.answerGroupWork!.receipts, granted.answerGroupWork!.receipts);
  } finally { store.close(); }
});

test("45 to 46 preserves old work, grant and parent across reopen/portable adoption; downgrade and missing parent reject", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "rule-permission-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = fixture(store), original = structuredClone(f.job); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 46; PRAGMA user_version=45"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "rule", f.preview);
    const granted = store.getJob(f.job.id); store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), granted);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 20);
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === f.job.id)!.answerGroupWork, granted.answerGroupWork);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 19 }) }, f.p.model), /format 20/);
    const missing = JSON.parse(files["continuation.json"]!); missing.jobs = missing.jobs.filter((j: { id: string }) => j.id !== f.job.id);
    // A child preserving the grant cannot survive removal of its consent parent.
    const child = JSON.parse(files["continuation.json"]!).jobs.find((j: { id: string }) => j.id === f.job.id); child.id = randomUUID(); missing.jobs.push(child);
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(missing) }, f.p.model), /parent/);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) { const file = join(folder, ".reqwizit", name); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, value); }
    const clone = new ProjectStore(":memory:");
    try { const adopted = clone.openWorkspace(folder, f.p.model); assert.equal(clone.workflow(adopted.id).paused, true);
      assert.deepEqual(replayAnswerGroup(answerGroupMaterials(clone.get(adopted.id), clone.submissions(adopted.id)), clone.getJob(f.job.id).answerGroupWork!).draft, f.draft);
    } finally { clone.close(); }
    store.close(); db = new Database(path); const future = structuredClone(granted); (future.answerGroupWork!.ruleRepairPermission as { format: number }).format = 2;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), f.job.id); db.exec("DELETE FROM migration_history WHERE version >= 46; PRAGMA user_version=45"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 45);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(granted), f.job.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(f.job.id), granted);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Play adopts a scope stop without per-rule consent, retains old attempts, separates useful lookups and repairs, and rechecks all batches", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, true), before = structuredClone(f.job), version = store.workflow(f.p.id).settingsVersion;
    assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, version), [f.job.id]);
    const parent = store.getJob(f.job.id), w = parent.answerGroupWork!;
    assert.equal(w.ruleRepairPermission, undefined); assert.equal(w.attempts, 3);
    assert.deepEqual(w.receipts, before.answerGroupWork!.receipts);
    assert.equal(replayAnswerGroup(f.m, w).blocked, undefined);
    let loads = 0, repairs = 0, checks = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      if (context.manifest.answerGroupStage!.phase === "repair") {
        if (!loads) { const id = answerGroupLookupInventory(context).requestableIDs[0]!; assert.ok(id); loads++; return { answerGroupEvidence: { recordIDs: [id] } }; }
        repairs++; return { answerGroupRepair: f.repaired };
      }
      assert.equal(context.manifest.answerGroupStage!.phase, "check"); checks++;
      return { answerGroupCheck: { valid: true, reason: "Original evidence agrees with the repaired whole draft" } };
    } });
    const done = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(loads, 1); assert.equal(repairs, 1); assert.ok(checks >= w.batches.length);
    assert.equal(done.answerGroupWork!.receipts[w.receipts.length]!.attempt, 4);
    assert.equal(done.answerGroupWork!.receipts[w.receipts.length + 1]!.attempt, 5);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0, w.receipts.length), w.receipts);
    assert.deepEqual(store.getJob(f.job.id), parent);
  } finally { store.close(); }
});

test("Play never clears genuine human blockers or renews a no-progress safety stop", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), conflict = structuredClone(f.job);
    conflict.answerGroupWork!.receipts.at(-1)!.response = { answerGroupBlocked: { reason: "Conflicting human choices need a decision about precedence" } };
    // Mutating a receipt is not a valid recovery path, even with a new policy.
    assert.throws(() => adoptAnswerGroupPlay(f.m, conflict.answerGroupWork!, conflict), /saved product or unclassified blocker/);
    store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return {}; } });
    const failed = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(failed.status, "failed"); assert.equal(calls, answerGroupPlayLimits.failures);
    assert.equal(failed.answerGroupWork!.automation!.requests, 3); assert.equal(failed.answerGroupWork!.automation!.failures, 3);
    assert.deepEqual(store.get(f.p.id), f.p);
    const retry = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(retry.status, "failed"); assert.equal(calls, 3);
    assert.equal(retry.answerGroupWork!.automation!.requests, 3);
    const forgedJob = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(forgedJob.id, Date.now() + 60000);
    const refunded = structuredClone(retry.answerGroupWork!); refunded.automation!.requests = 0; refunded.automation!.failures = 0;
    assert.throws(() => store.checkpointAnswerGroup(forgedJob.id, refunded, answerGroupContext(f.m, refunded, f.draft).manifest), /cannot discard paid progress/);
  } finally { store.close(); }
});

test("46 to 47 preserves exhausted paid work; Play adoption survives reopen and portable cloning without replay or automatic calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "play-upgrade-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = fixture(store, true);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "rule", f.preview);
    const loaded = await new DiscoveryService(store, { async analyze(_p, { context }) {
      return { answerGroupEvidence: { recordIDs: [answerGroupLookupInventory(context).requestableIDs[0]!] } };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(loaded.answerGroupWork!.attempts, 4); assert.equal(loaded.answerGroupWork!.receipts.length, f.w.receipts.length + 1);
    for (const item of store.submissions(f.p.id)) { item.status = "needs-attention"; item.jobID = loaded.id; store.saveSubmission(item); }
    const original = store.getJob(loaded.id); store.close();
    const db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 47; PRAGMA user_version=46"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(loaded.id), original); store.close(); }
    store = new ProjectStore(path); store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion);
    const adopted = store.getJob(loaded.id); assert.equal(adopted.answerGroupWork!.attempts, 4);
    assert.deepEqual(adopted.answerGroupWork!.receipts, original.answerGroupWork!.receipts);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(loaded.id), adopted);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 29);
    assert.equal(adopted.answerGroupWork!.inputCapacity!.characters,200000,"Explicit Play adopts current guarded capacity without changing old paid work");
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === loaded.id)!.answerGroupWork, adopted.answerGroupWork);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 20 }) }, f.p.model), /format 21/);
    let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; return context.manifest.answerGroupStage!.phase === "repair" ? { answerGroupRepair: f.repaired }
        : { answerGroupCheck: { valid: true, reason: "Complete original evidence agrees" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.ok(calls > 1);
    assert.equal(done.answerGroupWork!.receipts[adopted.answerGroupWork!.receipts.length]!.attempt, 5);
    const published = store.get(f.p.id), completedFiles = renderWorkspace(published, undefined,
      continuationState(published, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.doesNotThrow(() => decodePortable(completedFiles, f.p.model));
    store.close();
    const futureDB = new Database(path), unsupported = structuredClone(adopted);
    (unsupported.answerGroupWork!.automation as { format: number }).format = 2;
    futureDB.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(unsupported), loaded.id);
    futureDB.exec("DELETE FROM migration_history WHERE version >= 47; PRAGMA user_version=46"); futureDB.close();
    assert.throws(() => new ProjectStore(path));
    const recoveryDB = new Database(path); assert.equal(recoveryDB.pragma("user_version", { simple: true }), 46);
    recoveryDB.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(adopted), loaded.id); recoveryDB.close();
    store = new ProjectStore(path); assert.deepEqual(store.getJob(loaded.id), adopted);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Play Pause saves the in-flight reply; Stop cancels immediately; neither clears work or rearms on read", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = fixture(store); let entered!: () => void, release!: (value: unknown) => void, requestSignal: AbortSignal | undefined;
    let ready = new Promise<void>(resolve => { entered = resolve; });
    workflow = new ProjectWorkflow(store, { async analyze(_p, { signal }) {
      requestSignal = signal; entered(); return await new Promise<unknown>(resolve => { release = resolve; });
    } });
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "play"); await ready;
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "pause");
    assert.equal(requestSignal!.aborted, false, "Pause must not discard a paid in-flight reply");
    release({ answerGroupRepair: f.repaired }); await workflow.wait(f.p.id);
    let last = store.jobs(f.p.id).filter(j => j.answerGroupWork).at(-1)!;
    assert.equal(answerGroupProgress(last.answerGroupWork!).repairs, 1); assert.equal(store.workflow(f.p.id).paused, true);
    const paid = last.answerGroupWork!.receipts.length;
    ready = new Promise<void>(resolve => { entered = resolve; });
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "play"); await ready;
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "stop");
    assert.equal(requestSignal!.aborted, true); release({ answerGroupCheck: { valid: true, reason: "Late cancelled reply" } });
    await workflow.wait(f.p.id);
    last = store.jobs(f.p.id).filter(j => j.answerGroupWork).at(-1)!;
    assert.equal(last.answerGroupWork!.receipts.length, paid); assert.equal(store.workflow(f.p.id).playPolicy!.stopped, true);
    assert.deepEqual(store.get(f.p.id), f.p); assert.equal(workflow.view(f.p.id).active, false);
  } finally { await workflow?.close(); store.close(); }
});

test("new Play groups start under the owned policy and completed self-origin work remains portable", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    let p = store.create("Fresh Play", "Retain actual answers", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), questions: ["Who can enter?", "Who can leave?"].map(text => ({ epicID: "project", text,
      whyItMatters: "Original behavior", options: [{ label: "People", consequence: "Allowed" }, { label: "Nobody", consequence: "Unavailable" }] })) });
    p = store.get(p.id);
    for (const q of p.questions) store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "People" } } });
    let reads = 0, checks = 0, entered!: () => void, release!: (value: unknown) => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    workflow = new ProjectWorkflow(store, { async analyze(project, { context }) {
      const stage = context.manifest.answerGroupStage;
      if (stage?.phase === "read") { reads++; entered(); return await new Promise<unknown>(resolve => { release = resolve; }); }
      if (stage?.phase === "check") { checks++; return { answerGroupCheck: { valid: true, reason: "Original answers retained" } }; }
      return { ...empty(), questions: [{ epicID: "project", text: "What should happen next?", whyItMatters: "A real missing product choice",
        options: [{ label: "Wait", consequence: "Keep waiting" }, { label: "Continue", consequence: "Proceed" }] }] };
    } });
    workflow.configure(p.id, p.revision, store.workflow(p.id).settingsVersion, "play"); await ready;
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "pause");
    release({ answerGroupDraft: { analysis: empty(), answers: store.submissions(p.id).map(s => ({ submissionID: s.id,
      outcome: "no-change", explanation: "No additional requirement beyond existing intent" })) } });
    await workflow.wait(p.id);
    const origin = store.jobs(p.id).find(j => j.answerGroupWork)!; assert.equal(origin.status, "interrupted");
    let failPublication = true; const finish = store.finishJob.bind(store);
    store.finishJob = (...args) => {
      if (store.getJob(args[0]).answerGroupWork && failPublication) { failPublication = false; throw new Error("Injected atomic publication interruption"); }
      return finish(...args);
    };
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "play"); await workflow.wait(p.id);
    const verified = store.jobs(p.id).filter(j => j.answerGroupWork).at(-1)!;
    assert.equal(verified.status, "failed"); assert.equal(answerGroupProgress(verified.answerGroupWork!).phase, "complete");
    const paid = reads + checks;
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "play"); await workflow.wait(p.id);
    const done = store.jobs(p.id).filter(j => j.answerGroupWork).at(-1)!;
    assert.equal(done.status, "completed", done.diagnostic); assert.ok(reads > 0 && checks > 0);
    assert.equal(reads + checks, paid, "Verified publication must recover with no repeated model calls");
    assert.equal(reads, 1, "The paid original read must not repeat after Pause");
    assert.equal(done.answerGroupWork!.automation!.sourceJobID, origin.id); assert.equal(done.answerGroupWork!.automation!.fromReceipt, 0);
    const project = store.get(p.id), files = renderWorkspace(project, undefined,
      continuationState(project, store.jobs(p.id), store.submissions(p.id), rev => store.get(p.id, rev)));
    assert.doesNotThrow(() => decodePortable(files, project.model));
  } finally { await workflow?.close(); store.close(); }
});

test("Play API requires local auth and revision/settings CAS, not a per-rule permission payload", async () => {
  const store = new ProjectStore(":memory:"), f = fixture(store); let calls = 0, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const app = await startApp({ store, port: 0, adapter: { async analyze(_p, { signal }) {
    calls++; entered(); return await new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } } });
  try {
    const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
    const body = { revision: f.p.revision, version: store.workflow(f.p.id).settingsVersion, action: "play" };
    const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${f.p.id}/workflow`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://example.invalid" })).status, 403);
    assert.equal((await post({ ...body, revision: f.p.revision - 1 })).status, 409);
    assert.equal((await post({ ...body, version: body.version + 1 })).status, 409);
    assert.equal(calls, 0); assert.equal(store.getJob(f.job.id).answerGroupWork!.automation, undefined);
    assert.equal((await post(body)).status, 200); await ready;
    assert.equal(store.getJob(f.job.id).answerGroupWork!.ruleRepairPermission, undefined);
    assert.equal((await post({ ...body, action: "stop", version: store.workflow(f.p.id).settingsVersion })).status, 200);
    assert.equal(store.workflow(f.p.id).playPolicy!.stopped, true); assert.deepEqual(store.get(f.p.id), f.p);
  } finally { await app.close(); store.close(); }
});

test("Play also adopts an already prepared saved cohort, not only needs-attention inputs", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "rule", f.preview);
    const before = store.getJob(f.job.id); assert.ok(store.submissions(f.p.id).every(s => s.status === "saved"));
    assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion), [f.job.id]);
    const after = store.getJob(f.job.id);
    assert.ok(after.answerGroupWork!.automation); assert.equal(after.answerGroupWork!.attempts, 3);
    assert.deepEqual(after.answerGroupWork!.receipts, before.answerGroupWork!.receipts);
    assert.deepEqual(after.answerGroupWork!.ruleRepairPermission, before.answerGroupWork!.ruleRepairPermission);
  } finally { store.close(); }
});
