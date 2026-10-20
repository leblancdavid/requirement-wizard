import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { analysisSchema, reviewFingerprint, type Analysis, type Project } from "./model.js";
import { implementationNeedsReview } from "./implementation.js";
import { discoveryPrompt, scanPrompt } from "../runtime/discovery.js";
import { buildContext } from "./context.js";
import { prepareScanAnalysis } from "./scan.js";
import { planContext } from "./working-set.js";
import { ContextBudgetError } from "./context.js";
import { DiscoveryQueue } from "../service/queue.js";
import { refinementContextKey } from "../service/refinement-tasks.js";
import { resolutionPairEligible } from "../service/refinement-tasks.js";
import { pendingRefinementRequirementIDs, refinementIsStale, resolutionContextKey, resolutionEvidenceIDs, validateResolutionEvidence } from "./resolution.js";
import { projectSchema } from "./model.js";
import { reviewItems, ReviewQueue } from "../ui/review.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { proposeRefinements } from "./refinement.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const empty = (): Analysis => ({ summary: "Game", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
async function seed(store: ProjectStore) {
  let p = store.create("Game", "Jump after stepping off an edge; two-player play is required.", { providerID: "openai", modelID: "fixture" });
  const job = await new DiscoveryService(store, { async analyze(project) { return { ...empty(), requirements: [{
    statement: "PlayerController.Jump() allows a jump for 0.15 seconds after leaving a ledge.",
    rationale: "Observed implementation", acceptance: ["Jump() sets velocity to 420 within 0.15 seconds."], sourceIDs: [project.sources[0]!.id],
  }] }; } }).analyze(p.id, p.revision);
  assert.equal(job.status, "completed", job.diagnostic);
  p = store.get(p.id);
  return store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
}
const proposal = (p: Project) => ({ requirementID: p.requirements[0]!.id,
  statement: "The player can jump briefly after stepping off a ledge.", rationale: "Preserves the supported edge-jump behavior.",
  acceptance: ["Immediately after stepping off a ledge, pressing jump initiates a jump."], reason: "Abstracted a method name and incidental timing/velocity tuning." });
async function refine(store: ProjectStore, p: Project, output = proposal(p)) {
  return new DiscoveryService(store, { async analyze(_project, options) {
    assert.equal(options.research, false);
    return { ...empty(), refinements: [output] };
  } }).analyze(p.id, p.revision, { refinementOnly: true, research: true });
}

test("approved requirement cleanup stays a separate proposal until explicit approval, preserving history and progress linkage", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = await seed(store);
    const original = structuredClone(p.requirements[0]!);
    p = store.setImplementation(p.id, p.revision, original.id, { status: "verified", notes: "Done", evidence: "Prior scenario passed" });
    const originalRevision = p.revision;
    const job = await refine(store, p);
    assert.equal(job.status, "completed", job.diagnostic);
    p = store.get(p.id);
    assert.deepEqual(p.requirements[0], original);
    assert.equal(p.summary, store.get(p.id, originalRevision).summary);
    assert.equal(p.refinements.length, 1);
    assert.equal((await refine(store, p)).status, "completed");
    p = store.get(p.id);
    assert.equal(p.refinements.length, 1, "repeat passes do not duplicate a pending suggestion");
    p = store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, true);
    assert.equal(p.requirements[0]!.id, original.id);
    assert.equal(p.requirements[0]!.status, "accepted");
    assert.equal(p.requirements[0]!.statement, proposal(p).statement);
    assert.ok(original.sourceIDs.every((id) => p.requirements[0]!.sourceIDs.includes(id)));
    assert.ok(p.sources.at(-1)!.text.includes("Human approved requirement cleanup"));
    assert.equal(implementationNeedsReview(p, p.implementation[0]!), true);
    assert.deepEqual(store.get(p.id, originalRevision).requirements[0], original);
    assert.equal(store.get(p.id).refinements[0]!.status, "accepted");
  } finally { store.close(); }
});

test("dismissal suppresses repeat suggestions; changed targets reject stale approvals but allow dismissal", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = await seed(store);
    await refine(store, p); p = store.get(p.id);
    p = store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, false);
    await refine(store, p); p = store.get(p.id);
    assert.equal(p.refinements.length, 1);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Preserve two-player play.");
    await refine(store, p); p = store.get(p.id);
    const pending = p.refinements.at(-1)!;
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Changed decision");
    assert.throws(() => store.reviewRefinement(p.id, p.revision, pending.id, true), /Project changed/);
    assert.equal(store.get(p.id).revision, p.revision);
    p = store.reviewRefinement(p.id, p.revision, pending.id, false);
    assert.equal(p.refinements.at(-1)!.status, "dismissed");
  } finally { store.close(); }
});

