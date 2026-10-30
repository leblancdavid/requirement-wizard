import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { projectSchema, type Project, type Job } from "../core/model.js";
import type { ContextPack } from "../core/context.js";
import { definitionPhase, completedDefinitionAssessment } from "../core/definition-stages.js";
import { definitionContext, validateDefinitionAssessment } from "../core/definition-assessment.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { prepareDefinitionDependencies } from "../core/definition-dependencies.js";
import { definitionDependencyLimits } from "../core/definition-dependencies.js";
import { definitionPublicationSchema, definitionPublicationKey as key, definitionContextKey, definitionResponseKey,
  definitionRequestWitnessSchema, definitionPublicationContext, definitionPublicationLimits as limits, type DefinitionPublicationContext, type DefinitionPublication } from "../core/definition-publication.js";

const fits = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8") <= limits.payloadBytes;
const includedKey = (ids: string[]) => key([...ids].sort());
function sourceSnapshot(db: Database.Database, projectID: string, revision: number) {
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM revisions WHERE project_id = ? AND revision = ?")
    .get(definitionDependencyLimits.snapshotBytes, projectID, revision) as { payload: string | null } | undefined;
  if (!row?.payload) return undefined;
  try { const raw = JSON.parse(row.payload), p = projectSchema.parse(raw);
    return p.id === projectID && p.revision === revision && key(raw) === key(p) ? p : undefined;
  } catch { return undefined; }
}

/** A private service dispatch boundary, never an HTTP/model-provided attestation.
 * Optional evidence: inability to witness does not invalidate otherwise valid work. */
export function beginDefinitionRequest(db: Database.Database, job: Job, input: Project, context: ContextPack) {
  const task = context.manifest.definitionAssessment;
  if (!task || job.helpRequest || job.kind || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()
    || job.projectID !== input.id || job.expectedRevision !== input.revision || context.manifest.revision !== input.revision) return undefined;
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > definitionDependencyLimits.snapshotBytes) return undefined;
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ? AND revision = ?")
    .get(definitionDependencyLimits.snapshotBytes, input.id, input.revision) as { payload: string | null } | undefined;
  if (!row?.payload) return undefined;
  const raw = JSON.parse(row.payload), stored = projectSchema.parse(raw);
  if (key(raw) !== key(stored) || key(stored) !== key(input)) return undefined;
  const phase = job.definitionWork ? definitionPhase(job.definitionWork) : "single";
  if (phase === "complete") return undefined;
  const witness = definitionRequestWitnessSchema.parse({ format: 1, policy: "definition-request-witness-v1", id: randomUUID(), projectID: input.id,
    jobID: job.id, epicID: task.epicID, inputRevision: input.revision, inputSnapshotKey: key(input), phase,
    contextKey: definitionContextKey(context.data), contextManifestKey: key(context.manifest), includedKey: includedKey(context.manifest.includedIDs), reservedAt: new Date().toISOString() });
  db.prepare("INSERT INTO definition_request_witnesses VALUES (?, ?, ?, ?)").run(input.id, job.id, witness.id, JSON.stringify(witness));
  return witness.id;
}
export function finishDefinitionRequest(db: Database.Database, job: Job, requestID: string, raw: unknown) {
  if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) return;
  const responseKey = definitionResponseKey(raw); if (!responseKey) return;
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_request_witnesses WHERE project_id = ? AND job_id = ? AND request_id = ?")
    .get(limits.payloadBytes, job.projectID, job.id, requestID) as { payload: string | null } | undefined;
  if (!row?.payload) return;
  const witness = definitionRequestWitnessSchema.parse(JSON.parse(row.payload));
  if (witness.responseKey) {
    if (witness.responseKey !== responseKey) throw new Error("Definition response witness is immutable. Original evidence retained.");
    return;
  }
  witness.responseKey = responseKey; witness.respondedAt = new Date().toISOString();
  db.prepare("UPDATE definition_request_witnesses SET payload = ? WHERE request_id = ?").run(JSON.stringify(witness), requestID);
}

