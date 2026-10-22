import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Job, Project } from "../core/model.js";
import { directoryKey } from "./workspace.js";
import { assessmentPrompt, checkExecutionContext, executionContextBudget, ExecutionContextError, requirementTaskContext } from "../core/execution-context.js";
import { shareRecordStructure, shareRepeatedIdentifiers, shareRepeatedText } from "../core/working-set.js";
import { assessmentImpactPolicy, matchesAssessmentPath, reviewedAssessmentPaths, sharedAssessmentFile, type AssessmentFootprint } from "../core/assessment-impact.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import type { ExecutionConfig } from "../core/execution.js";
import { captureWorkspace } from "./scan.js";

export type AssessmentCapture = NonNullable<Job["scan"]>;
export function assessmentCaptureFingerprint(scan: AssessmentCapture) {
  // Preserve the existing identity across the publication-folder rename. This
  // excluded metadata is not inspected code; do not invalidate expensive checks.
  const omitted = scan.snapshot.omitted.map((item) => item.path === ".reqwizit" ? { ...item, path: ".requirement-wizard" } : item);
  return createHash("sha256").update(JSON.stringify({ files: scan.snapshot.files, omitted, limited: scan.snapshot.traversalLimited })).digest("hex");
}

/** Hash the search/impact boundary, not merely the evidence cited by the model.
 * New/deleted files participate; incomplete watched scope falls back to the full capture.
 * Omission inventories remain global guardrails and are never treated as inspected code. */
export function assessmentFootprint(project: Project, id: string, config: ExecutionConfig, scan: AssessmentCapture,
  citedPaths: string[] = []): AssessmentFootprint {
  const paths = reviewedAssessmentPaths(project, id, config);
  const referenced = requirementTaskContext(project, id, config.dependencies[id], false, config.dependencies).referencedWorkspacePaths;
  const watches = (path: string) => !paths || sharedAssessmentFile(path) || citedPaths.includes(path) || referenced.has(path)
    || paths.some((prefix) => matchesAssessmentPath(path, prefix));
  const broad = !paths || scan.snapshot.traversalLimited || paths.some((prefix) => !scan.snapshot.files.some((f) => matchesAssessmentPath(f.path, prefix)))
    || scan.snapshot.omitted.some((item) => watches(item.path)
    && !item.reason.startsWith("Excluded dependency/generated/tool-guidance/hidden"));
  const grouped = new Map<string, AssessmentFootprint["files"][number]>();
  for (const f of scan.snapshot.files.filter((f) => broad || watches(f.path))) {
    const entry = grouped.get(f.path) ?? { path: f.path, hash: f.hash, ranges: "" };
    entry.ranges += `${f.startLine ?? 1}:${f.endLine ?? f.lines};`;
    grouped.set(f.path, entry);
  }
  const files = [...grouped.values()].sort((a, b) => a.path.localeCompare(b.path, "en"));
  const hash = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
  // Our publication directory exists only in the connected working folder, not
  // necessarily in a detached main worktree. It is never captured code evidence;
  // normative requirements/decisions have their own independent identity.
  const omissionsFingerprint = hash(scan.snapshot.omitted.filter((item) => ![".requirement-wizard", ".reqwizit"].includes(item.path))
    .sort((a, b) => a.path.localeCompare(b.path, "en") || a.reason.localeCompare(b.reason, "en")));
  const policy = assessmentImpactPolicy(project, id, config);
  return { version: 1, policy, fingerprint: hash({ policy, files, omissionsFingerprint, broad, limited: scan.snapshot.traversalLimited }), files, omissionsFingerprint, broad };
}

export function assessmentImpactReason(previous: AssessmentFootprint | undefined, next: AssessmentFootprint) {
  if (!previous) return "No scoped footprint: using conservative legacy snapshot checks.";
  if (previous.policy !== next.policy) return "Reviewed assessment scope or prerequisite scope changed.";
  const before = new Map(previous.files.map((file) => [file.path, file]));
  const after = new Map(next.files.map((file) => [file.path, file]));
  const changes = [...new Set([...before.keys(), ...after.keys()])].filter((path) => canonicalJSON(before.get(path)) !== canonicalJSON(after.get(path)));
  if (changes.length) return `Relevant code added, changed or removed: ${changes.slice(0, 3).join(", ")}${changes.length > 3 ? ` (+${changes.length - 3} more)` : ""}.`;
  if (previous.omissionsFingerprint !== next.omissionsFingerprint || previous.broad !== next.broad) return "Capture coverage or omitted scope changed; impact needs a conservative reassessment.";
  return "Relevant code and search scope are unchanged; saved semantic assessment can be reused.";
}

