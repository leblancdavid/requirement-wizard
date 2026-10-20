import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { currentDecisionProjection, reviewSnapshot } from "./current-decisions.js";
import { gapBacklog, gapEvidence } from "./gap-backlog.js";
import { planGapContext } from "./gap-context.js";
import { planContext } from "./working-set.js";
import { proposeRefinements, reviewRefinement } from "./refinement.js";
import type { Analysis, Job, Project } from "./model.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";

const empty = (): Analysis => ({ summary: "Task-sized interpretation", goals: [], actors: [], assumptions: [],
  questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });

function seed(store: ProjectStore) {
  let p = store.create("Gap ledger", "Keep original human idea", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), organization: [
    { type: "upsert", epicID: "new:a", title: "First feature", purpose: "First workflow", dependencies: [] },
    { type: "upsert", epicID: "new:b", title: "Second feature", purpose: "Independent workflow", dependencies: [] },
  ], requirements: [0, 1].map((i) => ({ epicID: i ? "new:b" : "new:a", statement: `Preserve behavior ${i}`,
    rationale: `Evidence ${i}`, acceptance: [`Scenario ${i} succeeds`], sourceIDs: [p.sources[0]!.id] })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  return p;
}

function reviewSource(id: string, r: Project["requirements"][number], note: string, supersedes?: string): Project["sources"][number] {
  return { id, kind: "confirmation", epicID: r.epicID, requirementID: r.id, ...(supersedes ? { supersedes } : {}),
    text: `Requirement ${r.id}: ${r.statement}\nAcceptance scenarios: ${JSON.stringify(r.acceptance)}\nHuman decision: accepted\nAddendum: ${note}` };
}

test("current decisions omit only proven superseded plain snapshots and retain exact older human addenda", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store); const target = p.requirements[0]!;
    p = store.review(p.id, p.revision, target.id, "accepted", "  Keep recovery offline\r\n");
    const note = p.sources.at(-1)!;
    p = store.review(p.id, p.revision, target.id, "accepted", "");
    const before = structuredClone(p), view = currentDecisionProjection(p);
    assert.ok(view.omitted.has(target.sourceIDs.at(-1)!));
    assert.ok(view.addenda.has(note.id)); assert.ok(!view.omitted.has(note.id));
    const pack = planContext(p, { recordIDs: [target.id], focusEpicID: target.epicID, isolatedTask: true, gapExploration: true });
    const data = pack.data as { sources: Project["sources"]; requirements: Project["requirements"]; currentDecisions: { explanation: string } };
    assert.deepEqual(data.sources.find((s) => s.id === note.id), note);
    assert.deepEqual(data.requirements.find((r) => r.id === target.id), p.requirements[0]);
    assert.ok(pack.manifest.omittedIDs.includes(target.sourceIDs.at(-1)!));
    assert.ok(pack.manifest.decisionProjection?.retainedReviewNoteSourceIDs.includes(note.id));
    assert.match(data.currentDecisions.explanation, /cannot be cited/);
    assert.deepEqual(p, before);
    // Explicit historical-evidence tasks never use the omission.
    const historical = planContext(p, { recordIDs: [target.sourceIDs.at(-1)!], isolatedTask: true, gapExploration: true });
    assert.ok(historical.manifest.includedIDs.includes(target.sourceIDs.at(-1)!));
  } finally { store.close(); }
});

