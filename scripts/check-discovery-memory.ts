import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../src/storage/store.js";
import { DiscoveryService } from "../src/service/discovery.js";
import { epicPlanningInputKey } from "../src/service/epic-planning.js";
import { discoveryMetricsSchema } from "../src/core/discovery-diagnostics.js";
import { planEpicReview } from "../src/core/epic-review.js";

// Isolated synthetic regression: node --max-old-space-size=64 --import tsx
// scripts/check-discovery-memory.ts. No provider calls or user data.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "discovery-memory-")), database = join(directory, "state.sqlite");
const store = new ProjectStore(database, undefined, { publication: "manual" });
try {
  let p = store.create("Memory fixture", "Keep exact human evidence", { providerID: "openai", modelID: "fixture" });
  const empty = { summary: "Synthetic", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty, requirements: [{ statement: "Save evidence", rationale: "Human input", acceptance: ["Evidence survives"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id);
  const done = await new DiscoveryService(store, { async analyze() { return empty; } }).analyze(p.id, p.revision, { gapMode: "epic", research: false });
  assert.equal(done.status, "completed", done.diagnostic);
  p = store.get(p.id);
  assert.ok(done.context?.epicReview); assert.ok(done.discoveryMetrics?.requests.length);
  const metrics = discoveryMetricsSchema.parse({ ...done.discoveryMetrics,
    requests: Array.from({ length: 1000 }, () => done.discoveryMetrics!.requests[0]!) });
  const db = new Database(database);
  let historyBytes = 0;
  try {
    const insert = db.prepare("INSERT INTO jobs VALUES (?, ?, ?)");
    db.transaction(() => {
      for (let index = 0; index < 400; index++) {
        const id = `memory-job-${index}`, payload = JSON.stringify({ ...done, id, discoveryMetrics: metrics });
        historyBytes += Buffer.byteLength(payload); insert.run(id, p.id, payload);
      }
    })();
    assert.ok(historyBytes > 64 * 1024 * 1024, "Fixture archive must exceed the process heap cap");
    const projected = store.epicReviewPlanningHistory(p.id);
    assert.equal(projected.length, 401); assert.ok(projected.every(j => j.discoveryMetrics === undefined));
    assert.equal(epicPlanningInputKey(p, projected, undefined, []).length, 64);
    assert.ok(planEpicReview(p, projected).report.reviewed > 0);
    const folder = join(directory, "repo"); mkdirSync(folder);
    store.connectWorkspace(p.id, p.revision, folder);
    store.syncWorkspace(p.id);
    assert.equal(store.workspace(p.id)!.status, "saved", store.workspace(p.id)!.diagnostic ?? undefined);
    assert.equal((db.prepare("SELECT count(*) AS total FROM jobs").get() as { total: number }).total, 402);
    assert.deepEqual(store.getJob(done.id), done);
    console.log(JSON.stringify({ fixtureOnly: true, archiveBytes: historyBytes, projectedJobs: projected.length, heapCapMb: 64, portableSaved: true }));
  } finally { db.close(); }
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
