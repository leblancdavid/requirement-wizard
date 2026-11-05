import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/definition-dimensions.js";
import { coverage } from "../core/coverage.js";
import { discoveryPrompt, scanPrompt, questionHelpPrompt } from "../runtime/discovery.js";
import type { Project } from "../core/model.js";
import { changeEvidenceWire, expandChangeIdentifiers, expandChangeCitationAuthority, withChangeCitationAuthority } from "../core/definition-change-wire.js";
import { definitionFindingIdentityKey } from "../core/definition-finding-identity.js";
import { prepareDefinitionChangeEvidence, definitionChangeEvidenceContext } from "../core/definition-change-evidence.js";
import { prepareDefinitionChangeReview, validateDefinitionChangeResponse, definitionChangeLimits } from "../core/definition-change-review.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionChangeWorkSchema, type DefinitionChangeWork } from "../core/definition-change-schema.js";

function fixture(notes = 0, noteLength = 1000) {
  const store = new ProjectStore(":memory:");
  let p = store.create("Change review service", "Preserve original findings", { providerID: "openai", modelID: "fixture" });
  for (let i = 0; i < notes; i++) p = store.note(p.id, p.revision, `${i}: Original exact supporting decision. `.padEnd(noteLength, "x"), "project");
  const empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
  let job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Complete original findings",
    checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: `Original ${dimension}`, evidenceIDs: p.sources.map((s) => s.id) })) }] });
  p = store.get(p.id); const original = structuredClone(p);
  job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), questions: [{ epicID: "project", text: "When is equipment available?", whyItMatters: "New exact choice", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: "Next connection", consequence: "Available next time" }, { label: "After confirmation", consequence: "Wait for confirmation" }] }] });
  p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Next connection" });
  const state = store.workflow(p.id); state.enabled = true; state.paused = false;
  state.grant = { id: randomUUID(), used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
  const owned = store.claimWorkflow(p.id);
  const task = store.definitionChangeTask(p.id, "project")!;
  const response = { taskKey: task.taskKey, outcome: "unaffected", explanation: "Fixture-only complete comparison",
    checks: dimensions.map((dimension) => ({ dimension, outcome: "unaffected", reason: "Original finding retained after exact change comparison", evidenceIDs: [p.sources.at(-1)!.id] })) };
  return { store, p, original, task, response, owner: owned.owner! };
}

for (const mode of ["success", "cancelled", "stale", "timeout", "research", "model", "malformed"] as const)
test(`owned change review preserves exact publication, allowance and failure boundaries: ${mode}`, async () => {
  const { store, p, original, task, response, owner } = fixture(), controller = new AbortController(); let requests = 0;
  try {
    const adapter: DiscoveryAdapter = { async analyze(snapshot, options) {
      assert.deepEqual(snapshot, p); assert.deepEqual(options.context.data, task.context.data); assert.equal(options.research, false);
      assert.deepEqual(expandChangeCitationAuthority(options.context.data, options.context.definitionChangeCitationAuthority!), (task.context.data as { evidenceCitationIDs: string[] }).evidenceCitationIDs);
      if (mode === "cancelled") controller.abort();
      if (mode === "stale") store.note(p.id, p.revision, "Concurrent exact decision", "project");
      if (mode === "timeout") return new Promise(() => {});
      if (mode === "research") { try { options.onResearch([{ url: "https://example.com", excerpt: "Unrequested research", retrievedAt: new Date().toISOString(), kind: "fetched-page" }]); } catch { /* A swallowed callback cannot clear the violation. */ } }
      if (mode === "model") { try { options.onTelemetry({ actualModel: { providerID: "other", modelID: "other" }, usage: null, runtimeReportedCost: null }); } catch { /* Sticky profile failure. */ } }
      return mode === "malformed" ? { ...response, taskKey: "0".repeat(64) } : response;
    } };
    const service = new DiscoveryService(store, adapter, { workflow: { owner,
      beforeJob: () => ({ requests: 1, durationMs: mode === "timeout" ? 20 : 300000 }), beforeRequest: () => { requests++; } } });
    const job = await service.reviewDefinitionChanges(p.id, p.revision, "project", controller.signal);
    assert.equal(requests, 1); assert.equal(job.definitionChangeWork!.attempts, 1);
    assert.equal(job.status, mode === "success" ? "completed" : mode === "timeout" ? "interrupted" : ["research", "model", "malformed"].includes(mode) ? "failed" : mode);
    assert.deepEqual(store.get(p.id).assessments, original.assessments);
    if (mode === "success") {
      assert.equal(coverage(store.get(p.id)).epics.find((a) => a.epicID === "project")!.stale, false);
      assert.equal(store.get(p.id).definitionChangeReviews![0]!.responseJobID, job.id);
    } else {
      assert.equal(store.get(p.id).definitionChangeReviews, undefined);
      assert.equal(!!job.definitionChangeWork!.response, mode === "stale");
    }
  } finally { store.close(); }
});