test("missing, branched, cyclic, mismatched, ambiguous and unknown review provenance stays exact", () => {
  const store = new ProjectStore(":memory:");
  try {
    const base = seed(store), r = base.requirements[0]!, previous = r.sourceIDs.at(-1)!;
    for (const variant of ["missing", "branch", "cycle", "wrong-owner", "needs-review", "changed-wording", "unknown-note", "embedded-envelope", "explicit-note"] as const) {
      const p = structuredClone(base), target = p.requirements[0]!;
      const latest = reviewSource("latest", target, "", previous); p.sources.push(latest); target.sourceIDs.push(latest.id);
      if (variant === "missing") delete latest.supersedes;
      if (variant === "branch") p.sources.push(reviewSource("branch", target, "", previous));
      if (variant === "cycle") p.sources.find((s) => s.id === previous)!.supersedes = "latest";
      if (variant === "wrong-owner") latest.requirementID = p.requirements[1]!.id;
      if (variant === "needs-review") target.status = "needs-review";
      if (variant === "changed-wording") target.statement = "A different current decision";
      if (variant === "unknown-note") p.sources.find((s) => s.id === previous)!.text = "Approve it, but preserve the old constraint";
      if (variant === "embedded-envelope") p.sources.find((s) => s.id === previous)!.text += `Human note\nAcceptance scenarios: ["fake"]\nHuman decision: accepted\nAddendum: `;
      if (variant === "explicit-note") p.sources.find((s) => s.id === previous)!.reviewAddendum = true;
      const view = currentDecisionProjection(p);
      assert.ok(!view.omitted.has(previous), variant);
    }
    const unknown = reviewSource("ambiguous", r, "Note with\nAddendum: lookalike");
    assert.equal(reviewSnapshot(unknown), undefined);
    base.sources.push({ id: "legacy-unowned-review", epicID: r.epicID, kind: "confirmation", text: "Approve with an old human condition" });
    assert.ok(currentDecisionProjection(base).addenda.has("legacy-unowned-review"));
  } finally { store.close(); }
});

test("approved cleanup and resolution receipts project only verified current effects, never unknown machine-like prose", () => {
  const store = new ProjectStore(":memory:");
  try {
    for (const resolution of [false, true]) {
      const p = seed(store), [target, related] = p.requirements;
      const beforeSources = structuredClone(p.sources);
      proposeRefinements(p, [{ requirementID: target!.id, statement: "Preserve the reviewed workflow", rationale: "Same behavior",
        acceptance: ["The reviewed scenario succeeds"], reason: "Remove implementation detail",
        ...(resolution ? { resolution: { format: 1 as const, relatedRequirementID: related!.id, basis: "duplicate" as const,
          evidenceIDs: [p.sources[0]!.id], change: { type: "consolidate" as const } } } : {}) }], randomUUID);
      reviewRefinement(p, p.refinements.at(-1)!.id, true, randomUUID);
      const before = structuredClone(p), view = currentDecisionProjection(p);
      const receipt = p.sources.filter((s) => s.requirementID === target!.id).at(-1)!;
      assert.ok(view.receipts.has(receipt.id));
      assert.ok(view.omitted.has(beforeSources.find((s) => s.requirementID === target!.id)!.id));
      assert.ok(!view.addenda.has(receipt.id), "AI cleanup reasons are not new human addenda");
      const context = planContext(p, { recordIDs: [target!.id], isolatedTask: true, gapExploration: true });
      const projected = (context.data as { sources: Array<{ id: string; text: unknown }> }).sources.find((s) => s.id === receipt.id)!;
      assert.deepEqual(projected.text, { approvedReviewReceipt: view.receipts.get(receipt.id) });
      assert.ok(context.manifest.decisionProjection!.projectedReceiptSourceIDs!.includes(receipt.id));
      assert.deepEqual(p, before);
      const corrupted = structuredClone(p); corrupted.sources.find((s) => s.id === receipt.id)!.text += " User adds an extra restriction.";
      assert.ok(!currentDecisionProjection(corrupted).receipts.has(receipt.id));
      const unsupported = structuredClone(p); unsupported.refinements = [];
      assert.ok(currentDecisionProjection(unsupported).addenda.has(receipt.id), "a receipt-shaped prefix alone establishes nothing");
    }
  } finally { store.close(); }
});

test("gap identities ignore revision and explanation churn but follow relevant human input, explicit links and transitive dependencies", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), r = p.requirements[0]!, original = gapEvidence(p)(r).inputKey;
    const unrelated = structuredClone(p); unrelated.revision += 10; unrelated.summary = "New advisory summary";
    unrelated.requirements[0]!.rationale = "New generated explanation";
    unrelated.sources.push({ id: "independent-note", kind: "note", epicID: p.requirements[1]!.epicID, text: "Independent human decision" });
    assert.equal(gapEvidence(unrelated)(unrelated.requirements[0]!).inputKey, original);
    unrelated.sources.push({ id: "feature-note", kind: "note", epicID: r.epicID, text: "Feature-level guardrail" });
    assert.notEqual(gapEvidence(unrelated)(unrelated.requirements[0]!).inputKey, original);
    const dependency = structuredClone(p);
    dependency.epics.push({ id: "transitive", title: "Transitive dependency", purpose: "Shared", archived: false, dependencies: [] });
    dependency.epics.find((e) => e.id === r.epicID)!.dependencies = [p.requirements[1]!.epicID];
    dependency.epics.find((e) => e.id === p.requirements[1]!.epicID)!.dependencies = ["transitive"];
    const before = gapEvidence(dependency)(dependency.requirements[0]!).inputKey;
    dependency.sources.push({ id: "transitive-note", kind: "note", epicID: "transitive", text: "Do not lose dependency work" });
    assert.notEqual(gapEvidence(dependency)(dependency.requirements[0]!).inputKey, before);
    const changed = structuredClone(p); changed.requirements[0]!.acceptance.push("New boundary");
    assert.notEqual(gapEvidence(changed)(changed.requirements[0]!).inputKey, original);
    assert.throws(() => gapBacklog(p, [], "missing"), /Focused epic/);
  } finally { store.close(); }
});