test("refinements reject missing evidence, malformed output, rejected targets and stale jobs atomically", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = await seed(store);
    assert.equal((await refine(store, p, { ...proposal(p), requirementID: "missing" })).status, "failed");
    assert.equal(store.get(p.id).refinements.length, 0);
    const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
    const context = buildContext(p); context.manifest.includedIDs = [p.requirements[0]!.id];
    store.attachContext(job.id, context.manifest);
    assert.throws(() => store.finishJob(job.id, { ...empty(), refinements: [proposal(p)] }), /supporting evidence/);
    store.failJob(job.id, "failed", "Fixture");
    assert.equal(store.get(p.id).revision, p.revision);
    assert.throws(() => analysisSchema.parse({ ...empty(), refinements: [{ ...proposal(p), acceptance: [] }] }));
    assert.throws(() => prepareScanAnalysis({ ...empty(), refinements: [proposal(p)] }), /cannot refine/);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "rejected", "Do not preserve");
    assert.equal((await refine(store, p)).status, "failed");
    const service = new DiscoveryService(store, { async analyze(snapshot) {
      store.note(snapshot.id, snapshot.revision, "A newer human decision");
      return { ...empty(), refinements: [proposal(snapshot)] };
    } });
    assert.equal((await service.analyze(p.id, p.revision)).status, "stale");
    assert.equal(store.get(p.id).refinements.length, 0);
  } finally { store.close(); }
});

test("shared prompts preserve meaningful numeric rules and offer approved cleanup without review-addendum authority", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = await seed(store); const context = buildContext(p);
    const prompt = discoveryPrompt(p, context);
    assert.ok(prompt.includes("including APPROVED requirements"));
    assert.ok(prompt.includes("genuine numeric product rules (such as two-player play)"));
    assert.ok(prompt.includes("explicit human constraints"));
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
    assert.deepEqual(schema.properties.refinements.items.properties.requirementID.enum, [p.requirements[0]!.id]);
    assert.equal(schema.properties.reviewChanges.maxItems, 0);
    const scan = scanPrompt(p, { ...context, data: { capturedFiles: [{ id: "file:1" }] } });
    assert.ok(scan.includes("Abstract incidental tuning constants"));
    assert.ok(scan.includes("not behavioral wording"));
    await refine(store, p); p = store.get(p.id);
    assert.ok(discoveryPrompt(p, buildContext(p)).includes("Eligible exact IDs: []"));
  } finally { store.close(); }
});

test("pending human reviews block cleanup approval, and refinement-only cannot introduce unrelated gaps", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = await seed(store);
    await refine(store, p); p = store.get(p.id);
    const original = structuredClone(p.requirements[0]!);
    store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: {
      type: "review", requirementID: original.id, requirementText: original.statement,
      fingerprint: reviewFingerprint(original), action: "accepted", note: "Preserve ledge jumping",
    } });
    assert.throws(() => store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, true), /pending human review/);
    assert.deepEqual(store.get(p.id).requirements[0], original);
    const job = await new DiscoveryService(store, { async analyze(snapshot) {
      return { ...empty(), refinements: [proposal(snapshot)], requirements: [{ statement: "Add multiplayer", rationale: "Unrelated gap", sourceIDs: [snapshot.sources[0]!.id], acceptance: ["Multiplayer works"] }] };
    } }).analyze(p.id, p.revision, { refinementOnly: true });
    assert.equal(job.status, "failed");
    assert.match(job.diagnostic!, /only propose requirement cleanup/);
    assert.equal(store.get(p.id).revision, p.revision);
  } finally { store.close(); }
});

async function waitForQueue(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 1000; i++) {
    if (!queue.isActive(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Refinement queue did not finish");
}

function largeApprovedArea(store: ProjectStore) {
  let p = store.create("Large imported game", "Preserve gameplay behavior", { providerID: "openai", modelID: "fixture" });
  const text = (seed: string, length: number) => Array.from({ length: 180 }, (_, i) => createHash("sha256").update(`${seed}:${i}`).digest("hex")).join(" ").slice(0, length);
  for (let batch = 0; batch < 2; batch++) {
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: Array.from({ length: 8 }, (_, i) => ({
      statement: `Controller${batch}-${i}.Update(): ${text(`statement-${batch}-${i}`, 6000)}`,
      rationale: text(`rationale-${batch}-${i}`, 1000), acceptance: [text(`scenario-${batch}-${i}`, 4000)], sourceIDs: [p.sources[0]!.id],
    })) });
    p = store.get(p.id);
  }
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  p = store.note(p.id, p.revision, "Project guardrail: preserve local-first play.", "project");
  return store.note(p.id, p.revision, "Feature constraint: preserve two-player support.", "inbox");
}