test("change-review prompt is exclusive JSON/no-tools and cannot become a scan or question-help task", () => {
  const { store, p, task } = fixture();
  try {
    const prompt = discoveryPrompt(p, task.context, false);
    assert.match(prompt, /CHANGE-IMPACT REVIEW ONLY/); assert.match(prompt, /review-needed/); assert.match(prompt, /no tools, research or coding/);
    assert.throws(() => scanPrompt(p, task.context), /scan profile/);
    assert.throws(() => questionHelpPrompt(p, { questionID: p.questions[0]!.id, action: "why" }, task.context), /question-help profile/);
  } finally { store.close(); }
});

test("v1/v2 seed and dispatch paths all expose exact authority; v2 historical and unloaded original citations remain rejected with unchanged saved lookup keys", () => {
  const f = fixture(2), limits = definitionChangeLimits as { characters: number }, originalBound = limits.characters;
  try {
    const original = structuredClone(f.original), current = structuredClone(f.p);
    const [historicalID, successorID] = original.sources.filter(source => source.kind === "note").map(source => source.id);
    for (const project of [original, current]) project.sources.find(source => source.id === successorID)!.supersedes = historicalID;
    for (const assessment of original.assessments) assessment.inputBasis = { format: 1, key: definitionInputKey(original, assessment.epicID, assessment.checks.flatMap(check => check.evidenceIDs)) };
    current.assessments = structuredClone(original.assessments);
    const legacy = prepareDefinitionChangeReview(original, current, "project")!, task = prepareDefinitionChangeEvidence(original, current, "project")!;
    assert.ok(legacy); assert.ok(task);
    for (const seed of [legacy, task]) {
      const request = withChangeCitationAuthority(seed.context);
      assert.equal(definitionFindingIdentityKey(seed.context.data), seed.contextKey);
      const body = request.data as Record<string, unknown>;
      assert.equal(definitionFindingIdentityKey(body.identifierTable ? expandChangeIdentifiers(body) : body), seed.contextKey);
      const allowed = expandChangeCitationAuthority(request.data, request.definitionChangeCitationAuthority!);
      assert.deepEqual(allowed, seed.fields.format === 1 ? seed.context.manifest.includedIDs : (seed.context.data as { evidenceCitationIDs: string[] }).evidenceCitationIDs);
      const prompt = discoveryPrompt(current, seed.context, false);
      assert.match(prompt, /APP-OWNED CITATION AUTHORITY/); assert.match(prompt, /EXACT whitelist/);
      const schema = prompt.slice(prompt.indexOf("Schema: "), prompt.indexOf("\nExact working context: "));
      assert.equal(schema.includes('"loadEvidenceIDs"'), seed.fields.format === 2);
      assert.ok(!schema.includes('"batchKey"') && !schema.includes('"jointReview"'));
    }
    const model = { providerID: "openai", modelID: "fixture" }, work: Extract<DefinitionChangeWork, { format: 2 }> = {
      format: 2, policy: "definition-change-evidence-v2", epicID: "project", assessmentKey: task.fields.assessmentKey,
      taskKey: task.taskKey, contextKey: task.contextKey, attempts: 2,
      loads: [{ contextKey: task.contextKey, requestedIDs: [historicalID!], attempts: 1, jobID: randomUUID(), model }],
    };
    const unchanged = structuredClone(work), request = definitionChangeEvidenceContext(task, work);
    assert.ok(request.context.manifest.includedIDs.includes(historicalID!));
    assert.ok(!request.citationIDs.includes(historicalID!)); assert.ok(!request.citationIDs.includes(successorID!));
    assert.deepEqual(request.context.definitionChangeCitationAuthority!.historicalEvidenceIDs, [historicalID]);
    assert.deepEqual(expandChangeCitationAuthority(request.context.data, request.context.definitionChangeCitationAuthority!), request.citationIDs);
    const body = request.context.data as Record<string, unknown>;
    assert.equal(request.contextKey, definitionFindingIdentityKey(body.identifierTable ? expandChangeIdentifiers(body) : body));
    const scope = { taskKey: task.taskKey, context: { ...request.context, manifest: { ...request.context.manifest, includedIDs: request.citationIDs } } };
    const valid = { ...f.response, taskKey: task.taskKey, checks: f.response.checks.map(check => ({ ...check, evidenceIDs: [request.citationIDs[0]!] })) };
    for (const [id, category] of [[historicalID, /historical\/superseded/], [successorID, /not supplied as citable evidence/]] as const) {
      const invalid = { ...valid, checks: valid.checks.map(check => check.dimension === "quality" ? { ...check, evidenceIDs: [id!] } : check) };
      const before = structuredClone(invalid);
      assert.throws(() => validateDefinitionChangeResponse(scope, invalid), category); assert.deepEqual(invalid, before);
    }
    assert.throws(() => validateDefinitionChangeResponse(scope, { ...valid, taskKey: "f".repeat(64) }), /response taskKey differs/);
    assert.deepEqual(validateDefinitionChangeResponse(scope, valid), valid); assert.deepEqual(work, unchanged);
    const saved = definitionChangeWorkSchema.parse({ ...work, response: valid, responseJobID: randomUUID(), responseModel: model, responseContextKey: request.contextKey });
    if (saved.format !== 2) assert.fail();
    limits.characters = 1;
    assert.equal(definitionChangeEvidenceContext(task, saved).contextKey, saved.responseContextKey, "Compatible saved v2 output is not invalidated by dispatch-only advice overhead");
    assert.throws(() => definitionChangeEvidenceContext(task, work), /bounded joint context/);
    assert.deepEqual(work, unchanged);
  } finally { limits.characters = originalBound; f.store.close(); }
});