test("a thousand-requirement backlog keeps one request bounded and adding a proposal does not replay compatible checks", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), template = p.requirements[0]!;
    p.requirements = Array.from({ length: 1000 }, (_, i) => ({ ...template, id: `requirement-${i}`, statement: `Workflow behavior ${i}`,
      sourceIDs: [p.sources[0]!.id, `approval-${i}`], acceptance: [`Scenario ${i} succeeds`] }));
    p.sources = [p.sources[0]!, ...p.requirements.map((r, i) => reviewSource(`approval-${i}`, r, ""))];
    const before = structuredClone(p), context = planGapContext(p, [], template.epicID);
    assert.equal(context.gapReport!.total, 3000);
    assert.ok(context.manifest.characters <= 48000);
    assert.ok(context.manifest.includedIDs.length < 10, "the catalog is not sent as detailed evidence");
    const job: Job = { id: "checked", projectID: p.id, expectedRevision: p.revision, model: p.model, status: "completed", leaseUntil: null, context: context.manifest };
    const checkedKey = context.manifest.gapExploration!.check!.inputKey;
    p.requirements.push({ ...p.requirements[0]!, id: "new-proposal", status: "proposed", statement: "A distinct new proposed behavior", sourceIDs: [p.sources[0]!.id] });
    const catalog = gapBacklog(p, [job], template.epicID);
    assert.equal(catalog.length, 3003);
    assert.ok(catalog.some((t) => t.state === "checked" && t.inputKey === checkedKey));
    p.requirements.pop(); assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("explicit empty-feature exploration uses real initial evidence and defaults omitted proposal areas to the detailed scope", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "new-area", title: "Recovery", purpose: "Explore interruption recovery", dependencies: [] }]);
    const initial = structuredClone(p.sources[0]!);
    const context = planGapContext(p, [], "new-area");
    assert.equal(context.manifest.focusEpicID, "new-area");
    assert.equal(context.manifest.gapExploration!.targetRecordID, initial.id);
    assert.ok((context.data as { focusedEpics: { purpose: string }[] }).focusedEpics.some((e) => e.purpose === "Explore interruption recovery"));
    const job = await new DiscoveryService(store, { async analyze() { return { ...empty(), questions: [{ text: "What should recovery preserve?",
      whyItMatters: "Resolve interruptions", evidenceIDs: [initial.id], options: [{ label: "Progress", consequence: "Keep progress" }, { label: "Nothing", consequence: "Reset progress" }] }] }; } })
      .analyze(p.id, p.revision, { focusEpicID: "new-area" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(store.get(p.id).questions[0]!.epicID, "new-area");
    assert.deepEqual(store.get(p.id).sources[0], initial);
  } finally { store.close(); }
});

