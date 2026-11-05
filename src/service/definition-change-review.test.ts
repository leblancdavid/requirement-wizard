import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/definition-dimensions.js";
import { coverage } from "../core/coverage.js";
import { discoveryPrompt, scanPrompt, questionHelpPrompt } from "../runtime/discovery.js";
import type { Project } from "../core/model.js";

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
      assert.deepEqual(snapshot, p); assert.deepEqual(options.context, task.context); assert.equal(options.research, false);
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

test("oversized requested evidence is retained as a charged lookup and blocks before another model call", async () => {
  const { store, p, task, owner } = fixture(8, 12000), ids = p.sources.filter((s) => s.kind === "note").map((s) => s.id);
  let calls = 0;
  try {
    const service = new DiscoveryService(store, { async analyze() { calls++; return { taskKey: task.taskKey, loadEvidenceIDs: ids }; } },
      { workflow: { owner, beforeJob: () => ({ requests: 8, durationMs: 300000 }), beforeRequest: () => {} } });
    for (let i = 0; i < 2; i++) {
      const result = await service.reviewDefinitionChanges(p.id, p.revision, "project", new AbortController().signal);
      assert.equal(result.status, "failed"); assert.match(result.diagnostic!, /bounded joint context/); assert.equal(calls, 1);
      if (result.definitionChangeWork!.format !== 2) assert.fail();
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