test("oversized approved areas refine one requirement at a time and resume completed no-change checks without replay", async () => {
  const store = new ProjectStore(":memory:");
  let queue: DiscoveryQueue | undefined;
  try {
    let p = largeApprovedArea(store);
    assert.throws(() => planContext(p, { focusEpicID: "inbox", expandMandatory: true }), (error: unknown) => error instanceof ContextBudgetError && error.manifest.characters > 96000);
    const original = structuredClone(p.requirements);
    const seen: string[] = [];
    let failID = p.requirements[2]!.id;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      const target = options.context.manifest.refinementTarget!;
      assert.equal(options.context.manifest.isolatedTask, true);
      assert.equal(options.context.manifest.characters <= options.context.manifest.budget, true);
      assert.deepEqual(options.context.manifest.taskRecordIDs, [target.requirementID]);
      assert.deepEqual(snapshot.requirements, p.requirements);
      for (const note of p.sources.filter((s) => s.kind === "note")) assert.ok(options.context.manifest.includedIDs.includes(note.id));
      assert.deepEqual(snapshot.requirements.filter((r) => options.context.manifest.includedIDs.includes(r.id)).map((r) => r.id), [target.requirementID]);
      seen.push(target.requirementID);
      if (target.requirementID === failID) throw new Error("Fixture provider failure");
      return { ...empty(), refinements: [] };
    } });
    queue = new DiscoveryQueue(service);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.deepEqual(seen, p.requirements.slice(0, 3).map((r) => r.id));
    assert.equal(store.jobs(p.id).filter((j) => j.context?.refinementTarget && j.status === "completed").length, 2);
    await queue.close();
    failID = "";
    // A fresh queue reconstructs progress entirely from durable completed jobs.
    queue = new DiscoveryQueue(service);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(seen.length, p.requirements.length + 1);
    assert.equal(seen.filter((id) => id === p.requirements[0]!.id).length, 1);
    assert.equal(seen.filter((id) => id === p.requirements[2]!.id).length, 2);
    assert.deepEqual(store.get(p.id).requirements, original);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(seen.length, p.requirements.length + 1, "unchanged no-op targets are not billed again");
    p = store.get(p.id);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Updated preservation constraint");
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(seen.at(-1), p.requirements[0]!.id);
    assert.equal(seen.length, p.requirements.length + 2);
  } finally { await queue?.close(); store.close(); }
});

test("completed refinement checks invalidate on applicable human constraints but not unrelated feature history", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = await seed(store); const r = p.requirements[0]!;
    const key = refinementContextKey(p, r);
    p.sources.push({ id: "unrelated-review", kind: "confirmation", epicID: r.epicID, requirementID: "another-requirement", text: "Approve unrelated behavior" });
    assert.equal(refinementContextKey(p, r), key);
    const updated = structuredClone(p);
    updated.sources.push({ id: "new-note", kind: "note", epicID: r.epicID, text: "Preserve the grace period when jumping." });
    assert.notEqual(refinementContextKey(updated, r), key);
    p.epics.push({ id: "dependency", title: "Accessibility", purpose: "Input access", archived: false, dependencies: [] });
    p.epics.find((e) => e.id === r.epicID)!.dependencies.push("dependency");
    const dependencyKey = refinementContextKey(p, r);
    p.sources.push({ id: "dependency-answer", kind: "answer", epicID: "dependency", text: "Support remappable controls" });
    assert.notEqual(refinementContextKey(p, r), dependencyKey);
  } finally { store.close(); }
});