test("durable task checks survive reopen and exhausted scopes return without inference or specification revisions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-gap-ledger-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const original = seed(store), target = original.requirements[0]!;
    let calls = 0;
    for (let i = 0; i < 5; i++) {
      const p = store.get(original.id), before = structuredClone(p);
      const job = await new DiscoveryService(store, { async analyze(_p, options) {
        calls++; assert.ok(options.context.manifest.gapExploration?.check);
        assert.ok(options.context.manifest.characters <= options.context.manifest.budget);
        return empty();
      } }).analyze(p.id, p.revision, { focusEpicID: target.epicID });
      assert.equal(job.status, "completed", job.diagnostic);
      assert.deepEqual(store.get(p.id).sources, before.sources);
      assert.deepEqual(store.get(p.id).requirements, before.requirements);
      assert.deepEqual(store.get(p.id).summary, before.summary);
      if (i >= 3) { assert.equal(job.gapReport!.modelCalls, 0); assert.equal(store.get(p.id).revision, p.revision); }
      const savedJobs = store.jobs(p.id);
      const history = store.gapHistory(p.id);
      assert.equal(history.length, i + 1);
      assert.ok(history.every((j) => !("result" in j) && !("omittedIDs" in (j.context ?? {}))));
      assert.deepEqual(gapBacklog(store.get(p.id), history, target.epicID).map((t) => t.state),
        gapBacklog(store.get(p.id), savedJobs, target.epicID).map((t) => t.state));
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.jobs(p.id), savedJobs);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Reopen cannot start inference"); } }));
      assert.equal(queue.isActive(p.id), false); await queue.close();
    }
    assert.equal(calls, 3, "one behavior, failure and acceptance check, not repeated calls on unchanged evidence");
    const idleBefore = store.get(original.id), stop = new AbortController();
    const stoppedIdle = await new DiscoveryService(store, { async analyze() { assert.fail("Cancelled idle exploration cannot request inference"); } })
      .analyze(original.id, idleBefore.revision, { focusEpicID: target.epicID, signal: stop.signal, onJob: () => stop.abort() });
    assert.equal(stoppedIdle.status, "cancelled"); assert.equal(stoppedIdle.gapReport!.modelCalls, 0);
    assert.deepEqual(store.get(original.id), idleBefore);
    const backlog = gapBacklog(store.get(original.id), store.jobs(original.id), target.epicID);
    assert.deepEqual(backlog.map((t) => t.state), ["checked", "checked", "checked"]);
    const p = store.get(original.id);
    store.note(p.id, p.revision, "Keep unrelated work", original.requirements[1]!.epicID);
    assert.ok(gapBacklog(store.get(p.id), store.jobs(p.id), target.epicID).every((t) => t.state === "checked"));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("failed, malformed, cancelled and stale attempts never establish reusable gap checks", async () => {
  for (const failure of ["provider", "malformed", "references", "startup-cancelled", "cancelled", "stale"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const p = seed(store), target = p.requirements[0]!, controller = new AbortController();
      const failed = await new DiscoveryService(store, { async analyze() {
        if (failure === "startup-cancelled") assert.fail("Cancellation before inference must not invoke the adapter");
        if (failure === "provider") throw new Error("Provider unavailable");
        if (failure === "malformed") return { ...empty(), requirements: [{ statement: "Broken evidence" }] };
        if (failure === "references") return { ...empty(), requirements: [{ statement: "Unsupported behavior", rationale: "Invalid evidence",
          acceptance: ["Not established"], sourceIDs: ["missing-source"] }] };
        if (failure === "cancelled") controller.abort();
        if (failure === "stale") store.note(p.id, store.get(p.id).revision, "Unrelated human input", p.requirements[1]!.epicID);
        return empty();
      } }).analyze(p.id, p.revision, { focusEpicID: target.epicID, signal: controller.signal,
        ...(failure === "startup-cancelled" ? { onJob: () => controller.abort() } : {}) });
      assert.notEqual(failed.status, "completed");
      const current = store.get(p.id), backlog = gapBacklog(current, store.jobs(p.id), target.epicID);
      assert.ok(backlog.every((t) => t.state === "pending"));
      const retry = planGapContext(current, store.jobs(p.id), target.epicID);
      assert.deepEqual(retry.manifest.gapExploration, failed.context!.gapExploration);
      assert.deepEqual(current.requirements, p.requirements);
    } finally { store.close(); }
  }
});

test("linked unresolved questions wait without inference; concrete answers reopen only applicable evidence scopes", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), target = p.requirements[0]!;
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { ...empty(), questions: [{ epicID: target.epicID,
      text: "What should recovery preserve?", whyItMatters: "Resolve recovery", evidenceIDs: [target.id],
      options: [{ label: "Local work", consequence: "Keep local progress" }, { label: "Nothing", consequence: "Discard progress" }] }] }; } });
    const first = await service.analyze(p.id, p.revision, { focusEpicID: target.epicID });
    assert.equal(first.status, "completed", first.diagnostic);
    let current = store.get(p.id);
    const waiting = await service.analyze(p.id, current.revision, { focusEpicID: target.epicID });
    assert.equal(calls, 1); assert.equal(waiting.gapReport!.state, "waiting"); assert.equal(waiting.gapReport!.modelCalls, 0);
    assert.deepEqual(store.get(p.id), current);
    const q = current.questions[0]!;
    current = store.answer(p.id, current.revision, q.id, { kind: "answer", text: "  Local work\r\n" });
    const task = planGapContext(current, store.jobs(p.id), target.epicID);
    assert.ok(task.manifest.includedIDs.includes(current.questions[0]!.sourceID!));
    assert.ok(gapBacklog(current, store.jobs(p.id), target.epicID).some((t) => t.state === "pending"));
  } finally { store.close(); }
});

