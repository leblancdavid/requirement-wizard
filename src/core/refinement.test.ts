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