function approvedPair(store: ProjectStore, count = 2) {
  let p = store.create("Report policies", "Preserve private reports and all explicit access decisions.", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: Array.from({ length: count }, (_, i) => ({
    statement: `Guests can access private reports under policy ${i + 1}`, rationale: "Report access", sourceIDs: [p.sources[0]!.id], acceptance: [`Policy ${i + 1} has an observable access scenario`], epicID: i % 2 ? "project" : "inbox",
  })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "Preserve the approved access scenario");
  return p;
}
function resolutionProposal(p: Project, pair: [string, string]): NonNullable<Analysis["refinements"]>[number] {
  const [target, other] = pair.map((id) => p.requirements.find((r) => r.id === id)!);
  return { requirementID: target!.id, statement: "Guests can access private reports under the explicitly approved policies", rationale: "One observable behavior preserves both approved scenarios", acceptance: [...target!.acceptance, ...other!.acceptance], reason: "Consolidate redundant wording without losing scenarios",
    resolution: { format: 1, relatedRequirementID: other!.id, basis: "duplicate", evidenceIDs: [p.sources[0]!.id], change: { type: "consolidate" } } };
}
async function pairProposal(store: ProjectStore, p: Project, pair = p.requirements.slice(0, 2).map((r) => r.id) as [string, string]) {
  return new DiscoveryService(store, { async analyze(snapshot, options) {
    assert.deepEqual(options.context.manifest.refinementPair?.requirementIDs, pair);
    for (const r of snapshot.requirements.filter((r) => pair.includes(r.id))) for (const id of [r.id, ...r.sourceIDs]) assert.ok(options.context.manifest.includedIDs.includes(id));
    return { ...empty(), refinements: [resolutionProposal(snapshot, pair)], resolutionCheck: { format: 1, outcome: "proposal", explanation: "The combined scenarios preserve both records" } };
  } }).analyze(p.id, p.revision, { refinementOnly: true, refinementPair: pair });
}

test("resolution proposal preserves both approved originals until atomic consolidation approval", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = approvedPair(store), originals = structuredClone(p.requirements), revision = p.revision;
    const job = await pairProposal(store, p);
    assert.equal(job.status, "completed", job.diagnostic);
    p = store.get(p.id);
    assert.deepEqual(p.requirements, originals);
    const proposal = p.refinements[0]!;
    assert.deepEqual(proposal.relatedOriginal, originals[1]);
    assert.deepEqual([...pendingRefinementRequirementIDs(p)].sort(), originals.map((r) => r.id).sort());
    const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false, refine: () => {}, submit: async () => true, reviewRefinement: async () => true }));
    assert.match(html, /Approve resolution/); assert.match(html, /Keep both unchanged/); assert.match(html, /reject the redundant/);
    assert.equal(reviewItems(p, [], "refinements", "project").length, 1, "resolution is visible from either feature");
    p = store.reviewRefinement(p.id, p.revision, proposal.id, true);
    assert.equal(p.requirements[0]!.id, originals[0]!.id);
    assert.equal(p.requirements[0]!.status, "accepted");
    assert.deepEqual(p.requirements[0]!.acceptance, originals.flatMap((r) => r.acceptance));
    assert.equal(p.requirements[1]!.status, "rejected");
    assert.equal(p.requirements[1]!.statement, originals[1]!.statement);
    for (const r of originals) for (const sourceID of r.sourceIDs) assert.ok(p.requirements[0]!.sourceIDs.includes(sourceID));
    assert.ok(p.sources.some((s) => s.kind === "rejection" && s.requirementID === originals[1]!.id && s.text.includes("Consolidated into")));
    assert.deepEqual(store.get(p.id, revision).requirements, originals);
    assert.equal(p.refinements[0]!.status, "accepted");
  } finally { store.close(); }
});

test("human-evidence reconciliation updates both requirements only after approval", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = approvedPair(store);
    p = store.note(p.id, p.revision, "Guests may view public reports but cannot access private reports.");
    const pair = p.requirements.map((r) => r.id) as [string, string], before = structuredClone(p.requirements);
    const job = await new DiscoveryService(store, { async analyze(snapshot) {
      const proposal = resolutionProposal(snapshot, pair);
      proposal.statement = "Guests can view public reports";
      proposal.acceptance = ["Guests see public reports"];
      proposal.resolution = { format: 1, relatedRequirementID: pair[1], basis: "human-decision", evidenceIDs: [snapshot.sources.at(-1)!.id], change: { type: "revise", statement: "Guests cannot access private reports", rationale: "Explicit human note", acceptance: ["Guests are denied private reports"] } };
      return { ...empty(), refinements: [proposal], resolutionCheck: { format: 1, outcome: "proposal", explanation: "Explicit current human rule distinguishes public and private reports" } };
    } }).analyze(p.id, p.revision, { refinementOnly: true, refinementPair: pair });
    assert.equal(job.status, "completed", job.diagnostic);
    p = store.get(p.id); assert.deepEqual(p.requirements, before);
    p = store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, true);
    assert.deepEqual(p.requirements.map((r) => r.status), ["accepted", "accepted"]);
    assert.deepEqual(p.requirements.map((r) => r.statement), ["Guests can view public reports", "Guests cannot access private reports"]);
    assert.ok(p.sources.filter((s) => s.text.includes("Human approved requirement resolution")).every((s) => s.kind === "confirmation"));
  } finally { store.close(); }
});

test("either requirement or applicable human context makes a resolution stale; dismissal never changes active records", async () => {
  for (const change of ["primary", "related", "note", "dependency"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      let p = approvedPair(store);
      if (change === "dependency") p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "reports", title: "Reports", purpose: "Report access", dependencies: [] }, { type: "move", recordID: p.requirements[0]!.id, epicID: "reports" }]);
      assert.equal((await pairProposal(store, p)).status, "completed"); p = store.get(p.id);
      const proposal = p.refinements[0]!;
      if (change === "note") p = store.note(p.id, p.revision, "Clarify private report restrictions");
      else if (change === "dependency") p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "guardrail", title: "Guardrail", purpose: "Access boundary", dependencies: [] }, { type: "upsert", epicID: "reports", title: "Reports", purpose: "Report access", dependencies: ["guardrail"] }]);
      else p = store.review(p.id, p.revision, p.requirements[change === "primary" ? 0 : 1]!.id, "accepted", "New specific access rule");
      const before = structuredClone(p);
      assert.ok(refinementIsStale(p, proposal));
      assert.throws(() => store.reviewRefinement(p.id, p.revision, proposal.id, true), /Project changed/);
      assert.deepEqual(store.get(p.id), before);
      p = store.reviewRefinement(p.id, p.revision, proposal.id, false);
      assert.deepEqual(p.requirements, before.requirements);
      assert.equal(p.refinements[0]!.status, "dismissed");
    } finally { store.close(); }
  }
});