/** Called only after existing complete-area validation, in the SAME publication
 * transaction. No retroactive issuance, inference, grants or freshness changes. */
function buildPublication(db: Database.Database, job: Job, input: Project, published: Project, contexts: DefinitionPublicationContext[], publishedAt: string) {
  if (!job.context?.definitionAssessment || !contexts.length || contexts.length > limits.contexts) return;
  const proposal = job.result?.assessments?.[0]; if (!proposal || job.result!.assessments!.length !== 1) return;
  const citations = proposal.checks.flatMap((c) => c.evidenceIDs);
  const assessment = { ...proposal, atRevision: published.revision,
    answerVersions: Object.fromEntries(citations.flatMap((id) => { const q = input.questions.find((q) => q.id === id); return q ? [[id, q.sourceID ?? null]] : []; })),
    inputBasis: { format: 1, key: definitionInputKey(input, proposal.epicID, citations) },
    ...(job.definitionWork ? { stagedReview: { format: 1, policy: "exact-batches-v1", batches: job.definitionWork.batches.length } } : {}) };
  if (key(published.assessments) !== key([...input.assessments.filter((a) => a.epicID !== proposal.epicID), assessment])) return;
  const built = prepareDefinitionDependencies(published, job.context.definitionAssessment.epicID); if (built.status !== "recorded") return;
  const manifest = built.manifest, inputKey = key(input), records = manifest.records.map((r) => r.id);
  // Only records actually supplied under the validated request policy qualify.
  // Broader prototype guards may include records absent from a legitimate review;
  // that review remains valid, simply without a coverage certificate.
  for (const phase of job.definitionWork ? ["collect", "verify"] : ["single"]) {
    const covered = new Set(contexts.filter((c) => c.phase === phase).flatMap((c) => c.includedIDs));
    if (records.some((id) => !covered.has(id))) return;
  }
  const verified: DefinitionPublication["coverage"]["contexts"] = [];
  for (const c of contexts) {
    const row = db.prepare(`SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_request_witnesses WHERE project_id = ? AND job_id = ?
      AND json_extract(payload, '$.contextKey') = ? AND json_extract(payload, '$.responseKey') = ?
      AND json_extract(payload, '$.inputSnapshotKey') = ? AND json_extract(payload, '$.phase') = ?
      AND json_extract(payload, '$.includedKey') = ? ORDER BY rowid LIMIT 1`)
      .get(limits.payloadBytes, input.id, c.jobID, c.contextKey, c.responseKey, inputKey, c.phase, includedKey(c.includedIDs)) as { payload: string | null } | undefined;
    if (!row?.payload) return;
    const w = definitionRequestWitnessSchema.parse(JSON.parse(row.payload));
    if (w.projectID !== input.id || w.jobID !== c.jobID || w.epicID !== manifest.epicID || w.inputRevision !== input.revision) return;
    verified.push({ requestID: w.id, jobID: w.jobID, phase: w.phase, contextKey: w.contextKey, contextManifestKey: w.contextManifestKey,
      responseKey: w.responseKey!, includedKey: w.includedKey });
  }
  const parsed = definitionPublicationSchema.safeParse({ format: 1, policy: "definition-publication-v1", authority: "publication-evidence-only",
    projectID: input.id, jobID: job.id, epicID: manifest.epicID, inputRevision: input.revision, assessmentRevision: published.revision,
    inputSnapshotKey: inputKey, publishedSnapshotKey: key(published), manifestKey: key(manifest), publishedAt, manifest,
    coverage: { policy: "definition-publication-coverage-v1", method: job.definitionWork ? "exact-batches-v1" : "single-context", records: records.length,
      contexts: verified, ...(job.definitionWork ? { ledgerKey: key(job.definitionWork) } : {}) } });
  if (!parsed.success || !fits(parsed.data)) return;
  return parsed.data;
}
export function saveDefinitionPublication(db: Database.Database, job: Job, input: Project, published: Project, contexts: DefinitionPublicationContext[]) {
  if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) return;
  const original = sourceSnapshot(db, input.id, input.revision), saved = sourceSnapshot(db, published.id, published.revision);
  if (!original || !saved || key(original) !== key(input) || key(saved) !== key(published)) return;
  const certificate = buildPublication(db, job, input, published, contexts, new Date().toISOString()); if (!certificate) return;
  if ((job.leaseUntil ?? 0) <= Date.now()) return;
  db.prepare("INSERT INTO definition_publications VALUES (?, ?, ?, ?, ?)").run(input.id, certificate.epicID, published.revision, job.id, JSON.stringify(certificate));
}