test("ordinary callers cannot start an impact check without an owned Continue grant", async () => {
  const { store, p } = fixture();
  try {
    let calls = 0; const before = store.jobs(p.id);
    await assert.rejects(new DiscoveryService(store, { async analyze() { calls++; } }).reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal), /owned Continue/);
    assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), before);
  } finally { store.close(); }
});

test("source-backed change review loads an omitted exact body before retaining all nine original findings", async () => {
  const { store, p, original, task, response, owner } = fixture(10, 12000);
  const hidden = original.sources.filter((s) => s.kind === "note")[0]!;
  let calls = 0;
  try {
    assert.ok(JSON.stringify(original.sources).length > 96000, "All original bodies cannot fit in a single change request");
    const service = new DiscoveryService(store, { async analyze(_project, options) {
      calls++; const data = options.context.data as { evidence: Project["sources"]; evidenceIndex: {id:string}[]; evidenceLoading: {turn:number} };
      assert.equal(options.context.manifest.definitionChangeReview!.format, 2);
      assert.ok(options.context.manifest.characters <= 96000);
      if (!data.evidenceLoading.turn) {
        assert.ok(data.evidenceIndex.some((r) => r.id === hidden.id));
        assert.ok(!data.evidence.some((r) => r.id === hidden.id));
        return { taskKey: task.taskKey, loadEvidenceIDs: [hidden.id] };
      }
      assert.deepEqual(data.evidence.find((r) => r.id === hidden.id), hidden);
      assert.ok(data.evidence.some((r) => r.id === p.sources.at(-1)!.id), "New answer stays supplied beside old evidence");
      return { ...response, checks: response.checks.map((c) => ({ ...c, evidenceIDs: [hidden.id, p.sources.at(-1)!.id] })) };
    } }, { workflow: { owner, beforeJob: () => ({ requests: 8, durationMs: 300000 }), beforeRequest: () => {} } });
    const done = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, 2);
    assert.equal(done.definitionChangeWork!.format, 2); if (done.definitionChangeWork!.format !== 2) assert.fail();
    assert.equal(done.definitionChangeWork!.loads.length, 1);
    const current = store.get(p.id), receipt = current.definitionChangeReviews![0]!;
    assert.equal(receipt.format, 2); if (receipt.format !== 2) assert.fail();
    assert.deepEqual(receipt.loadedEvidenceIDs, [hidden.id]); assert.equal(coverage(current).epics.find((a) => a.epicID === "project")!.stale, false);
    assert.deepEqual(current.assessments, original.assessments); assert.deepEqual(current.requirements, p.requirements);
    assert.equal(store.definitionChangeTask(p.id, "project"), undefined);
  } finally { store.close(); }
});

