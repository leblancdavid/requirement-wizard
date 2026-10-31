import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DefinitionScopeReviewService } from "../service/definition-scope-review.js";
import { DefinitionMixedReviewService, type DefinitionMixedReviewAdapter } from "../service/definition-mixed-review.js";
import { dimensions } from "../core/definition-dimensions.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedSourceConcerns } from "../core/definition-mixed-assessment.js";

export function mixedPublicationReply(p: Parameters<DefinitionMixedReviewAdapter["review"]>[0], conflict = false) {
  return { format: 1, policy: "definition-mixed-consistency-response-v1", assemblyKey: p.assembly.assemblyKey, contextKey: p.packet.contextKey,
    sourceConcernKeys: definitionMixedSourceConcerns(p.assembly).map((c) => c.concernKey),
    verdicts: p.assembly.findings.map((f) => ({ dimension: f.origin.dimension, originKey: f.origin.originKey, decision: "retain", explanation: "Uncertainty remains", evidenceIDs: [p.project.sources[0]!.id] })),
    conflicts: conflict ? [{ dimensions: ["rules", "data"], explanation: "Retention choices conflict", evidenceIDs: [p.project.sources[0]!.id] }] : [] };
}
/** Real durable witnesses with synthetic adapters only; shared deterministic test setup. */
export async function mixedPublicationFixture(conflict = false) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "mixed-publication-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  let p = store.create("Mixed publication fixture", "Keep original human receipt choices", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Receipt intent", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
    requirements: ["First receipt", "Second receipt", "Third receipt"].map((statement) => ({ statement, rationale: "Human intent", acceptance: [statement], sourceIDs: [p.sources[0]!.id], epicID: "orders" })), assessments: [] });
  p = store.get(p.id); for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  await new DiscoveryService(store, { async analyze(project) { return { summary: project.summary, goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [],
    assessments: [{ epicID: "orders", confidence: "medium", explanation: "Ordinary uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "unknown", explanation: "Original published gap", evidenceIDs: [project.sources[0]!.id] })) }] }; } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
  p = store.get(p.id); const publication = store.definitionPublication(p.id, "orders", p.revision); if (publication.status !== "recorded") assert.fail();
  const scoped = await new DefinitionScopeReviewService(store, { async review(packet) { return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
    checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original scoped uncertainty\n<b>not markup</b>", evidenceIDs: [p.sources[0]!.id] })),
    crossDimensionConcerns: [{ dimensions: ["rules", "data", "permissions"], explanation: "Retention affects recovery <script>literal</script>", evidenceIDs: [p.sources[0]!.id] }] }; } }).review(p.id,
    { request: { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: ["rules", "data"] }, confirmAIUsage: true });
  const source = store.inspectDefinitionScopeProvenance(p.id, { jobID: scoped.job.id }); if (source.status !== "recorded") assert.fail();
  const request = { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p), selections: dimensions.map((dimension) => ["rules", "data"].includes(dimension)
    ? { kind: "scoped" as const, dimension, jobID: scoped.job.id, provenanceKey: source.provenance.provenanceKey }
    : { kind: "publication" as const, dimension, assessmentRevision: p.revision, certificateKey: digest(publication.certificate) }) };
  const completed = await new DefinitionMixedReviewService(store, { async review(prepared) { return mixedPublicationReply(prepared, conflict); } }).review(p.id, { request, confirmAIUsage: true });
  const query = { revision: p.revision, snapshotKey: request.snapshotKey, epicID: "orders", jobID: completed.job.id };
  let closed = false;
  return { directory, path, p, scoped, completed, query, get store() { return store; }, close() { if (!closed) store.close(); closed = true; },
    reopen() { if (!closed) store.close(); closed = true; store = new ProjectStore(path); closed = false; },
    cleanup() { if (!closed) store.close(); closed = true; rmSync(directory, { recursive: true, force: true }); } };
}