export function readDefinitionPublication(db: Database.Database, projectID: string, epicID: string, assessmentRevision: number) {
  const row = db.prepare(`SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload
    FROM definition_publications WHERE project_id = ? AND epic_id = ? AND assessment_revision = ?`)
    .get(limits.payloadBytes, projectID, epicID, assessmentRevision) as { payload: string | null } | undefined;
  if (!row) return { status: "unavailable" as const, reason: "not-recorded" as const };
  if (!row.payload) return { status: "unavailable" as const, reason: "read-limit" as const };
  let raw: unknown;
  try { raw = JSON.parse(row.payload); } catch { return { status: "unavailable" as const, reason: "invalid-certificate" as const }; }
  const parsed = definitionPublicationSchema.safeParse(raw);
  if (!parsed.success || parsed.data.projectID !== projectID || parsed.data.epicID !== epicID || parsed.data.assessmentRevision !== assessmentRevision)
    return { status: "unavailable" as const, reason: "invalid-certificate" as const };
  try {
    const c = parsed.data, input = sourceSnapshot(db, projectID, c.inputRevision), published = sourceSnapshot(db, projectID, assessmentRevision);
    const jobRow = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM jobs WHERE id = ? AND project_id = ?")
      .get(definitionDependencyLimits.snapshotBytes, c.jobID, projectID) as { payload: string | null } | undefined;
    if (!input || !published || !jobRow?.payload) throw new Error("Missing bounded publication source");
    const job = JSON.parse(jobRow.payload) as Job;
    if (job.id !== c.jobID || job.projectID !== projectID || job.status !== "completed" || job.expectedRevision !== input.revision
      || job.context?.definitionAssessment?.epicID !== epicID || !job.result || key(job.model) !== key(input.model)) throw new Error("Changed publication source");
    const unchanged = (p: Project) => ({ ...p, revision: undefined, assessments: undefined, roundChanges: undefined });
    if (key(unchanged(input)) !== key(unchanged(published))) throw new Error("Definition publication changed specification inputs");
    const contexts: DefinitionPublicationContext[] = []; let available = true;
    if (job.definitionWork) {
      const verified = completedDefinitionAssessment(input, job.definitionWork, (context, receipt, phase) => {
        const fact = definitionPublicationContext(context, receipt.response, receipt.jobID, phase); if (fact) contexts.push(fact); else available = false;
      });
      if (key(verified) !== key(job.result)) throw new Error("Changed staged publication result");
    } else {
      validateDefinitionAssessment(input, job.context!, job.result);
      const fact = definitionPublicationContext(definitionContext(input, epicID), job.result, job.id, "single");
      if (fact) contexts.push(fact); else available = false;
    }
    const rebuilt = available ? buildPublication(db, job, input, published, contexts, c.publishedAt) : undefined;
    if (!rebuilt || key(rebuilt) !== key(c)) throw new Error("Publication sources do not reproduce the certificate");
    return { status: "recorded" as const, certificate: c };
  } catch { return { status: "unavailable" as const, reason: "unproved-source" as const }; }
}