test("accepted source lookups and failed final attempts survive explicit bounded continuation without repeating accepted calls", async () => {
  const { store, p, task, response, owner } = fixture(1), id = p.sources.find((s) => s.kind === "note")!.id;
  let allowance = 1, calls = 0, fail = true;
  try {
    const service = new DiscoveryService(store, { async analyze(_p, {context}) {
      calls++; const turn = (context.data as { evidenceLoading: {turn:number} }).evidenceLoading.turn;
      if (!turn) { assert.equal(calls, 1); return { taskKey: task.taskKey, loadEvidenceIDs: [id] }; }
      if (fail) { fail = false; throw new Error("Synthetic network interruption"); }
      return response;
    } }, { workflow: { owner, beforeJob: () => ({ requests: allowance, durationMs: 300000 }), beforeRequest: () => {} } });
    const first = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(first.status, "interrupted", first.diagnostic); assert.equal(calls, 1);
    allowance = 8;
    const second = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(second.status, "failed"); assert.equal(second.definitionChangeWork!.attempts, 1);
    const third = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(third.status, "completed", third.diagnostic); assert.equal(third.definitionChangeWork!.attempts, 2); assert.equal(calls, 3);
    if (third.definitionChangeWork!.format !== 2) assert.fail();
    assert.deepEqual(third.definitionChangeWork!.loads, first.definitionChangeWork!.format === 2 ? first.definitionChangeWork!.loads : undefined);
  } finally { store.close(); }
});

test("oversized requested evidence retains its charged lookup when the grant pauses before batch work", async () => {
  const { store, p, task, owner } = fixture(8, 12000), ids = p.sources.filter((s) => s.kind === "note").map((s) => s.id);
  let calls = 0;
  try {
    const service = new DiscoveryService(store, { async analyze() { calls++; if (calls > 1) throw new Error("Synthetic batch failure"); return { taskKey: task.taskKey, loadEvidenceIDs: ids }; } },
      { workflow: { owner, beforeJob: () => ({ requests: 1, durationMs: 300000 }), beforeRequest: () => {} } });
    for (let i = 0; i < 2; i++) {
      const result = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
      assert.equal(result.status, i === 0 ? "interrupted" : "failed"); assert.equal(calls, i + 1);
      if (result.definitionChangeWork!.format !== 3) assert.fail();
      assert.equal(result.definitionChangeWork!.loads.length, 1); assert.equal(result.definitionChangeWork!.loads[0]!.attempts, 1);
      assert.equal(result.definitionChangeWork!.response, undefined); assert.equal(store.get(p.id).definitionChangeReviews, undefined);
    }
  } finally { store.close(); }
});

