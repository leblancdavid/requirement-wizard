import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Project } from "../core/model.js";
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
    assert.throws(() => assessmentContext({ ...requirement, sourceIDs: [tooLarge.sources[0]!.id] }, tooLarge), /Context blocked before inference/);
  } finally { await rm(root, { recursive: true, force: true }); }
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
