import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { projectSchema, type Project } from "../core/model.js";
import { requirementTaskContext } from "../core/execution-context.js";
import { captureWorkspace } from "./scan.js";
import { assessmentContext, assessmentCaptureFingerprint, assertAssessmentCaptureCurrent } from "./assessment.js";

const requirement: Project["requirements"][number] = { id: "r1", epicID: "project", status: "accepted", statement: "Save records", rationale: "Required behavior", acceptance: ["Saved records survive restart"], sourceIDs: ["human:1"] };

test("large omission inventories cannot displace exact source evidence from assessment context", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/assessment-context-"));
  try {
    await writeFile(join(root, "README.md"), "Exact captured implementation evidence.\n");
    const capture = await captureWorkspace(root, undefined, new AbortController().signal);
    const original = capture.sources[0]!;
    capture.sources = Array.from({ length: 40 }, (_, index) => ({ ...original, id: `captured-${index}`, text: `Captured component ${index}\n${"e".repeat(4900)}` }));
    capture.snapshot.files = capture.sources.map((source, index) => ({ path: `component-${index}.ts`, sourceID: source.id, hash: "hash", lines: 2 }));
    capture.snapshot.omitted = Array.from({ length: 1700 }, (_, index) => ({ path: `art/assets/omitted-${index}-${"x".repeat(80)}.png`, reason: "Unsupported/non-text file" }));
    const old = JSON.stringify({ requirement, evidence: capture.sources, omissions: capture.snapshot.omitted });
    assert.ok(old.length > 240000);
    const prepared = assessmentContext(requirement, capture);
    assert.ok(prepared.context.characters <= 48000);
    const context = JSON.parse(prepared.text);
    assert.ok(context.evidence.length < capture.sources.length, "Each request receives a focused evidence window");
    for (const source of context.evidence) assert.equal(source.text, capture.sources.find((s) => s.id === prepared.sourceIDs.get(source.id))!.text, "Selected source evidence remains byte-exact");
    assert.equal(context.omissions.count, 1700); assert.equal(context.omissions.examples.length, 8);
    assert.equal(context.omissions.reasons["Unsupported/non-text file"], 1700);
    assert.equal(prepared.sourceIDs.get("file:1"), capture.sources[0]!.id);
    assert.equal(capture.snapshot.omitted.length, 1700, "Full omission inventory is retained outside model context");
    assert.throws(() => assessmentContext({ ...requirement, statement: "human decision ".repeat(20000) }, capture), /Context blocked before inference/);
    const requestedID = context.evidenceIndex[0].id;
    const next = assessmentContext(requirement, capture, { requestEvidenceIDs: [requestedID] });
    assert.ok(next.sourceIDs.has(requestedID)); assert.ok(next.context.characters <= 48000);
    assert.throws(() => assessmentContext(requirement, capture, { requestEvidenceIDs: ["file:99999"] }), /outside the captured/);
    const tooLarge = structuredClone(capture); tooLarge.sources[0]!.text = "large indivisible evidence".repeat(4000);
    const linked = assessmentContext({ ...requirement, sourceIDs: [tooLarge.sources[0]!.id] }, tooLarge);
    assert.ok(!linked.sourceIDs.has("file:1"), "Oversized linked code is indexed rather than forced into every window");
    assert.ok(linked.availableEvidenceIDs.has("file:1"));
    const unavailable = assessmentContext(requirement, tooLarge, { requestEvidenceIDs: ["file:1"] });
    assert.equal(unavailable.sourceIDs.size, 0);
    assert.deepEqual(unavailable.deferredEvidenceIDs, ["file:1"]);
    assert.ok(unavailable.context.characters <= 48000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("answered-question proposals and linked file inventories do not crowd out assessment evidence", () => {
  const p = projectSchema.parse({ id: "p", name: "Assessment fixture", revision: 1,
    model: { providerID: "openai", modelID: "fixture" }, summary: "", goals: [], actors: [], assumptions: [],
    requirements: [{ ...requirement, sourceIDs: ["human:1", "code:1", "code:2"] }],
    sources: [{ id: "human:1", kind: "answer", epicID: "project", questionID: "q1", text: "Save locally" }],
    questions: [{ id: "q1", epicID: "project", text: "Where should records be saved?", whyItMatters: "Generated explanation", status: "answered", sourceID: "human:1",
      options: [{ label: "Save locally", consequence: "Keep records on this device" }, { label: "Remote", consequence: "Unused alternative ".repeat(500) }] }],
  });
  const sources: Project["sources"] = [1, 2].map((index) => ({ id: `code:${index}`, kind: "workspace", epicID: "project", text: `Save records implementation ${index}\n${"e".repeat(22000)}` }));
  p.sources.push(...sources);
  const scan = { workspaceKey: "fixture", sources, snapshot: { id: "scan", capturedAt: "2026-10-19T00:00:00Z", files: sources.map((s, i) => ({ sourceID: s.id, path: `src/save-${i}.ts`, hash: "hash", lines: 2 })),
    omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  const prepared = assessmentContext(p.requirements[0]!, scan, { project: p });
  assert.ok(prepared.context.characters <= 48000);
  assert.equal(prepared.sourceIDs.size, 1, "Linked file evidence is paged to fit the request");
  const context = JSON.parse(prepared.text);
  assert.equal(context.decisions[0].text, "Save locally");
  assert.deepEqual(context.questions[0].options, [{ label: "Save locally", consequence: "Keep records on this device" }]);
  assert.equal(context.evidence[0].text, sources[0]!.text);
  assert.ok(prepared.availableEvidenceIDs.has("file:2"));
  const next = assessmentContext(p.requirements[0]!, scan, { project: p, requestEvidenceIDs: ["file:2"] });
  assert.deepEqual([...next.sourceIDs.keys()], ["file:2"]);
  assert.equal(JSON.parse(next.text).evidence[0].text, sources[1]!.text);
  const batched = assessmentContext(p.requirements[0]!, scan, { project: p, requestEvidenceIDs: ["file:1", "file:2"] });
  assert.ok(batched.context.characters <= 48000);
  assert.equal(batched.sourceIDs.size, 1);
  assert.deepEqual(batched.deferredEvidenceIDs, ["file:2"]);
  assert.deepEqual(JSON.parse(batched.text).contextScope.deferredEvidenceIDs, ["file:2"]);
  assert.ok(batched.availableEvidenceIDs.has("file:2"));
  p.sources[0]!.text = "Exact human decision ".repeat(3000);
  assert.throws(() => assessmentContext(p.requirements[0]!, scan, { project: p }), /Context blocked before inference/);
});

test("assessment snapshots fingerprint exact captured scope and reject changed source bytes", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/assessment-snapshot-"));
  try {
    const signal = new AbortController().signal;
    await writeFile(join(root, "README.md"), "Original source\n");
    const first = await captureWorkspace(root, undefined, signal), second = await captureWorkspace(root, undefined, signal);
    assert.equal(assessmentCaptureFingerprint(first), assessmentCaptureFingerprint(second));
    await assertAssessmentCaptureCurrent(root, first, signal);
    await writeFile(join(root, "README.md"), "Changed source!\n");
    await assert.rejects(assertAssessmentCaptureCurrent(root, first, signal), /Files changed/);
    const changed = await captureWorkspace(root, undefined, signal);
    assert.notEqual(assessmentCaptureFingerprint(first), assessmentCaptureFingerprint(changed));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("oversized repeated approval snapshots share exact text losslessly before assessment blocks", () => {
  const p = projectSchema.parse({ id: "p", name: "Shared text fixture", revision: 1,
    model: { providerID: "openai", modelID: "fixture" }, summary: "", goals: [], actors: [], assumptions: [], questions: [],
    requirements: [requirement], sources: [{ id: "human:1", kind: "initial", text: "Save my records" }],
  });
  for (let index = 0; index < 2; index++) {
    const statement = `Constraint ${index}: ${"Exact approved behavior. ".repeat(330)}`;
    const acceptance = [`Scenario ${index}: ${"Exact acceptance behavior. ".repeat(150)}`];
    p.requirements.push({ id: `guardrail-${index}`, epicID: "project", status: "accepted", statement, acceptance, rationale: "Background", sourceIDs: [`confirmation-${index}`] });
    p.sources.push({ id: `confirmation-${index}`, kind: "confirmation", epicID: "project", requirementID: `guardrail-${index}`,
      text: `Requirement: ${statement}\nAcceptance: ${JSON.stringify(acceptance)}\nHuman decision: accepted` });
  }
  const before = structuredClone(p);
  const scan = { workspaceKey: "fixture", sources: [{ id: "current-code", kind: "workspace" as const, epicID: "project", text: "Save records implementation" }],
    snapshot: { id: "scan", capturedAt: "2026-10-19T00:00:00Z", files: [{ sourceID: "current-code", path: "src/save.ts", hash: "hash", lines: 1 }], omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  assert.ok(JSON.stringify(requirementTaskContext(p, "r1", [], false).data).length > 48000);
  const prepared = assessmentContext(p.requirements[0]!, scan, { project: p });
  const wire = JSON.parse(prepared.text);
  assert.ok(wire.sharedText);
  const expand = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (Object.keys(object).length === 1 && typeof object.sharedTextID === "string") return wire.sharedText.values[object.sharedTextID];
      if (Object.keys(object).length === 1 && Array.isArray(object.textParts)) return object.textParts.map(expand).join("");
      return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, expand(item)]));
    }
    return value;
  };
  const expanded = expand(wire) as typeof wire;
  assert.deepEqual(expanded.requirement, p.requirements[0]);
  assert.deepEqual(expanded.decisions, p.sources);
  assert.equal(expanded.evidence[0].text, scan.sources[0]!.text);
  assert.ok(prepared.context.characters <= 48000);
  assert.deepEqual(p, before);
});
