import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../src/storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../src/service/discovery.js";
import { OpenCodeDiscovery } from "../src/runtime/discovery.js";
import { safeMessage } from "../src/runtime/contract.js";
import type { Analysis } from "../src/core/model.js";

// Deliberately not part of npm test. This explicitly opted-in experiment consumes
// provider allowance; never opens the user's project database or managed folder.
const args = process.argv.slice(2), dryRun = args.length === 1 && args[0] === "--check-fixtures", maxRequests = dryRun ? 4 : Number(args[4]);
if (!dryRun && (args.length !== 5 || args.slice(0, 4).join(" ") !== "--live openai/gpt-6.1-sol openai/gpt-6.1-sol-fast --max-requests" || ![4, 6].includes(maxRequests))) {
  throw new Error("Explicit opt-in required: --live openai/gpt-6.1-sol openai/gpt-6.1-sol-fast --max-requests 4|6 (90s each; no service retry/fallback). Four is one-call screening only; six permits up to two discovery stages/model.");
}
const root = resolve(".reqwizit-state/model-comparisons"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "latency-"));
const empty: Analysis = { summary: "Curated comparison fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
const rows: unknown[] = [];
let totalCalls = 0;
for (const modelID of ["gpt-6.1-sol", "gpt-6.1-sol-fast"]) {
  for (const task of ["discover", "answer"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      let p = store.create("Disposable reservation comparison", "A local club lends equipment to members. Membership is required; guests cannot borrow. Keep failed reservation attempts visible. Reservations must not overlap. Product choices about waitlists, damaged returns and notification delivery are undecided.", { providerID: "openai", modelID });
      p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "loans", title: "Equipment loans", purpose: "Reserve, collect and return club equipment", dependencies: [] }]);
      const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
      store.finishJob(seed.id, { ...empty, requirements: [{ epicID: "loans", statement: "Only members can borrow equipment; overlapping reservations are rejected and failed attempts remain visible.", rationale: "Original human constraints", acceptance: ["A guest cannot reserve equipment.", "An overlapping reservation is rejected and the failed attempt remains visible."], sourceIDs: [p.sources[0]!.id] }],
        questions: [{ epicID: "loans", text: "Should unavailable equipment offer a waitlist?", whyItMatters: "Decides how members request unavailable equipment", options: [{ label: "Waitlist", consequence: "Members can queue for availability" }, { label: "No waitlist", consequence: "Members retry later" }] }] });
      p = store.get(p.id);
      let submissionID: string | undefined;
      if (task === "answer") {
        const question = p.questions[0]!;
        submissionID = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: question.sourceID ?? null,
          answer: { kind: "answer", text: "Use a first-come-first-served waitlist. When equipment becomes available, the first member has 24 hours to accept before the offer moves to the next member. Do not change the members-only rule." } } }).id;
        store.applyQueued(p.id, [submissionID]); p = store.get(p.id);
        assert.ok(store.submissions(p.id).find(s => s.id === submissionID)?.appliedSourceID, "Answer comparison requires the actual saved human input before dispatch");
        assert.equal(p.questions.find(q => q.id === question.id)?.status, "answered");
      }
      const runtime = new OpenCodeDiscovery(join(directory, `${modelID}-${task}`));
      let calls = 0, adapterMs = 0, characters = 0, budgetStopped = false;
      const responses: unknown[] = [];
      const adapter: DiscoveryAdapter = { async analyze(project, options) {
        if (calls >= (task === "discover" && maxRequests === 6 ? 2 : 1) || totalCalls >= maxRequests) {
          budgetStopped = true; throw new Error("Comparison request budget reached; unfinished checks are not a model failure or completed discovery.");
        }
        calls++; totalCalls++; characters = options.context.manifest.characters;
        const started = performance.now();
        try {
          const response = dryRun ? empty : await runtime.analyze(project, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(90000)]) });
          responses.push(response); return response;
        }
        finally { adapterMs += performance.now() - started; }
      } };
      const started = performance.now();
      const job = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { research: false, signal: AbortSignal.timeout(100000),
        ...(submissionID ? { isolatedTask: true, submissionIDs: [submissionID] } : { gapMode: "epic" as const, focusEpicID: "loans", questionTarget: 5 }) });
      const after = store.get(p.id);
      const row = { modelID, task, status: job.status, elapsedMs: performance.now() - started, adapterMs, calls, characters,
        budgetStopped, responses, humanInputApplied: task === "answer" ? !!store.submissions(p.id).find(s => s.id === submissionID)?.appliedSourceID : undefined,
        diagnostic: job.diagnostic ? safeMessage(job.diagnostic) : undefined,
        questions: job.result?.questions, requirements: job.result?.requirements,
        retainedOriginalSource: after.sources.some(s => s.id === p.sources[0]!.id && s.text === p.sources[0]!.text),
        originalQuestion: after.questions.find(q => q.id === p.questions[0]!.id),
        acceptedOutput: !!job.result };
      rows.push(row); writeFileSync(join(directory, "report.json"), JSON.stringify({ fixtureOnly: true, liveInference: !dryRun, trialsPerTask: 1, maxRequests, totalCalls, rows }, null, 2) + "\n");
      console.log(JSON.stringify({ modelID, task, status: job.status, elapsedMs: Math.round(row.elapsedMs), adapterMs: Math.round(adapterMs), calls, characters, acceptedOutput: row.acceptedOutput, diagnostic: row.diagnostic }));
    } finally { store.close(); }
  }
}
console.log(JSON.stringify({ report: join(directory, "report.json"), liveInference: !dryRun, totalCalls, note: "One curated trial per task; no production model switch or large-project qualification." }));
