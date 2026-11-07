import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { ProjectStore } from "../src/storage/store.js";
import { runSubmissionStages } from "../src/service/submission-stages.js";
import { DiscoveryMeasurement } from "../src/service/discovery-metrics.js";
import type { Analysis } from "../src/core/model.js";

// Disposable synthetic SQLite only. No user database, network, provider or model.
const store = new ProjectStore(":memory:");
const empty = (): Analysis => ({ summary: "Synthetic saved-input pass", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
try {
  let p = store.create("Synthetic answer processing", "Preserve exact human rules", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: [{ epicID: "project", text: "Keep the saved rules?", whyItMatters: "Explicit human choice",
    options: [{ label: "Keep", consequence: "Retain rules" }, { label: "Change", consequence: "Review rules" }] }] });
  p = store.get(p.id);
  for (let i = 0; i < 150; i++) p = store.note(p.id, p.revision, `Synthetic rule ${i}: ${randomBytes(1000).toString("hex")}`, "project");
  const q = p.questions[0]!;
  const queued = store.enqueue(p.id, { id: "9bd492a2-e08e-45b3-9ca8-79bc3af5678f", auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Keep all exact saved rules" } } });
  const item = store.applyQueued(p.id, [queued.id])[0]!; p = store.get(p.id);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const measurement = new DiscoveryMeasurement(value => store.saveDiscoveryMetrics(job.id, value));
  const result = await runSubmissionStages(store, { async analyze(_p, { context }) {
    return context.manifest.submissionStage!.phase === "check" ? { submissionCheck: { valid: true, reason: "Synthetic no-change fixture only" } }
      : context.manifest.submissionStage!.step === 0 ? empty() : { submissionKeep: true };
  } }, p, job, item, { recordIDs: [q.id, item.appliedSourceID!], requiredEpicIDs: ["project"], isolatedTask: true, submissionFollowup: true, expandMandatory: true },
  { signal: new AbortController().signal, research: false, continuous: true, measurement });
  measurement.finish(); assert.equal(result.status, "completed");
  console.log(JSON.stringify({ comparison: "synthetic-saved-answer-no-inference", records: p.sources.length + p.questions.length,
    batches: result.submissionWork!.batches.length, requests: measurement.value.requests.length,
     elapsedMs: measurement.value.elapsedMs, localMs: measurement.value.submissionLocalMs,
     bookkeepingMs: measurement.value.bookkeepingMs, gapBeforeMs: measurement.value.requests.map(r => r.gapBeforeMs),
     afterLastRequestMs: measurement.value.afterLastRequestMs,
    limitation: "Synthetic local preparation/validation/persistence only. No real-project or model-latency claim." }));
} finally { store.close(); }