test("pair validation rejects wrong targets, missing detail, invented evidence and unapproved changes atomically", async () => {
  for (const failure of ["outside-pair", "missing-evidence", "invented-source", "independent-cleanup", "outcome", "static-human-choice"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      let p = approvedPair(store, 3);
      const pair = p.requirements.slice(0, 2).map((r) => r.id) as [string, string];
      const before = structuredClone(p);
      const service = new DiscoveryService(store, { async analyze(snapshot, options) {
        const proposal = resolutionProposal(snapshot, pair);
        if (failure === "outside-pair") proposal.resolution!.relatedRequirementID = snapshot.requirements[2]!.id;
        if (failure === "invented-source") proposal.resolution!.evidenceIDs = ["invented"];
        if (failure === "independent-cleanup") delete proposal.resolution;
        if (failure === "missing-evidence") {
          // Publication uses the independently persisted manifest, not the adapter's object.
          const currentJob = store.jobs(snapshot.id).at(-1)!;
          const context = structuredClone(options.context.manifest);
          context.includedIDs = context.includedIDs.filter((id) => id !== snapshot.requirements[1]!.id);
          store.attachContext(currentJob.id, context);
        }
        if (failure === "static-human-choice") { proposal.resolution!.basis = "human-decision"; proposal.resolution!.evidenceIDs = ["workspace"]; }
        return { ...empty(), refinements: [proposal], resolutionCheck: { format: 1, outcome: failure === "outcome" ? "distinct" : "proposal", explanation: "Fixture" } };
      } });
      const job = await service.analyze(p.id, p.revision, { refinementOnly: true, refinementPair: pair });
      assert.equal(job.status, "failed", failure);
      assert.deepEqual(store.get(p.id), before);
    } finally { store.close(); }
  }
});

test("refine queue asks once for ambiguous intent and the queued answer automatically proposes a resolution", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = approvedPair(store), pairCalls = 0;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair?.requirementIDs;
      if (!pair) return empty();
      pairCalls++;
      const answer = snapshot.sources.find((s) => s.kind === "answer");
      if (answer) {
        assert.ok(options.context.manifest.includedIDs.includes(answer.id));
        const proposal = resolutionProposal(snapshot, pair); proposal.resolution!.evidenceIDs = [answer.id];
        return { ...empty(), refinements: [proposal], resolutionCheck: { format: 1, outcome: "proposal", explanation: "The human clarified the access boundary" } };
      }
      return { ...empty(), questions: [{ text: "Should guests access private reports under both policies?", whyItMatters: "The two approved policies may conflict", epicID: "project", evidenceIDs: pair, options: [{ label: "Both policies apply", consequence: "Preserve both access scenarios" }, { label: "Different scopes", consequence: "Specify distinct boundaries" }] }], resolutionCheck: { format: 1, outcome: "question", explanation: "Need the human's intended access boundary" } };
    } });
    queue = new DiscoveryQueue(service);
    const before = structuredClone(p.requirements);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    p = store.get(p.id); assert.equal(p.questions.length, 1); assert.equal(pairCalls, 1); assert.deepEqual(p.requirements, before);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(pairCalls, 1, "unanswered clarification is not asked again");
    const question = p.questions[0]!;
    queue.submit(p.id, { id: crypto.randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "Both policies apply" } } });
    await waitForQueue(queue, p.id);
    p = store.get(p.id);
    assert.equal(pairCalls, 2);
    assert.equal(p.questions.length, 1);
    assert.equal(p.refinements.filter((f) => f.resolution).length, 1);
    assert.deepEqual(p.requirements, before);
    assert.equal(store.submissions(p.id).at(-1)!.status, "completed");
  } finally { await queue?.close(); store.close(); }
});

test("completed pair checks resume after failure without replay and dismissed fixes remain suppressed", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = approvedPair(store, 3), fail = true;
    const calls: string[] = [];
    const service = new DiscoveryService(store, { async analyze(_snapshot, options) {
      const pair = options.context.manifest.refinementPair;
      if (!pair) return empty();
      calls.push(pair.contextKey);
      if (calls.length === 2 && fail) throw new Error("Fixture pair failure");
      return { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Each policy applies to its own scope" } };
    } });
    queue = new DiscoveryQueue(service); queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(calls.length, 2);
    await queue.close(); fail = false; queue = new DiscoveryQueue(service);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(calls.length, 4); assert.equal(calls.filter((key) => key === calls[0]).length, 1);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id); assert.equal(calls.length, 4);
    const pair = p.requirements.slice(0, 2).map((r) => r.id) as [string, string];
    await pairProposal(store, store.get(p.id), pair); p = store.get(p.id);
    p = store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, false);
    assert.equal(resolutionPairEligible(p, pair, []), false);
    p = store.note(p.id, p.revision, "Changed the applicable report policy");
    assert.equal(resolutionPairEligible(p, pair, []), true);
  } finally { await queue?.close(); store.close(); }
});