for(const mode of ["cancelled","stale","expired"] as const)test(`a ${mode} final reply cannot discard accepted source reads or acquire current authority`,async()=>{
  const {store,p,task,response,owner}=fixture(1), controller=new AbortController(), id=p.sources.find(s=>s.kind==="note")!.id;let calls=0;
  try{
    const service=new DiscoveryService(store,{async analyze(){
      calls++;if(calls===1)return {taskKey:task.taskKey,loadEvidenceIDs:[id]};
      if(mode==="cancelled")controller.abort();
      if(mode==="stale")store.note(p.id,p.revision,"Concurrent changed decision","project");
      if(mode==="expired")store.failJob(store.jobs(p.id).at(-1)!.id,"interrupted","Fixture ownership ended");
      return response;
    }},{workflow:{owner,beforeJob:()=>({requests:8,durationMs:300000}),beforeRequest:()=>{}}});
    const result=await service.reviewDefinitionChanges(p.id,p.revision,"project",controller.signal), work=result.definitionChangeWork!;
    if(work.format!==2)assert.fail();assert.equal(work.loads.length,1);assert.equal(work.attempts,1);assert.equal(calls,2);
    assert.equal(result.status,mode==="expired"?"interrupted":mode);assert.equal(!!work.response,mode==="stale");
    assert.equal(store.get(p.id).definitionChangeReviews,undefined);
  }finally{store.close();}
});

test("continuous evidence loading uses per-request timeouts rather than restarting a whole-check cutoff",async()=>{
  const {store,p,task,response,owner}=fixture(1),id=p.sources.find(s=>s.kind==="note")!.id;let calls=0;
  try{
    const service=new DiscoveryService(store,{async analyze(){
      calls++;await new Promise(resolve=>setTimeout(resolve,200));
      return calls===1?{taskKey:task.taskKey,loadEvidenceIDs:[id]}:response;
    }},{workflow:{owner,continuous:true,beforeJob:()=>({requests:8,durationMs:300}),beforeRequest:()=>{}}});
    const result=await service.reviewDefinitionChanges(p.id,p.revision,"project",new AbortController().signal);
    assert.equal(result.status,"completed",result.diagnostic);assert.equal(calls,2);
  }finally{store.close();}
});

test("identifier sharing is exact, keeps prose/numbers/missing fields, and never changes an already-fitting request", () => {
  const ids = Array.from({ length: 20 }, () => randomUUID());
  const data = { taskKey: "a".repeat(64), instruction: "Keep complete evidence and return original string IDs.",
    evidence: ids.map((id, index) => ({ id, text: `Exact Unicode café 🐾\r\nDecision ${index}: keep 17 and ${ids[0]} literally.`,
      count: index, nullable: null, ...(index % 2 ? { questionID: ids[0] } : {}) })),
    checks: dimensions.map((dimension) => ({ dimension, evidenceIDs: ids, explanation: "Original complete finding" })) };
  const fitting = changeEvidenceWire(data, 1_000_000); assert.equal(fitting.data, data); assert.equal(fitting.identifierCompaction, undefined);
  const raw = JSON.stringify(data).length, compact = changeEvidenceWire(data, raw - 1000);
  assert.ok(compact.identifierCompaction); assert.ok(compact.characters < raw - 1000);
  assert.equal(compact.characters, JSON.stringify(compact.data).length);
  assert.deepEqual(expandChangeIdentifiers(compact.data), data);
  assert.equal(definitionFindingIdentityKey(expandChangeIdentifiers(compact.data)), definitionFindingIdentityKey(data));
  assert.throws(() => changeEvidenceWire({ ...data, unexpectedID: 0 }, 1), /preserve every original value/);
  const prose = { text: "Distinct complete human evidence. ".repeat(5000) };
  assert.equal(changeEvidenceWire(prose, 96000).data, prose, "No body is shortened to manufacture a fit");
});