/** One requirement, exact normative evidence, and a bounded window of relevant current files. */
export function assessmentContext(requirement: Project["requirements"][number], scan: AssessmentCapture,
  options: { project?: Project; dependencyIDs?: string[]; dependencyGraph?: Record<string, string[]>; requestEvidenceIDs?: string[]; impactPaths?: Set<string> } = {}) {
  const reasons: Record<string, number> = {};
  for (const item of scan.snapshot.omitted) {
    const reason = item.reason.replace(/\d+/g, "#"); reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const task = options.project ? requirementTaskContext(options.project, requirement.id, options.dependencyIDs, false, options.dependencyGraph) : undefined;
  const targetEvidence = task?.targetEvidence ?? new Set(requirement.sourceIDs);
  const words = [...new Set([requirement.statement, requirement.rationale, ...requirement.acceptance].join(" ").toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? [])]
    .filter((word) => !new Set(["the", "and", "shall", "will", "must", "when", "user", "application", "support", "available", "after", "with", "that", "from", "this", "have", "their", "into", "ensure", "behavior", "required"]).has(word)).slice(0, 40);
  const ranked = scan.sources.map((source, index) => {
    const file = scan.snapshot.files.find((f) => f.sourceID === source.id);
    const text = source.text.toLowerCase(), path = file?.path.toLowerCase() ?? "";
    const linked = targetEvidence.has(source.id) || !!file && !!task?.referencedWorkspacePaths.has(file.path);
    const score = (linked ? 1000 : 0) + words.reduce((total, word) => total + (path.includes(word) ? 10 : 0) + (text.includes(word) ? 1 : 0), 0);
    return { id: `file:${index + 1}`, source, file, score, index };
  }).filter((entry) => !options.impactPaths || !!entry.file && options.impactPaths.has(entry.file.path)).sort((a, b) => b.score - a.score || a.index - b.index);
  const requested = new Set(options.requestEvidenceIDs ?? []);
  if ([...requested].some((id) => !ranked.some((entry) => entry.id === id))) throw new Error("Requested assessment evidence is outside the captured source scope.");
  // Captured files are current implementation evidence, not indivisible human
  // decisions. Prioritize provenance links, but page them like other code evidence.
  const selected = ranked.filter((entry) => requested.has(entry.id));
  const omissions = { count: scan.snapshot.omitted.length, reasons, traversalLimited: scan.snapshot.traversalLimited,
    examples: [] as { pathPreview: string; reason: string }[],
    explanation: "Only a bounded sample of omitted-path metadata is shown. All omissions are retained in the assessment run. Omitted files/portions and indexed-only captured excerpts were not inspected in this request and cannot establish missing or complete behavior." };
  const { evidence: decisions, ...records } = task?.data ?? { requirement, evidence: [] };
  let normative: Record<string, unknown> = { ...records, decisions };
  const evidenceIndex: { id: string; pathPreview: string; startLine?: number; endLine?: number }[] = [];
  const serialize = () => JSON.stringify({ ...normative,
    ...(options.impactPaths ? { assessmentBoundary: { policy: "Human-reviewed impact scope plus shared configuration, prerequisites and referenced evidence. Findings apply only within this boundary; excluded captured files were not inspected.", excludedCapturedExcerpts: scan.sources.length - ranked.length } } : {}),
    evidence: selected.map((entry) => ({ id: entry.id, text: entry.source.text })), evidenceIndex,
    contextScope: { detailed: selected.length, captured: ranked.length, omittedFromDetail: ranked.length - selected.length,
      ...(requested.size ? { deferredEvidenceIDs: [...requested].filter((id) => !selected.some((entry) => entry.id === id)) } : {}),
      indexOmitted: ranked.length - selected.length - evidenceIndex.length, policy: "Only the detailed evidence window can support this result. Request another bounded window rather than guessing about indexed/omitted code." },
    omissions, traversalLimited: scan.snapshot.traversalLimited });
  const check = () => checkExecutionContext(assessmentPrompt(serialize()), false, requirement.id);
  // Reuse discovery's lossless encoding before blocking on repeated approval
  // snapshots and provenance IDs. Current file bytes/handles are never encoded.
  for (const compact of [shareRepeatedText, shareRepeatedIdentifiers,
    (data: unknown) => shareRecordStructure(data, ["decisions", "guardrails", "supportingRequirements"])]) {
    try { check(); break; } catch (error) { if (!(error instanceof ExecutionContextError)) throw error; }
    const candidate = compact(normative).data;
    if (JSON.stringify(candidate).length < JSON.stringify(normative).length) normative = candidate;
  }
  try { check(); } catch (error) {
    if (!(error instanceof ExecutionContextError) || !requested.size) throw error;
    const candidates = selected.splice(0);
    check(); // Human decisions must fit even without file evidence.
    for (const entry of candidates) {
      selected.push(entry);
      try { check(); } catch (error) {
        selected.pop();
        if (!(error instanceof ExecutionContextError)) throw error;
      }
    }
  }
  check(); // Exact target evidence and human decisions are indivisible, never silently truncated.
  for (const entry of ranked) {
    if (requested.size && !selected.length) break; // No requested excerpt fits; preserve that unresolved scope.
    if (selected.includes(entry) || selected.length >= 6 || entry.score <= 0 && selected.length > 0) continue;
    selected.push(entry);
    try { const manifest = check(); if (selected.length > 1 && manifest.characters > executionContextBudget - 3000) selected.pop(); }
    catch (error) { selected.pop(); if (!(error instanceof ExecutionContextError)) throw error; }
  }
  for (const entry of ranked.filter((entry) => !selected.includes(entry)).sort((a, b) => Number(requested.has(b.id)) - Number(requested.has(a.id)))) {
    const item = { id: entry.id, pathPreview: entry.file?.path.slice(0, 200) ?? "Captured source excerpt", startLine: entry.file?.startLine, endLine: entry.file?.endLine };
    if (JSON.stringify([...evidenceIndex, item]).length > 5000) continue;
    evidenceIndex.push(item);
    try { check(); } catch (error) { evidenceIndex.pop(); if (!(error instanceof ExecutionContextError)) throw error; }
  }
  for (const item of scan.snapshot.omitted.slice(0, 8)) {
    omissions.examples.push({ pathPreview: item.path.slice(0, 200), reason: item.reason.slice(0, 200) });
    try { check(); } catch (error) { omissions.examples.pop(); if (!(error instanceof ExecutionContextError)) throw error; }
  }
  const text = serialize(), context = check();
  const sourceIDs = new Map(selected.map((entry) => [entry.id, entry.source.id]));
  return { text, sourceIDs, availableEvidenceIDs: new Set(evidenceIndex.map((entry) => entry.id)),
    deferredEvidenceIDs: [...requested].filter((id) => !sourceIDs.has(id)), context };
}

/** Validate only the captured source scope, not every binary/cache file in the repository. */
export async function assertAssessmentCaptureCurrent(directory: string, scan: AssessmentCapture, signal: AbortSignal, inspectInventory = false) {
  for (const file of new Map(scan.snapshot.files.map((file) => [file.path, file])).values()) {
    signal.throwIfAborted();
    const path = join(directory, file.path);
    if (directoryKey(await realpath(path)) !== directoryKey(path)) throw new Error("Captured source path changed or became linked. Refresh the assessment.");
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 524288) throw new Error("Captured source changed. Refresh the assessment.");
      const buffer = Buffer.alloc(stat.size + 1), read = await handle.read(buffer, 0, buffer.length, 0);
      if (read.bytesRead !== stat.size || createHash("sha256").update(buffer.subarray(0, stat.size)).digest("hex") !== file.hash) throw new Error("Files changed during assessment. Refresh the source snapshot.");
    } finally { await handle.close(); }
  }
  if (inspectInventory && assessmentCaptureFingerprint(await captureWorkspace(directory, undefined, signal)) !== assessmentCaptureFingerprint(scan))
    throw new Error("Source inventory or capture coverage changed during assessment. Refresh the source snapshot.");
}