test("pending input for either requirement blocks resolution approval", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = approvedPair(store); await pairProposal(store, p); p = store.get(p.id);
    const other = p.requirements[1]!;
    store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "review", requirementID: other.id, requirementText: other.statement, fingerprint: reviewFingerprint(other), action: "accepted", note: "Keep this separate" } });
    assert.throws(() => store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, true), /pending human input/);
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("pair cancellation and oversized mandatory evidence preserve both approvals", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = approvedPair(store); const pair = p.requirements.map((r) => r.id) as [string, string];
    const controller = new AbortController();
    const cancelled = await new DiscoveryService(store, { async analyze(snapshot) {
      controller.abort(); return { ...empty(), refinements: [resolutionProposal(snapshot, pair)], resolutionCheck: { format: 1, outcome: "proposal", explanation: "Cancelled fixture" } };
    } }).analyze(p.id, p.revision, { refinementOnly: true, refinementPair: pair, signal: controller.signal });
    assert.equal(cancelled.status, "cancelled"); assert.deepEqual(store.get(p.id), p);
    for (let i = 0; i < 9; i++) p = store.note(p.id, p.revision, String.fromCharCode(65 + i).repeat(12000));
    let calls = 0;
    const blocked = await new DiscoveryService(store, { async analyze() { calls++; return empty(); } }).analyze(p.id, p.revision, { refinementOnly: true, refinementPair: pair });
    assert.equal(blocked.status, "failed"); assert.equal(calls, 0); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("legacy refinements and new resolution evidence survive repeated reopening without model calls", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-resolution-")), path = join(folder, "projects.sqlite");
  try {
    const initial = new ProjectStore(path); let p: Project;
    try {
      p = approvedPair(initial);
      const legacyJob = await new DiscoveryService(initial, { async analyze(snapshot) { return { ...empty(), refinements: [{ requirementID: snapshot.requirements[0]!.id, statement: "Keep private report access", rationale: "Legacy cleanup", acceptance: snapshot.requirements[0]!.acceptance, reason: "Clarify wording" }] }; } }).analyze(p.id, p.revision, { refinementOnly: true });
      assert.equal(legacyJob.status, "completed");
      p = initial.get(p.id); await pairProposal(initial, p); p = initial.get(p.id);
    } finally { initial.close(); }
    const proposal = p.refinements.find((f) => f.resolution)!;
    for (let i = 0; i < 2; i++) {
      const reopened = new ProjectStore(path);
      try { assert.deepEqual(reopened.get(p.id), p); assert.equal(refinementIsStale(reopened.get(p.id), proposal), false); } finally { reopened.close(); }
    }
    const reopened = new ProjectStore(path);
    try { p = reopened.reviewRefinement(p.id, p.revision, proposal.id, true); } finally { reopened.close(); }
    const completed = new ProjectStore(path);
    try { assert.deepEqual(completed.get(p.id), p); assert.equal(completed.get(p.id).refinements.find((f) => f.resolution)!.status, "accepted"); assert.equal(completed.get(p.id).refinements[0]!.status, "pending"); } finally { completed.close(); }
    const future = structuredClone(p) as unknown as { refinements: Array<{ resolution: { format: number } }> };
    future.refinements.find((f) => f.resolution)!.resolution.format = 2;
    assert.equal(projectSchema.safeParse(future).success, false);
    const incomplete = structuredClone(p); delete incomplete.refinements.find((f) => f.resolution)!.relatedOriginal;
    assert.equal(projectSchema.safeParse(incomplete).success, false);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test("pair prompt permits only bounded resolution output and clarifying questions, not immediate edits", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = approvedPair(store), pair = p.requirements.map((r) => r.id) as [string, string];
    const context = planContext(p, { recordIDs: pair, requiredEpicIDs: ["project", "inbox"], isolatedTask: true });
    context.manifest.refinementOnly = true; context.manifest.refinementPair = { requirementIDs: pair, contextKey: resolutionContextKey(p, pair) };
    const prompt = discoveryPrompt(p, context);
    assert.match(prompt, /PAIR RESOLUTION/); assert.match(prompt, /Do not decide a product preference/);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
    assert.equal(schema.properties.questions.maxItems, 1);
    assert.equal(schema.properties.refinements.maxItems, 1);
    assert.ok(schema.properties.refinements.items.required.includes("resolution"));
    assert.equal(schema.properties.reviewChanges.maxItems, 0);
    assert.ok(schema.required.includes("resolutionCheck"));
  } finally { store.close(); }
});

test("workspace observations cannot be used as a human decision in resolution proposals", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = approvedPair(store), pair = p.requirements.map((r) => r.id) as [string, string];
    p.sources.push({ id: "workspace", kind: "workspace", epicID: "project", text: "Static code allows all guest access" });
    const before = structuredClone(p), proposal = resolutionProposal(p, pair);
    proposal.resolution!.basis = "human-decision"; proposal.resolution!.evidenceIDs = ["workspace"];
    assert.throws(() => proposeRefinements(p, [proposal], () => "new-proposal"), /Static workspace evidence/);
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("resolution checks respect the question limit and blocked outcomes remain retryable", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = approvedPair(store);
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: 5 }, (_, i) => ({ text: `Unresolved separate decision ${i}?`, whyItMatters: "Existing queue", options: [{ label: "Yes", consequence: "Enable" }, { label: "No", consequence: "Disable" }] })) });
    p = store.get(p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      if (!options.context.manifest.refinementPair) return empty();
      calls++;
      return { ...empty(), resolutionCheck: { format: 1, outcome: snapshot.questions.filter((q) => q.status === "pending").length === 5 ? "blocked" : "distinct", explanation: "Existing questions must be answered before clarification" } };
    } });
    queue = new DiscoveryQueue(service); queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(calls, 1); assert.equal(store.get(p.id).questions.length, 5);
    p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Yes" });
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(calls, 2);
  } finally { await queue?.close(); store.close(); }
});

