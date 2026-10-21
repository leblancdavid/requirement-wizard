import { performance } from "node:perf_hooks";
import { ProjectStore } from "../src/storage/store.js";
import { emptyExecution } from "../src/core/execution.js";
import { startApp } from "../src/web/server.js";

// Disposable synthetic data only. No workspace, Git commands or model calls.
const store = new ProjectStore(":memory:");
let project = store.create("Assessment performance fixture", "Save reviewed work", { providerID: "openai", modelID: "fixture" });
for (let i = 0; i < 40; i++) project = store.note(project.id, project.revision, `Decision ${i}: ${"Retain the original decision evidence. ".repeat(50)}`);
for (let batch = 0; batch < 15; batch++) {
  const proposal = store.beginJob(project.id, project.revision).job;
  store.claimJob(proposal.id, Date.now() + 60000);
  store.finishJob(proposal.id, { summary: "Performance fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
    requirements: Array.from({ length: 10 }, (_, i) => ({ statement: `Save record ${batch * 10 + i}`, rationale: "Retain user work", acceptance: ["The saved record survives restart"], sourceIDs: [project.sources[0]!.id] })) });
  project = store.get(project.id);
}
for (let i = 0; i < 100; i++) {
  const job = store.beginJob(project.id, project.revision).job;
  store.failJob(job.id, "failed", `Synthetic historical diagnostic ${i}: ${"Retained evidence. ".repeat(300)}`);
}
const state = emptyExecution();
state.assessmentRuns = Array.from({ length: 20 }, (_, i) => ({ id: `historical-${i}`, operation: "assess", revision: project.revision,
  bindingID: "synthetic", status: "completed", stage: "Completed", requirementIDs: project.requirements.map((r) => r.id),
  completedIDs: project.requirements.map((r) => r.id), reused: 0, startedAt: "2026-10-21T00:00:00Z", checks: [], progress: [] }));
store.saveExecution(project.id, state);
function report(name: string, samples: number[]) {
  samples.sort((a, b) => a - b);
  console.log(`${name}: median ${samples[Math.floor(samples.length / 2)]!.toFixed(2)} ms; p95 ${samples[Math.ceil(samples.length * .95) - 1]!.toFixed(2)} ms (${samples.length} samples)`);
}
const checkpoints: number[] = [];
for (let i = 0; i < 35; i++) {
  state.assessmentStatus = `Synthetic progress ${i}`;
  const start = performance.now(); store.saveExecution(project.id, state);
  if (i >= 5) checkpoints.push(performance.now() - start);
}
report("Progress checkpoint", checkpoints);
const app = await startApp({ store, port: 0, adapter: { async analyze() { throw new Error("Benchmark must not call a model"); } } });
try {
  const samples: number[] = [];
  let tokens = "{}";
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    const response = await fetch(`${app.origin}/api/projects/${project.id}`, { headers: { "X-Reqwizit-Token": app.token, "X-Reqwizit-Snapshot": tokens } });
    if (!response.ok) throw new Error(`Snapshot returned ${response.status}`);
    tokens = response.headers.get("X-Reqwizit-Snapshot")!;
    await response.json();
    if (i >= 5) samples.push(performance.now() - start);
  }
  report("Unchanged HTTP snapshot", samples);
  console.log(`Fixture: ${project.requirements.length} requirements, ${project.sources.length} sources, 115 jobs, 20 saved assessment runs. Node ${process.version}.`);
} finally { await app.close(); store.close(); }