test("compatible legacy gap checks migrate from original snapshots without replay or invented provenance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-gap-legacy-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), target = p.requirements[0]!;
    const legacy = store.beginJob(p.id, p.revision).job; store.claimJob(legacy.id, Date.now() + 60000);
    const context = planContext(p, { recordIDs: [target.id], focusEpicID: target.epicID, isolatedTask: true, gapExploration: true });
    context.manifest.gapExploration = { targetRecordID: target.id }; // Shipped representation has no check envelope.
    store.attachContext(legacy.id, context.manifest); store.finishJob(legacy.id, empty());
    const originalJob = store.getJob(legacy.id);
    let calls = 0;
    const current = store.get(p.id);
    const next = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++; assert.equal(options.context.manifest.gapExploration!.check!.lens, "failures"); return empty();
    } }).analyze(p.id, current.revision, { focusEpicID: target.epicID });
    assert.equal(next.status, "completed", next.diagnostic); assert.equal(calls, 1);
    assert.equal(next.gapReport!.reusedChecks![0]!.sourceJobID, legacy.id);
    assert.deepEqual(store.getJob(legacy.id), originalJob);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path);
      assert.equal(gapBacklog(store.get(p.id), store.jobs(p.id), target.epicID).filter((t) => t.state === "checked").length, 2);
      assert.deepEqual(store.getJob(legacy.id), originalJob);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("blocked task receipts prevent repeated oversized preflight from starving later tasks and reopen on scope changes", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    for (let i = 0; i < 9; i++) p = store.note(p.id, p.revision, `${i}:${String.fromCharCode(97 + i).repeat(11998)}`, "project");
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    const first = await service.analyze(p.id, p.revision);
    assert.equal(first.status, "failed"); assert.ok(first.gapReport!.blocked > 0);
    const second = await service.analyze(p.id, p.revision);
    assert.equal(second.gapReport!.modelCalls, 0); assert.equal(calls, 0);
    assert.deepEqual(store.get(p.id), p);
    const moved = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "isolated", title: "Isolated notes", purpose: "Explicit human scope change", dependencies: [] },
      ...p.sources.filter((s) => s.kind === "note").map((s) => ({ type: "move" as const, recordID: s.id, epicID: "isolated" }))]);
    const current = await service.analyze(p.id, moved.revision, { focusEpicID: p.requirements[0]!.epicID });
    assert.equal(current.status, "completed", current.diagnostic); assert.equal(calls, 1);
  } finally { store.close(); }
});

test("future gap-check and report formats reject reads without overwriting saved payloads", () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-gap-future-")), path = join(directory, "projects.sqlite");
  let store: ProjectStore | undefined = new ProjectStore(path);
  try {
    const p = seed(store), context = planGapContext(p, [], p.requirements[0]!.epicID);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); store.attachContext(job.id, context.manifest);
    store.failJob(job.id, "failed", "Fixture stopped");
    const original = store.getJob(job.id); store.close(); store = undefined;
    for (const field of ["check", "report", "projection"] as const) {
      const raw = structuredClone(original) as Job;
      if (field === "check") (raw.context!.gapExploration!.check as { format: number }).format = 99;
      else if (field === "report") raw.gapReport = { ...context.gapReport!, format: 99 as 1 };
      else (raw.context!.decisionProjection as { format: number }).format = 99;
      const db = new Database(path), payload = JSON.stringify(raw); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(payload, job.id); db.close();
      store = new ProjectStore(path);
      assert.throws(() => store!.getJob(job.id)); assert.throws(() => store!.gapHistory(p.id)); store.close(); store = undefined;
      const check = new Database(path, { readonly: true });
      assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string }).payload, payload); check.close();
    }
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