test("one Refine action bounds pair inference to twenty checks and the next action continues unchecked pairs", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = approvedPair(store, 7); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      if (!options.context.manifest.refinementPair) return empty();
      calls++;
      return { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Separate policy scopes" } };
    } }));
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id); assert.equal(calls, 20);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id); assert.equal(calls, 21);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id); assert.equal(calls, 21);
  } finally { await queue?.close(); store.close(); }
});

test("unsupported future resolution job envelopes are rejected without replacing original saved payloads", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-resolution-future-")), path = join(folder, "projects.sqlite");
  try {
    const initial = new ProjectStore(path); let projectID: string, jobID: string;
    try { const p = approvedPair(initial); projectID = p.id; jobID = (await pairProposal(initial, p)).id; } finally { initial.close(); }
    const database = new Database(path); let futurePayload: string;
    try {
      const row = database.prepare("SELECT payload FROM jobs WHERE id = ?").get(jobID) as { payload: string };
      const payload = JSON.parse(row.payload); payload.result.resolutionCheck.format = 2;
      futurePayload = JSON.stringify(payload);
      database.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(futurePayload, jobID);
    } finally { database.close(); }
    const reopened = new ProjectStore(path);
    try {
      assert.throws(() => reopened.getJob(jobID), /Unsupported requirement-resolution format/);
      assert.throws(() => reopened.jobs(projectID), /Unsupported requirement-resolution format/);
    } finally { reopened.close(); }
    const verify = new Database(path);
    try { assert.equal((verify.prepare("SELECT payload FROM jobs WHERE id = ?").get(jobID) as { payload: string }).payload, futurePayload); } finally { verify.close(); }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test("resolution evidence diagnostics distinguish non-source IDs, duplicate/stale citations and missing context without changing records", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = approvedPair(store), pair = p.requirements.map((r) => r.id) as [string, string];
    p.sources.push(
      { id: "historical-note", kind: "note", epicID: "project", text: "Original human note" },
      { id: "current-note", kind: "note", epicID: "project", text: "Corrected human note", supersedes: "historical-note" },
      { id: "deferred-source", kind: "deferral", epicID: "project", text: "Not decided" },
      { id: "delegated-source", kind: "delegation", epicID: "project", text: "Choose later" },
      { id: "orphan-approval", kind: "confirmation", epicID: "project", text: "Unlinked review" },
      { id: "workspace-source", kind: "workspace", epicID: "project", text: "Static observation" },
      { id: "outside-context", kind: "note", epicID: "project", text: "Not sent in this task" },
    );
    p.questions.push({ id: "question-record", text: "A question?", whyItMatters: "Scope", epicID: "project", status: "pending", options: [{ label: "Yes", consequence: "Enable" }, { label: "No", consequence: "Disable" }] });
    p.research.push({ id: "research-record", url: "https://example.com/spec", kind: "fetched-page", retrievedAt: "2026-10-20", excerpt: "Retrieved fact", finding: "A fact, not intent", title: "Specification", epicID: "project" });
    const included = [...p.sources.map((s) => s.id).filter((id) => id !== "outside-context"), ...pair, "question-record", "research-record"];
    const before = structuredClone(p);
    for (const [ids, basis, expected] of [
      [[pair[0]], "duplicate", "requirement ID, not a source ID"],
      [["question-record"], "duplicate", "question ID, not a source ID"],
      [["research-record"], "duplicate", "research ID, not a source ID"],
      [["invented-id"], "duplicate", "missing source"],
      [["current-note", "current-note"], "duplicate", "duplicate source ID"],
      [["historical-note"], "duplicate", "superseded source"],
      [["deferred-source"], "duplicate", "deferred decision"],
      [["delegated-source"], "duplicate", "delegated choice"],
      [["orphan-approval"], "duplicate", "currently accepted requirement"],
      [["outside-context"], "duplicate", "outside this round's detailed context"],
      [["workspace-source"], "human-decision", "Static workspace evidence cannot resolve a human product choice"],
    ] as const) {
      const proposal = resolutionProposal(p, pair);
      proposal.resolution!.evidenceIDs = [...ids]; proposal.resolution!.basis = basis;
      assert.throws(() => validateResolutionEvidence(p, proposal, included), (error: Error) => error.message.includes("resolution.evidenceIDs[") && error.message.includes(expected)
        && error.message.includes(ids[0]!) && error.message.includes("No proposals were applied"), expected);
    }
    const valid = resolutionProposal(p, pair); valid.resolution!.evidenceIDs = ["current-note", "workspace-source"];
    assert.doesNotThrow(() => validateResolutionEvidence(p, valid, included));
    valid.resolution!.basis = "human-decision"; valid.resolution!.evidenceIDs = ["current-note"];
    assert.doesNotThrow(() => validateResolutionEvidence(p, valid, included));
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("resolution prompt schemas share exact basis-specific evidence allowlists with publication", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = approvedPair(store), pair = p.requirements.map((r) => r.id) as [string, string];
    p.sources.push({ id: "old-note", kind: "note", text: "Old note", epicID: "project" },
      { id: "new-note", kind: "note", text: "Current correction", epicID: "project", supersedes: "old-note" },
      { id: "workspace-source", kind: "workspace", text: "Observed report code", epicID: "inbox" },
      { id: "deferred-source", kind: "deferral", text: "Unresolved", epicID: "project" });
    p.requirements[0]!.sourceIDs.push("workspace-source");
    const context = planContext(p, { recordIDs: pair, requiredEpicIDs: ["project", "inbox"], isolatedTask: true });
    context.manifest.refinementOnly = true; context.manifest.refinementPair = { requirementIDs: pair, contextKey: resolutionContextKey(p, pair) };
    const prompt = discoveryPrompt(p, context);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
    const options = schema.properties.refinements.items.properties.resolution.anyOf;
    for (const basis of ["duplicate", "human-decision"] as const) {
      const variant = options.find((item: { properties: { basis: { const: string } } }) => item.properties.basis.const === basis);
      assert.ok(variant, `Missing ${basis} resolution variant`);
      const ids = variant.properties.evidenceIDs.items.enum;
      assert.deepEqual(ids, resolutionEvidenceIDs(p, basis, context.manifest.includedIDs));
      assert.ok(ids.includes("new-note"));
      assert.ok(!ids.includes("old-note") && !ids.includes("deferred-source") && !ids.includes(pair[0]));
      assert.equal(ids.includes("workspace-source"), basis === "duplicate");
    }
    assert.match(prompt, /different citation fields with different rules/);
    assert.match(prompt, /each once/);
    assert.match(prompt, /historical sourceID on an approved requirement is not automatically eligible/);
    const noEvidence = structuredClone(p);
    noEvidence.sources = noEvidence.sources.map((s) => ({ ...s, kind: "deferral" }));
    const noSourcePrompt = discoveryPrompt(noEvidence, context);
    const noSourceSchema = JSON.parse(noSourcePrompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
    assert.equal(noSourceSchema.properties.refinements.maxItems, 0, "missing evidence cannot invite an invented resolution citation");
  } finally { store.close(); }
});

test("failed pair source citations preserve approvals and retry explicitly without resetting existing work", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = approvedPair(store); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair?.requirementIDs;
      if (!pair) return empty();
      const proposal = resolutionProposal(snapshot, pair);
      if (++calls === 1) proposal.resolution!.evidenceIDs = [pair[0], pair[1]];
      return { ...empty(), refinements: [proposal], resolutionCheck: { format: 1, outcome: "proposal", explanation: "Proposed consolidation for review" } };
    } }));
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.deepEqual(store.get(p.id), p);
    const failed = store.jobs(p.id).at(-1)!;
    assert.equal(failed.status, "failed");
    assert.match(failed.diagnostic!, /requirement ID, not a source ID/);
    assert.match(failed.diagnostic!, /resolution\.evidenceIDs\[0\]/);
    assert.equal(calls, 1);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    const retried = store.get(p.id);
    assert.equal(calls, 2); assert.deepEqual(retried.requirements, p.requirements);
    assert.equal(retried.refinements.length, 1);
    queue.resume(p.id, { refinementOnly: true }); await waitForQueue(queue, p.id);
    assert.equal(calls, 2, "a completed or pending resolution is not repeated after the explicit retry");
  } finally { await queue?.close(); store.close(); }
});
