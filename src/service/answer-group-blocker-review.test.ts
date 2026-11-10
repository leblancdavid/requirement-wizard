import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { analysisSchema } from "../core/model.js";
import { answerGroupMaterials, planAnswerGroup, adoptAnswerGroupPlay, answerGroupDraftSchema, boundAnswerGroupEvidence,
  acceptAnswerGroup, replayAnswerGroup, prepareAnswerGroupBlockerReview, answerGroupProgress, answerGroupPageCounts } from "../core/answer-group.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { discoveryPrompt } from "../runtime/discovery.js";
const empty = () => analysisSchema.parse({ summary: "Preserve originals", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function expand(input: unknown): any {
  const root = input as { sharedText?: { values: Record<string, string> }; identifierTable?: { values: string[] } };
  const decode = (value: any, field = ""): any => {
    if (typeof value === "number" && root.identifierTable && field !== "sharedTextID" && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return root.identifierTable.values[value];
    if (Array.isArray(value)) return value.map(v => decode(v, field));
    if (value && typeof value === "object") {
      if (Object.keys(value).length === 1 && value.recordTable) {
        const t = value.recordTable, absent = new Set(t.absent?.map(([r, c]: number[]) => `${r}:${c}`));
        return t.rows.map((row: unknown[], r: number) => Object.fromEntries(t.columns.flatMap((key: string, c: number) => absent.has(`${r}:${c}`) ? [] : [[key, decode(row[c], key)]])));
      }
      if (Object.keys(value).length === 1 && typeof value.sharedTextID === "string") return root.sharedText!.values[value.sharedTextID];
      if (Object.keys(value).length === 1 && Array.isArray(value.textParts)) return value.textParts.map((part: unknown) => decode(part)).join("");
      return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decode(v, key)]));
    }
    return value;
  };
  return decode(input);
}
function fixture(store: ProjectStore, distinct = false, transitive = false) {
  let p = store.create("Conflict fixture", "Preserve original human choices", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  const question = (text: string) => ({ text, epicID: "project", whyItMatters: "Resolve the exact original situation", options: [{ label: "Keep", consequence: "Preserve" }, { label: "Replace", consequence: "Replace the restriction" }] });
  store.finishJob(seed.id, { ...empty(), requirements: ["Retain behavior", "Retain other behavior"].map(statement => ({ epicID: "project", statement, rationale: "Original evidence", acceptance: ["Preserved"], sourceIDs: [p.sources[0]!.id] })), questions: ["First rule?", "Second rule?", "Should the explicit later choice replace the earlier restriction?"].map(text => ({
    text, epicID: "project", whyItMatters: "Resolve the exact original situation", options: [{ label: "Keep", consequence: "Preserve" }, { label: "Replace", consequence: "Replace the restriction" }] })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "Preserve original");
  for (const [index, q] of p.questions.entries()) store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer",
    questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: index === 2 ? "Use the later answer, replacing the earlier restriction" : index === 5 ? "Keep all materials; replace the old penalty" : `Original choice ${index}` } } });
  store.applyQueued(p.id, store.submissions(p.id).map(s => s.id)); p = store.get(p.id);
  if (distinct) for (const [index, text] of ["Third rule?", "Fourth rule?", "Does full retention replace the old penalty?"].entries()) {
    const id = randomUUID(), sourceID = randomUUID();
    p.questions.push({ ...question(text), id, status: "answered", sourceID });
    p.sources.push({ id: sourceID, kind: "answer", questionID: id, epicID: "project", text: index === 2 ? "Keep all materials; replace the old penalty" : `Separate original choice ${index}` });
  }
  if (transitive) for (const text of ["Historical restriction?", "Historical permission?"]) {
    const id = randomUUID(), sourceID = randomUUID(); p.questions.push({ ...question(text), id, status: "answered", sourceID });
    p.sources.push({ id: sourceID, kind: "answer", questionID: id, epicID: "project", text });
  }
  const items = p.questions.slice(0, 2).map(q => store.submissions(p.id).find(s => s.input.type === "answer" && s.input.questionID === q.id)!), conflicts = transitive ? p.questions.slice(6, 8).map(q => q.sourceID!) : items.map(s => s.appliedSourceID!), resolution = p.questions[2]!;
  // Curated historical saved question links, not inferred from answer prose.
  resolution.evidenceIDs = conflicts;
  if (distinct) p.questions[5]!.evidenceIDs = p.questions.slice(3, 5).map(q => q.sourceID!);
  if (transitive) p.questions[6]!.evidenceIDs = [p.questions[3]!.sourceID!];
  // Persist the curated project so service replay uses the same original bodies.
  (store as unknown as { db: Database.Database }).db.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(p), p.id);
  p = store.get(p.id);
  const state = store.workflow(p.id); state.enabled = true; state.paused = false; state.playPolicy = { format: 1, stopped: false };
  state.grant = { id: randomUUID(), used: 0, remainingMs: 300000, continuous: { format: 1 }, submissionIDs: items.map(s => s.id) }; store.saveWorkflow(p.id, state);
  const owner = store.claimWorkflow(p.id).owner!;
  const m = answerGroupMaterials(p, items), job = store.beginJob(p.id, p.revision, undefined, false, owner).job; store.claimJob(job.id, Date.now() + 60000);
  const w = adoptAnswerGroupPlay(m, planAnswerGroup(m), job);
  // Exact small units guarantee the resolution is omitted at the blocked step.
  w.batches = m.evidenceIDs.filter(id => !m.pins.has(id)).sort((a, b) => Number([resolution.id, resolution.sourceID].includes(a)) - Number([resolution.id, resolution.sourceID].includes(b))).map(id => [id]);
  delete w.evidencePages;
  assert.ok(w.batches.length > 1);
  w.planKey = createHash("sha256").update(JSON.stringify([w.policy, w.materialKey, w.submissionIDs, w.batches])).digest("hex");
  const draft = answerGroupDraftSchema.parse({ analysis: empty(), answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Original saved" })) });
  let packet = boundAnswerGroupEvidence(m, w); w.attempts++; w.automation!.requests++;
  acceptAnswerGroup(m, w, undefined, { answerGroupDraft: draft }, job);
  packet = boundAnswerGroupEvidence(m, w, draft);
  assert.ok(!packet.manifest.includedIDs.includes(resolution.sourceID!));
  w.attempts++; w.automation!.requests++; w.automation!.failures++;
  acceptAnswerGroup(m, w, draft, { answerGroupBlocked: { reason: `Original human decisions conflict: ${conflicts.join(" versus ")}. No precedence was established.` } }, job);
  store.checkpointAnswerGroup(job.id, w, packet.manifest); store.failJob(job.id, "failed", "Human conflict reported");
  store.releaseWorkflow(p.id, owner);
  replayAnswerGroup(m, store.getJob(job.id).answerGroupWork!);
  for (const item of items) { item.jobID = job.id; item.status = "needs-attention"; store.saveSubmission(item); }
  return { p, m, items, w, draft, job: store.getJob(job.id), resolution, conflicts };
}

/** Curated second, disjoint conflict after the retained v1 review and ALL reads. */
function secondConflictFixture(store: ProjectStore, repeat = false, transitive = false) {
  const f = fixture(store, true, transitive), w = structuredClone(f.w), job = store.beginJob(f.p.id, f.p.revision).job;
  store.claimJob(job.id, Date.now() + 60000);
  assert.ok(prepareAnswerGroupBlockerReview(f.m, w, f.draft));
  const turn = (response: unknown) => {
    boundAnswerGroupEvidence(f.m, w, f.draft); w.attempts++; w.automation!.requests++;
    acceptAnswerGroup(f.m, w, f.draft, response, job); w.automation!.failures = "answerGroupBlocked" in (response as object) ? 1 : 0;
  };
  turn({ answerGroupBlockerReview: { resolved: true, reason: "Explicit first human resolution", resolutionSourceIDs: [f.resolution.sourceID!] } });
  while (answerGroupProgress(w).phase === "read") turn({ answerGroupKeep: true });
  const conflicts = repeat ? f.conflicts : f.p.questions.slice(3, 5).map(q => q.sourceID!), resolution = f.p.questions[5]!;
  const context = boundAnswerGroupEvidence(f.m, w, f.draft);
  assert.ok(!context.manifest.includedIDs.includes(resolution.sourceID!));
  turn({ answerGroupBlocked: { reason: `Separate human decisions conflict about material retention: ${conflicts.join(" versus ")}` } });
  store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Separate verification conflict");
  for (const item of f.items) { item.jobID = job.id; item.status = "needs-attention"; store.saveSubmission(item); }
  assert.deepEqual(replayAnswerGroup(f.m, w).draft, f.draft);
  return { ...f, w, job: store.getJob(job.id), secondConflicts: conflicts, secondResolution: resolution };
}

for (const transitive of [false, true]) test(`a distinct verification conflict gets one appended review without losing the successful v1 resolution or repeating reads${transitive ? "; transitive candidate support closes older reviews too" : ""}`, async () => {
  const store = new ProjectStore(":memory:"); try {
    const f = secondConflictFixture(store, false, transitive), original = structuredClone(f.w), state = store.workflow(f.p.id);
    assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion), [f.job.id]);
    const prepared = store.getJob(f.job.id).answerGroupWork!;
    assert.deepEqual(prepared.blockerReview, original.blockerReview); assert.equal(prepared.blockerReviews!.length, 1); assert.equal(prepared.blockerReviews![0]!.format, 2);
    assert.deepEqual(prepared.receipts, original.receipts); assert.equal(prepared.attempts, original.attempts); assert.deepEqual(prepared.automation, original.automation);
    if (transitive) assert.ok(prepared.blockerReviews![0]!.candidateSourceIDs.includes(f.conflicts[0]!));
    assert.deepEqual(answerGroupProgress(prepared), answerGroupProgress(original));
    let reviews = 0, checks = 0;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      if (context.answerGroupBlockerReview) {
        reviews++; const exact = expand((context.data as { exactEvidence: unknown }).exactEvidence); assert.deepEqual(exact.draft, f.draft);
        for (const field of ["sources", "questions", "requirements", "research"] as const)
          for (const record of exact[field]) assert.deepEqual(record, f.p[field].find(r => r.id === record.id));
        assert.ok(context.manifest.includedIDs.includes(f.secondResolution.sourceID!));
        assert.ok(f.secondConflicts.every(id => context.manifest.includedIDs.includes(id)));
        return { answerGroupBlockerReview: { resolved: true, reason: "Exact second human replacement decision", resolutionSourceIDs: [f.secondResolution.sourceID!] } };
      }
      assert.equal(context.manifest.answerGroupStage!.phase, "check", "No settled read is repeated");
      if (f.conflicts.some(id => context.manifest.includedIDs.includes(id))) assert.ok(context.manifest.includedIDs.includes(f.resolution.sourceID!));
      if (f.secondConflicts.some(id => context.manifest.includedIDs.includes(id))) assert.ok(context.manifest.includedIDs.includes(f.secondResolution.sourceID!));
      checks++; return { answerGroupCheck: { valid: true, reason: "Exact originals and both explicit human resolutions agree" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic); assert.equal(reviews, 1); assert.equal(checks, original.batches.length);
    assert.deepEqual(result.answerGroupWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.deepEqual(result.answerGroupWork!.blockerReview, original.blockerReview);
    assert.equal(result.answerGroupWork!.automation!.requests, original.automation!.requests + reviews + checks);
  } finally { store.close(); }
});

for (const outcome of ["unresolved", "malformed", "cancel"] as const) test(`second conflict review ${outcome} retains the completed first review and cannot rearm or refund work`, async () => {
  const store = new ProjectStore(":memory:"); try {
    const f = secondConflictFixture(store), state = store.workflow(f.p.id), controller = new AbortController();
    store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion); let calls = 0;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.answerGroupBlockerReview);
      if (outcome === "cancel") controller.abort(new Error("Stopped"));
      return outcome === "unresolved" ? { answerGroupBlockerReview: { resolved: false, reason: "No explicit second human precedence", resolutionSourceIDs: [] } } : {};
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(result.status, outcome === "cancel" ? "cancelled" : "failed", result.diagnostic);
    const w = result.answerGroupWork!; assert.equal(calls, outcome === "malformed" ? 2 : 1);
    assert.deepEqual(w.blockerReview, f.w.blockerReview); assert.deepEqual(w.receipts.slice(0, f.w.receipts.length), f.w.receipts);
    assert.deepEqual(answerGroupProgress(w), answerGroupProgress(f.w)); assert.equal(w.attempts, f.w.attempts + calls);
    assert.equal(w.automation!.requests, f.w.automation!.requests + calls); assert.equal(prepareAnswerGroupBlockerReview(f.m, w, f.draft), false);
    assert.deepEqual(replayAnswerGroup(f.m, w).draft, f.draft);
  } finally { store.close(); }
});