test("an old size-blocked v2 lookup continues with exact encoded bodies, original context identity and no repeated paid lookup", async () => {
  const { store, p, task, response, owner, original } = fixture(19, 10000);
  try {
    const ids = original.sources.filter((source) => source.kind === "note").slice(0, 8).map((source) => source.id);
    const source = store.beginJob(p.id, p.revision, undefined, false, owner).job;
    store.claimJob(source.id, Date.now() + 60000); store.beginDefinitionChangeReview(source.id, "project", task.taskKey);
    store.reserveDefinitionChangeReview(source.id); store.recordDefinitionChangeResponse(source.id, { taskKey: task.taskKey, loadEvidenceIDs: ids });
    store.failJob(source.id, "failed", "Old v2 size guard blocked the next cumulative request");
    const saved = store.getJob(source.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_project, { context }) {
      calls++;
      assert.ok(context.manifest.identifierCompaction, JSON.stringify(context.manifest));
      assert.ok(context.manifest.identifierCompaction.originalCharacters > 96000);
      assert.ok(context.manifest.characters <= 96000);
      const expanded = expandChangeIdentifiers(context.data as Record<string, unknown>) as { taskKey: string; evidence: Project["sources"]; assessment: Project["assessments"][number] };
      assert.equal(expanded.taskKey, task.taskKey);
      assert.deepEqual(expanded.assessment, original.assessments[0]);
      for (const id of ids) assert.deepEqual(expanded.evidence.find((record) => record.id === id), original.sources.find((record) => record.id === id));
      const job = store.jobs(p.id).at(-1)!, request = store.definitionChangeRequest(job.id);
      assert.equal(request.contextKey, definitionFindingIdentityKey(expanded), "Persisted keys bind the unchanged expanded context, not a new wire spelling");
      return { ...response, checks: response.checks.map((check) => ({ ...check, evidenceIDs: [ids[0]!] })) };
    } }, { workflow: { owner, beforeJob: () => ({ requests: 8, durationMs: 300000 }), beforeRequest: () => {} } });
    const finished = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(finished.status, "completed", finished.diagnostic); assert.equal(calls, 1, "The original accepted lookup is not repeated");
    if (finished.definitionChangeWork!.format !== 2 || saved.definitionChangeWork!.format !== 2) assert.fail();
    assert.deepEqual(finished.definitionChangeWork!.loads, saved.definitionChangeWork!.loads);
    assert.equal(finished.definitionChangeWork!.attempts, 1); assert.deepEqual(store.getJob(source.id), saved);
    assert.deepEqual(store.get(p.id).assessments, original.assessments);
  } finally { store.close(); }
});

test("distinct bodies that exceed the cumulative bound activate batches without repeating the accepted lookup", async () => {
  const { store, p, task, owner } = fixture(19, 12000);
  try {
    const ids = p.sources.filter(source => source.kind === "note").slice(0, 8).map(source => source.id);
    const source = store.beginJob(p.id, p.revision, undefined, false, owner).job;
    store.claimJob(source.id, Date.now() + 60000); store.beginDefinitionChangeReview(source.id, "project", task.taskKey);
    store.reserveDefinitionChangeReview(source.id); store.recordDefinitionChangeResponse(source.id, { taskKey: task.taskKey, loadEvidenceIDs: ids });
    store.failJob(source.id, "interrupted", "Oversized exact bodies remain saved");
    const saved = store.getJob(source.id).definitionChangeWork!;
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_project, { context }) {
      calls++; assert.equal(context.manifest.definitionChangeReview!.format, 3);
      assert.ok(context.manifest.characters <= 96000);
      throw new Error("Synthetic batch request failure remains charged");
    } },
      { workflow: { owner, beforeJob: () => ({ requests: 8, durationMs: 300000 }), beforeRequest: () => {} } });
    const result = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
    assert.equal(calls, 1); assert.equal(result.status, "failed");
    assert.match(result.diagnostic!, /Synthetic batch request failure/);
    assert.equal(result.definitionChangeWork!.format, 3);
    if (result.definitionChangeWork!.format !== 3 || saved.format !== 2) assert.fail();
    assert.deepEqual(result.definitionChangeWork!.loads, saved.loads);
    assert.equal(result.definitionChangeWork!.attempts, 1);
    assert.equal(result.definitionChangeWork!.sourceJobID, source.id);
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});