test("repeated, reworded and overlapping conflicts never buy another review; the total review ledger is bounded", () => {
  const store = new ProjectStore(":memory:"); try {
    const f = secondConflictFixture(store, true), w = structuredClone(f.w);
    assert.equal(prepareAnswerGroupBlockerReview(f.m, w, f.draft), false); assert.deepEqual(w, f.w);
    const last = w.receipts.at(-1)!.response; assert.ok("answerGroupBlocked" in last);
    last.answerGroupBlocked.reason = `Different wording still conflicts about ${f.conflicts[0]} and ${f.p.questions[3]!.sourceID}`;
    assert.equal(prepareAnswerGroupBlockerReview(f.m, w, f.draft), false, "Changing one cited source cannot renew the same conflict");
    const state = store.workflow(f.p.id); assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion), []);
    const capped = structuredClone(f.w); capped.blockerReviews = Array.from({ length: 7 }, () => ({ ...capped.blockerReview!, format: 2 as const }));
    assert.equal(prepareAnswerGroupBlockerReview(f.m, capped, f.draft), false);
  } finally { store.close(); }
});

test("56 to 57 retains paid v1 review/read/check history; appended v2 survives reopen/clone, downgrade/tampering and future-format rollback", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "distinct-reviews-")), path = join(dir, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = secondConflictFixture(store), original = store.getJob(f.job.id); store.close(); let db = new Database(path);
    db.exec("DELETE FROM migration_history WHERE version>=57; PRAGMA user_version=56"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path); const state = store.workflow(f.p.id); assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion), [f.job.id]);
    const prepared = store.getJob(f.job.id); assert.deepEqual(prepared.answerGroupWork!.blockerReview, original.answerGroupWork!.blockerReview);
    const w = structuredClone(prepared.answerGroupWork!), current = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(current.id, Date.now() + 60000);
    const context = boundAnswerGroupEvidence(f.m, w, f.draft); store.checkpointAnswerGroup(current.id, w, context.manifest);
    const bad = structuredClone(w); bad.blockerReviews![0]!.prefixKey = "0".repeat(64);
    assert.throws(() => store.checkpointAnswerGroup(current.id, bad, context.manifest), /boundar/);
    for (const mutate of [(copy: typeof w) => { copy.blockerReviews![0]!.records[0]!.key = "0".repeat(64); },
      (copy: typeof w) => { copy.blockerReviews![0]!.conflictIDs = copy.blockerReview!.conflictIDs; },
      (copy: typeof w) => { copy.blockerReviews![0]!.fromReceipt = copy.blockerReview!.fromReceipt; },
      (copy: typeof w) => { copy.blockerReviews!.push(copy.blockerReviews![0]!); }]) {
      const copy = structuredClone(w); mutate(copy); assert.throws(() => replayAnswerGroup(f.m, copy));
    }
    store.failJob(current.id, "interrupted", "Pending distinct review retained");
    for (const item of f.items) { item.jobID = current.id; store.saveSubmission(item); }
    const saved = store.getJob(current.id); store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(current.id), saved);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 31); assert.doesNotThrow(() => decodePortable(files, f.p.model));
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 30 }) }, f.p.model), /format 31/);
    const folder = join(dir, "clone"); for (const [name, content] of Object.entries(files)) { const file = join(folder, ".reqwizit", name); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, content); }
    const clone = new ProjectStore(":memory:"); try {
      const adopted = clone.openWorkspace(folder, f.p.model), retained = clone.getJob(current.id).answerGroupWork!, material = answerGroupMaterials(adopted, retained.submissionIDs.map(id => clone.submissions(adopted.id).find(s => s.id === id)!));
      assert.deepEqual(retained, w); assert.deepEqual(replayAnswerGroup(material, retained).draft, f.draft); assert.deepEqual(boundAnswerGroupEvidence(material, retained, f.draft).data, context.data);
      assert.equal(clone.workflow(adopted.id).paused, true);
    } finally { clone.close(); }
    store.close(); db = new Database(path); const future = structuredClone(saved); future.answerGroupWork!.blockerReviews![0]!.format = 3 as never;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), current.id); db.exec("DELETE FROM migration_history WHERE version>=57; PRAGMA user_version=56"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 56);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), current.id); db.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(current.id), saved);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("Play reviews omitted linked human resolution once, preserving paid work and completing original reads/checks only afterward", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), before = structuredClone(f.w);
    const state = store.workflow(f.p.id); assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion), [f.job.id]);
    const prepared = store.getJob(f.job.id).answerGroupWork!;
    assert.deepEqual(prepared.receipts, before.receipts); assert.equal(prepared.attempts, before.attempts); assert.deepEqual(prepared.automation, before.automation);
    assert.deepEqual(answerGroupProgress(prepared), answerGroupProgress(before)); assert.deepEqual(answerGroupPageCounts(prepared), answerGroupPageCounts(before));
    assert.equal(prepareAnswerGroupBlockerReview(f.m, prepared, f.draft), false);
    let reviews = 0, reads = 0, checks = 0;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      if (context.answerGroupBlockerReview) {
        reviews++; assert.ok(context.manifest.includedIDs.includes(f.resolution.sourceID!)); assert.ok(context.manifest.includedIDs.includes(f.resolution.id));
        assert.ok(f.conflicts.every(id => context.manifest.includedIDs.includes(id))); assert.ok(context.manifest.characters <= 96000);
        const exact = expand((context.data as { exactEvidence: unknown }).exactEvidence);
        assert.deepEqual(exact.draft, f.draft);
        for (const field of ["sources", "questions", "requirements", "research"] as const)
          for (const record of exact[field]) assert.deepEqual(record, f.p[field].find(r => r.id === record.id));
        assert.ok([...f.m.pins].every(id => context.manifest.includedIDs.includes(id)));
        assert.match(discoveryPrompt(f.p, context), /Links establish relevance ONLY/);
        return { answerGroupBlockerReview: { resolved: true, reason: "The explicit human answer replaces the restriction for this exact situation", resolutionSourceIDs: [f.resolution.sourceID!] } };
      }
      if (f.conflicts.some(id => context.manifest.includedIDs.includes(id))) assert.ok(context.manifest.includedIDs.includes(f.resolution.sourceID!), "Resolution stays beside conflicting originals");
      if (context.manifest.answerGroupStage!.phase === "read") { reads++; return { answerGroupKeep: true }; }
      checks++; return { answerGroupCheck: { valid: true, reason: "Exact detailed originals agree with the complete draft" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic); assert.equal(reviews, 1); assert.ok(reads > 0); assert.equal(checks, before.batches.length);
    assert.deepEqual(result.answerGroupWork!.receipts.slice(0, before.receipts.length), before.receipts);
    assert.equal(result.answerGroupWork!.automation!.requests, before.automation!.requests + reviews + reads + checks);
    assert.deepEqual(replayAnswerGroup(f.m, result.answerGroupWork!).draft, f.draft);
  } finally { store.close(); }
});
for (const outcome of ["unresolved", "malformed", "cancel"] as const) test(`blocker review ${outcome} retains draft/progress and cannot rearm its one-review boundary`, async () => {
  const store = new ProjectStore(":memory:"); try {
    const f = fixture(store), controller = new AbortController(); let calls = 0;
    const state = store.workflow(f.p.id); store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion);
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.answerGroupBlockerReview);
      if (outcome === "cancel") controller.abort(new Error("Stopped"));
      return outcome === "unresolved" ? { answerGroupBlockerReview: { resolved: false, reason: "The linked answer does not establish precedence", resolutionSourceIDs: [] } } : {};
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(result.status, outcome === "cancel" ? "cancelled" : "failed", result.diagnostic); assert.equal(calls, outcome === "malformed" ? 2 : 1, result.diagnostic);
    const w = result.answerGroupWork!; assert.deepEqual(w.receipts.slice(0, f.w.receipts.length), f.w.receipts);
    assert.deepEqual(answerGroupProgress(w), answerGroupProgress(f.w)); assert.equal(w.attempts, f.w.attempts + calls);
    assert.equal(w.automation!.requests, f.w.automation!.requests + calls); assert.deepEqual(replayAnswerGroup(f.m, w).draft, f.draft);
    assert.equal(prepareAnswerGroupBlockerReview(f.m, w, f.draft), false);
  } finally { store.close(); }
});
test("review rejects draft/progress edits, guessed/duplicate/unresolved citations, tampering and activation without genuinely omitted linked answers", () => {
  const store = new ProjectStore(":memory:"); try {
    const f = fixture(store), w = structuredClone(f.w); assert.ok(prepareAnswerGroupBlockerReview(f.m, w, f.draft));
    for (const raw of [{ answerGroupKeep: true }, { answerGroupDraft: f.draft },
      { answerGroupBlockerReview: { resolved: true, reason: "No citation", resolutionSourceIDs: [] } },
      { answerGroupBlockerReview: { resolved: true, reason: "Guessed", resolutionSourceIDs: [randomUUID()] } },
      { answerGroupBlockerReview: { resolved: true, reason: "Repeated", resolutionSourceIDs: [f.resolution.sourceID!, f.resolution.sourceID!] } },
      { answerGroupBlockerReview: { resolved: false, reason: "Unresolved", resolutionSourceIDs: [f.resolution.sourceID!] } }]) {
      const copy = structuredClone(w); copy.attempts++; copy.automation!.requests++;
      assert.throws(() => acceptAnswerGroup(f.m, copy, f.draft, raw, f.job)); assert.deepEqual(copy.receipts, w.receipts);
    }
    for (const mutate of [(copy: typeof w) => { copy.blockerReview!.prefixKey = "0".repeat(64); },
      (copy: typeof w) => { copy.blockerReview!.records[0]!.key = "0".repeat(64); }, (copy: typeof w) => { copy.blockerReview!.priorAttempts++; }]) {
      const copy = structuredClone(w); mutate(copy); assert.throws(() => replayAnswerGroup(f.m, copy));
    }
    const noLinks = structuredClone(f.p); noLinks.questions.find(q => q.id === f.resolution.id)!.evidenceIDs = [];
    const m = answerGroupMaterials(noLinks, f.items); assert.equal(prepareAnswerGroupBlockerReview(m, structuredClone(f.w), f.draft), false);
  } finally { store.close(); }
});
test("55 to 56 preserves old work and pending/completed review across reopen/portable reads; downgrade and future format roll back without resets", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "blocker-review-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = fixture(store), original = store.getJob(f.job.id); store.close(); let db = new Database(path);
    db.exec("DELETE FROM migration_history WHERE version>=56; PRAGMA user_version=55"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path); const state = store.workflow(f.p.id); store.prepareAnswerGroupPlay(f.p.id, f.p.revision, state.settingsVersion);
    const prepared = store.getJob(f.job.id); store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), prepared);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 30); assert.doesNotThrow(() => decodePortable(files, f.p.model));
    const folder = join(dir, "clone");
    for (const [name, content] of Object.entries(files)) { const file = join(folder, ".reqwizit", name); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, content); }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, f.p.model), retained = clone.getJob(f.job.id).answerGroupWork!;
      const material = answerGroupMaterials(adopted, retained.submissionIDs.map(id => clone.submissions(adopted.id).find(s => s.id === id)!));
      assert.deepEqual(retained.receipts, prepared.answerGroupWork!.receipts);
      assert.deepEqual(replayAnswerGroup(material, retained).draft, f.draft);
      assert.ok(boundAnswerGroupEvidence(material, retained, f.draft).answerGroupBlockerReview);
      assert.equal(clone.workflow(adopted.id).paused, true);
    } finally { clone.close(); }
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 29 }) }, f.p.model), /format 30/);
    const w = structuredClone(prepared.answerGroupWork!); w.attempts++; w.automation!.requests++;
    acceptAnswerGroup(f.m, w, f.draft, { answerGroupBlockerReview: { resolved: true, reason: "Explicit human replacement", resolutionSourceIDs: [f.resolution.sourceID!] } }, f.job);
    assert.deepEqual(replayAnswerGroup(f.m, w).draft, f.draft);
    assert.deepEqual(answerGroupProgress(w), answerGroupProgress(f.w));
    assert.deepEqual(answerGroupPageCounts(w), answerGroupPageCounts(f.w));
    store.close(); db = new Database(path); const saved = { ...prepared, answerGroupWork: w };
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), f.job.id); db.close();
    store = new ProjectStore(path); assert.deepEqual(replayAnswerGroup(f.m, store.getJob(f.job.id).answerGroupWork!).draft, f.draft); store.close();
    db = new Database(path); const future = structuredClone(saved); future.answerGroupWork.blockerReview!.format = 2 as never;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), f.job.id); db.exec("DELETE FROM migration_history WHERE version>=56; PRAGMA user_version=55"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 55);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), f.job.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(f.job.id).answerGroupWork!.receipts, w.receipts);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("missing draft, spent safety limits and oversized exact resolution evidence stop before inference without resetting work", () => {
  const store = new ProjectStore(":memory:"); try {
    const f = fixture(store);
    assert.equal(prepareAnswerGroupBlockerReview(f.m, structuredClone(f.w)), false);
    for (const field of ["requests", "failures"] as const) {
      const w = structuredClone(f.w); w.automation![field] = field === "requests" ? 256 : 3;
      const original = structuredClone(w); assert.equal(prepareAnswerGroupBlockerReview(f.m, w, f.draft), false); assert.deepEqual(w, original);
    }
    const project = structuredClone(f.p); project.sources.find(s => s.id === f.resolution.sourceID)!.text = randomBytes(60000).toString("hex");
    const material = answerGroupMaterials(project, f.items), w = structuredClone(f.w);
    assert.throws(() => prepareAnswerGroupBlockerReview(material, w, f.draft), /budget|fit|context/i);
    assert.deepEqual(w, f.w, "Failed fit cannot record a partial review or discard evidence/counters");
  } finally { store.close(); }
});
