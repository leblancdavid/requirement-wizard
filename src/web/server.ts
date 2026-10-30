import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep, join } from "node:path";
import { defaultDataDirectory } from "../storage/paths.js";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { processingPolicyChangeSchema } from "../core/processing-policy.js";
import { ProjectStore } from "../storage/store.js";
import { readinessProgress } from "../core/readiness-stages.js";
import { submissionProgress, submissionAllowance } from "../core/submission-stages.js";
import { refinementStageProgress } from "../core/refinement-stages.js";
import { activityQuerySchema } from "../storage/activity.js";
import { OperationConflictError, discoveryBlockReason, executionBlockReason } from "../core/operations.js";
import { browseDirectories } from "../storage/workspace.js";
import { previewFolder } from "../storage/folder-preview.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";
import { ProjectWorkflow } from "../service/workflow.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { OpenCodeCatalog, type CatalogSource } from "../runtime/catalog.js";
import { modelSelection, answerSchema, questionHelpRequestSchema, StaleRevisionError, type Job } from "../core/model.js";
import { organizationSchema } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { safeMessage } from "../runtime/contract.js";
import { ConnectionManager, connectionError, type Connections } from "../providers/connections.js";
import { ProviderError } from "../providers/chatgpt.js";
import { CredentialStore } from "../providers/credentials.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { ImplementationService } from "../service/implementation.js";
import { inspectWorkspaceRepository } from "../service/git-delivery.js";
import { executionConfigSchema } from "../core/execution.js";
import type { ExecutionAdapter } from "../runtime/execution.js";
import type { ModelSelection } from "../core/model.js";
import { SnapshotEncoder, parseSnapshotTokens, snapshotHeader } from "./snapshot.js";
import { savedEvidencePolicySchema } from "../core/gap-navigation.js";
import { canContinueGapExploration } from "../core/gap-retrieval.js";
import { resolvedReviewAttempts, reviewAttemptBatchLimit } from "../core/review-attempts.js";
import { definitionSourceQuerySchema } from "../core/definition-source-inspection.js";
import { definitionFindingPreviewRequestSchema } from "../core/definition-finding-origin.js";
import { definitionJointUsageQuerySchema } from "../core/definition-joint-usage.js";
import { definitionCombinationPreviewQuerySchema } from "../core/definition-combination-preview.js";
import { definitionCombinationSaveSchema, definitionCombinationHistorySchema } from "../core/definition-combination-review-view.js";
import { definitionCombinationApplyQuerySchema, definitionCombinationApplySchema } from "../core/definition-combination-apply.js";
import { definitionReviewScopeStartSchema } from "../core/definition-review-scope.js";
import { definitionScopeStatusQuerySchema } from "../core/definition-scope-view.js";
import { DefinitionScopeReviewService } from "../service/definition-scope-review.js";
import { definitionScopeDiscoveryAdapter } from "../service/definition-scope-adapter.js";

const revision = z.number().int().positive();
const text = z.string().min(1).max(12000);

export async function startApp(options: { store: ProjectStore; adapter: DiscoveryAdapter; executionAdapter?: ExecutionAdapter; connections?: Connections; catalog?: CatalogSource; port?: number; staticDir?: string }) {
  const token = randomBytes(32).toString("hex");
  const service = new DiscoveryService(options.store, options.adapter);
  const queue = new DiscoveryQueue(service);
  const scoped = new DefinitionScopeReviewService(options.store, definitionScopeDiscoveryAdapter(options.adapter));
  const workflow = new ProjectWorkflow(options.store, options.adapter);
  const implementation = new ImplementationService(options.store, options.executionAdapter);
  const snapshotEncoder = new SnapshotEncoder();
  // Portable adoption can replace equal-numbered local history. Reuse computed
  // coverage only when the actual projected project payload still matches.
  const revisionSnapshots = new Map<string, { project: ReturnType<ProjectStore["get"]>; coverage: ReturnType<typeof coverage>; fingerprint: string }>();
  function revisionSnapshot(project: ReturnType<ProjectStore["get"]>) {
    const key = `${project.id}:${project.revision}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(project)).digest("hex");
    let cached = revisionSnapshots.get(key);
    if (!cached || cached.fingerprint !== fingerprint) cached = { project, coverage: coverage(project), fingerprint };
    revisionSnapshots.delete(key); revisionSnapshots.set(key, cached);
    if (revisionSnapshots.size > 16) revisionSnapshots.delete(revisionSnapshots.keys().next().value!);
    return { project: cached.project, coverage: cached.coverage };
  }
  const helpWork = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();
  const root = resolve(options.staticDir ?? "dist/web");
  const validateConnection = async (model: ModelSelection) => {
    if (!model.connectionID) return;
    if (!options.connections || model.providerID !== "openai") throw new Error("ChatGPT connection unavailable.");
    try {
      if (!(await options.connections.models(model.connectionID)).some((entry) => entry.id === model.modelID)) throw new ProviderError("Selected model is not available for this ChatGPT account. Refresh models in Settings.");
    } catch (error) { throw new ProviderError(connectionError(error)); }
  };
  let origin = "";
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  const body = async (req: IncomingMessage) => {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("Expected application/json.");
    let length = 0; const chunks: Buffer[] = [];
    for await (const chunk of req) { length += chunk.length; if (length > 128000) throw new Error("Request is too large."); chunks.push(Buffer.from(chunk)); }
    return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
  };
  const server = createServer((req, res) => {
    void (async () => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
      if (closing) { json(res, 503, { error: "Reqwizit is shutting down." }); return; }
      if (req.headers.host !== new URL(origin).host) { json(res, 403, { error: "Invalid local host." }); return; }
      const url = new URL(req.url ?? "/", origin);
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET") { json(res, 405, { error: "Method not allowed." }); return; }
        const path = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
        if (!path.startsWith(root + sep)) { json(res, 403, { error: "Invalid asset path." }); return; }
        try {
          let content = await readFile(path);
          if (extname(path) === ".html") content = Buffer.from(content.toString().replace("__REQWIZIT_TOKEN__", token));
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path)] ?? "application/octet-stream");
          res.end(content);
        } catch { json(res, 404, { error: "UI asset not found. Run npm run build:ui first." }); }
        return;
      }
      if (req.headers["x-reqwizit-token"] !== token || (req.headers.origin && req.headers.origin !== origin)) {
        json(res, 403, { error: "Invalid local app session. Reload this app's page." }); return;
      }
      if (req.method !== "GET" && req.headers.origin !== origin) { json(res, 403, { error: "Same-origin request required." }); return; }
      if (url.pathname.startsWith("/api/connections")) {
        try {
          if (req.method === "GET" && url.pathname === "/api/connections/opencode") {
            if (!options.catalog) throw new ProviderError("OpenCode model discovery is unavailable in this setup.");
            json(res, 200, await options.catalog.get(url.searchParams.get("refresh") === "true")); return;
          }
          if (req.method === "GET" && url.pathname === "/api/connections") {
            json(res, 200, { available: !!options.connections, accounts: options.connections ? await options.connections.accounts() : [] }); return;
          }
          const connections = options.connections;
          if (!connections) throw new Error("Connection service unavailable.");
          if (req.method === "GET" && url.pathname === "/api/connections/login") {
            json(res, 200, connections.loginStatus(z.string().uuid().parse(url.searchParams.get("id")))); return;
          }
          if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
          const raw = await body(req);
          const accountID = z.string().min(1).max(500);
          if (url.pathname === "/api/connections/login") {
            const input = z.object({ accountID: accountID.optional() }).strict().parse(raw);
            json(res, 202, await connections.beginLogin(input.accountID)); return;
          }
          if (url.pathname === "/api/connections/cancel-login") {
            const input = z.object({ id: z.string().uuid() }).strict().parse(raw);
            connections.cancelLogin(input.id); json(res, 200, { cancelled: true }); return;
          }
          if (url.pathname === "/api/connections/models") {
            const input = z.object({ accountID }).strict().parse(raw);
            json(res, 200, { models: await connections.models(input.accountID) }); return;
          }
          if (url.pathname === "/api/connections/test") {
            const input = z.object({ accountID, modelID: z.string().min(1).max(500) }).strict().parse(raw);
            await connections.test(input.accountID, input.modelID); json(res, 200, { verified: true }); return;
          }
          if (url.pathname === "/api/connections/cancel-test") {
            z.object({}).strict().parse(raw); connections.cancelTest(); json(res, 200, { cancelled: true }); return;
          }
          if (url.pathname === "/api/connections/disconnect") {
            const input = z.object({ accountID }).strict().parse(raw);
            await connections.disconnect(input.accountID); json(res, 200, { disconnected: true }); return;
          }
          json(res, 404, { error: "Connection route not found." }); return;
        } catch (error) {
          json(res, 400, { error: url.pathname === "/api/connections/opencode" ? "Could not load OpenCode providers and models. Check that OpenCode is installed and your provider is connected, then refresh models." : error instanceof z.ZodError ? "Invalid connection request fields." : connectionError(error) }); return;
        }
      }
      if (url.pathname === "/api/directories" && req.method === "POST") {
        const input = z.object({ path: z.string().min(1).max(4096).optional() }).strict().parse(await body(req));
        json(res, 200, browseDirectories(input.path)); return;
      }
      if (url.pathname === "/api/projects/open" && req.method === "POST") {
        const input = z.object({ path: z.string().min(1).max(4096), model: modelSelection }).strict().parse(await body(req));
        // Opening a repository never probes providers or executes saved commands.
        json(res, 200, options.store.openWorkspace(input.path, input.model)); return;
      }
      if (url.pathname === "/api/projects") {
        if (req.method === "GET") { json(res, 200, options.store.list()); return; }
        if (req.method === "POST") {
          const input = z.object({ name: text, idea: text, model: modelSelection, entryMode: z.enum(["idea", "existing"]).optional(), previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), workspace: z.object({ path: z.string().min(1).max(4096), create: z.boolean().optional() }).strict().optional() }).strict().parse(await body(req));
          if (input.entryMode === "existing" && (!input.workspace || input.workspace.create)) throw new Error("Choose an existing folder before initialization.");
          const preview = input.entryMode === "existing" ? await previewFolder(input.workspace!.path) : undefined;
          if (preview && preview.fingerprint !== input.previewFingerprint) throw new Error("Folder preview changed. Inspect the selected folder again before creating the project.");
          await validateConnection(input.model);
          const created = options.store.create(input.name, input.idea, input.model, preview ? { mode: "existing", preview, nameEdited: input.name !== preview.name, descriptionEdited: input.idea !== preview.description } : undefined);
          // Project creation is retained even when a folder cannot be connected.
          let workspaceError: string | undefined;
          if (input.workspace) try { options.store.connectWorkspace(created.id, created.revision, input.workspace.path, input.workspace.create); }
          catch (error) { workspaceError = error instanceof Error ? error.message : "Workspace connection failed."; }
          if (preview && !workspaceError) queue.scan(created.id, created.revision);
          json(res, 201, { ...created, ...(workspaceError ? { workspaceError } : {}) }); return;
        }
      }
      if (url.pathname === "/api/folder-preview" && req.method === "POST") {
        const input = z.object({ path: z.string().min(1).max(4096) }).strict().parse(await body(req));
        json(res, 200, await previewFolder(input.path)); return;
      }
      const route = /^\/api\/projects\/([^/]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
      if (!route?.[1]) { json(res, 404, { error: "Route not found." }); return; }
      const id = decodeURIComponent(route[1]);
      const action = route[2];
      // Explicit bounded inspection must not first trigger get's legacy history
      // projection. The common token/host/origin/body guards still apply.
      if (action === "definition-impact") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const input = z.object({ revision, epicID: z.string().min(1).max(500) }).strict().parse(await body(req));
        json(res, 200, options.store.definitionImpact(id, input.revision, input.epicID)); return;
      }
      if (action === "definition-sources" || action === "definition-origins") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const raw = await body(req);
        json(res, 200, action === "definition-sources"
          ? options.store.inspectDefinitionSources(id, definitionSourceQuerySchema.parse(raw))
          : options.store.previewDefinitionFindingOrigins(id, definitionFindingPreviewRequestSchema.parse(raw))); return;
      }
      if (action === "definition-joint-status" || action === "definition-joint-start" || action === "definition-joint-stop") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const raw = await body(req);
        if (action === "definition-joint-status") {
          const input = z.object({ epicID: z.string().min(1).max(500), jobID: z.string().uuid().optional() }).strict().parse(raw);
          json(res, 200, options.store.inspectDefinitionJointReview(id, input.epicID, input.jobID)); return;
        }
        if (action === "definition-joint-stop") {
          const input = z.object({ jobID: z.string().uuid() }).strict().parse(raw);
          queue.stopDefinitionCombination(id, input.jobID); json(res, 200, { stopped: true }); return;
        }
        const input = z.object({ request: definitionFindingPreviewRequestSchema, confirmAIUsage: z.literal(true) }).strict().parse(raw);
        const result = await queue.reviewDefinitionCombination(id, input.request);
        json(res, result.status === "accepted" ? 202 : 200, result); return;
      }
      if (action === "definition-joint-usage") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        json(res, 200, options.store.definitionJointUsage(id, definitionJointUsageQuerySchema.parse(await body(req)))); return;
      }
      if (action === "definition-scope-start" || action === "definition-scope-status" || action === "definition-scope-stop") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const raw = await body(req);
        if (action === "definition-scope-status") {
          const view = options.store.inspectDefinitionScopeReview(id, definitionScopeStatusQuerySchema.parse(raw));
          json(res, 200, view.status === "recorded" ? { ...view, owned: queue.ownsDefinitionScope(id, view.jobID) } : view); return;
        }
        if (action === "definition-scope-stop") {
          const input = z.object({ jobID: z.string().uuid() }).strict().parse(raw);
          queue.stopDefinitionScope(id, input.jobID); json(res, 200, { stopped: true }); return;
        }
        const input = definitionReviewScopeStartSchema.parse(raw);
        if (implementation.isActive(id) || workflow.active(id)) throw new OperationConflictError("Stop active work before starting a scoped review.");
        json(res, 202, await queue.reviewDefinitionScope(id, input, scoped)); return;
      }
      if (action === "definition-combination-preview") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        json(res, 200, options.store.previewDefinitionCombination(id, definitionCombinationPreviewQuerySchema.parse(await body(req)))); return;
      }
      if (action === "definition-combination-save" || action === "definition-combination-history" || action === "definition-combination-read") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const raw = await body(req);
        if (action === "definition-combination-save") {
          const input = definitionCombinationSaveSchema.parse(raw);
          if (queue.isActive(id) || implementation.isActive(id) || workflow.active(id)) throw new OperationConflictError("Stop active work before saving a reviewed combination. No review was saved.");
          json(res, 200, options.store.saveDefinitionCombinationReview(id, input)); return;
        }
        if (action === "definition-combination-history") { json(res, 200, options.store.definitionCombinationHistory(id, definitionCombinationHistorySchema.parse(raw))); return; }
        const input = z.object({ reviewID: z.string().uuid() }).strict().parse(raw);
        json(res, 200, options.store.readDefinitionCombinationReview(id, input.reviewID)); return;
      }
      if (action === "definition-combination-apply-preview" || action === "definition-combination-apply") {
        if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
        const raw = await body(req);
        if (action === "definition-combination-apply-preview") { json(res, 200, options.store.previewDefinitionCombinationApply(id, definitionCombinationApplyQuerySchema.parse(raw))); return; }
        const input = definitionCombinationApplySchema.parse(raw);
        if (queue.isActive(id) || implementation.isActive(id) || workflow.active(id)) throw new OperationConflictError("Stop active work before applying reviewed definition findings.");
        json(res, 200, options.store.applyDefinitionCombination(id, input)); return;
      }
      const project = options.store.get(id);
      if (req.method === "GET" && !action) {
        const rawTokens = req.headers["x-reqwizit-snapshot"];
        if (rawTokens !== undefined && typeof rawTokens !== "string") throw new Error("Invalid snapshot tokens.");
        const known = rawTokens === undefined ? undefined : parseSnapshotTokens(rawTokens);
        const current = revisionSnapshot(project);
        const recent = options.store.workspaceJobs(id);
        const jobs = recent.jobs.map(({ result: _, researchEvidence: __, scan, scanWork, retrievalWork, readinessWork, submissionWork, refinementWork, ...job }) => ({ ...job,
          ...(refinementWork ? { refinementStageProgress: refinementStageProgress(refinementWork) } : {}),
          ...(submissionWork ? { submissionProgress: submissionProgress(submissionWork), submissionAllowance: submissionAllowance(submissionWork) } : {}),
          ...(readinessWork ? { readinessProgress: readinessProgress(readinessWork) } : {}),
          ...(job.context?.readinessQuestions && _ ? { result: _ } : {}),
          gapContinuationAvailable: canContinueGapExploration({ ...job, retrievalWork }),
          ...(retrievalWork ? { retrievalWork: { format: retrievalWork.format, research: retrievalWork.research, stages: retrievalWork.stages, attempts: retrievalWork.attempts, originJobID: retrievalWork.originJobID, reuse: retrievalWork.reuse, continuation: retrievalWork.continuation, ...(retrievalWork.stagedRun ? { stagedRun: retrievalWork.stagedRun } : {}), ...(retrievalWork.requestedPolicy ? { requestedPolicy: retrievalWork.requestedPolicy } : {}) } } : {}),
          ...(scan ? { scan: { ...scan, sources: [] } } : {}),
          ...(scan && scanWork ? { scanProgress: { completed: scanWork.batches.filter((batch) => batch.output).length, total: scanWork.batches.length, capturedAt: scan.snapshot.capturedAt,
            resumable: ["failed", "cancelled", "interrupted"].includes(job.status) && job.expectedRevision === project.revision && scanWork.bindingID === options.store.workspace(id)?.bindingID } } : {}) }));
        const lastRound = jobs.filter((item) => item.status === "completed" && item.kind !== "definition-joint-review" && item.kind !== "definition-scope-review").at(-1);
        const previousCoverage = lastRound ? revisionSnapshot(options.store.get(id, lastRound.expectedRevision)).coverage.percent : null;
        const helpJobs = recent.helpJobs.map(({ result: _, researchEvidence: __, ...job }) => job);
        const snapshot = { ...current, workspace: options.store.syncWorkspace(id), previousCoverage, jobs, helpJobs, active: queue.isActive(id), progress: queue.progress(id), refinementProgress: queue.refinementProgress(id), processingPolicy: options.store.processingPolicy(id), maintenance: queue.maintenanceView(id), workflow: workflow.view(id), submissions: options.store.submissions(id), queuePaused: options.store.queuePaused(id), execution: implementation.snapshot(id), implementationActive: implementation.isActive(id), implementationOperation: implementation.operation(id) };
        if (known) {
          const encoded = snapshotEncoder.encode(snapshot, known, ["project", "coverage"]);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", [snapshotHeader]: JSON.stringify(encoded.tokens) });
          res.end(encoded.body);
        } else json(res, 200, snapshot);
        return;
      }
      if (req.method === "GET" && action === "history") { json(res, 200, options.store.history(id)); return; }
      if (req.method === "GET" && action === "definition-history") {
        json(res, 200, options.store.definitionReviewHistory(id, Object.fromEntries(url.searchParams))); return;
      }
      if (req.method === "GET" && action === "assessment-recovery") {
        const input = z.object({ epicID: z.string().min(1).max(500), beforeRevision: z.coerce.number().int().positive().optional() }).strict().parse(Object.fromEntries(url.searchParams));
        json(res, 200, options.store.previewAssessmentRecovery(id, input.epicID, input.beforeRevision)); return;
      }
      if (req.method === "GET" && action === "log-history") {
        json(res, 200, options.store.logHistory(id, Object.fromEntries(url.searchParams))); return;
      }
      if (req.method === "GET" && action === "activity") {
        json(res, 200, options.store.activity(id, activityQuerySchema.parse(Object.fromEntries(url.searchParams)))); return;
      }
      if (req.method === "GET" && action === "activity-head") { json(res, 200, options.store.activityHead(id)); return; }
      if (req.method === "GET" && action === "execution-repository") {
        const binding = options.store.workspace(id);
        const detected = await inspectWorkspaceRepository(binding?.path);
        if (options.store.workspace(id)?.bindingID !== binding?.bindingID) throw new Error("Workspace changed during repository detection. Detect again.");
        json(res, 200, detected); return;
      }
      if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
      const raw = await body(req);
      if (action === "restore-assessment") {
        const input = z.object({ revision, epicID: z.string().min(1).max(500), sourceRevision: z.number().int().positive(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(raw);
        json(res, 200, options.store.restoreAssessmentHistory(id, input.revision, input)); return;
      }
      if (action === "discovery-diagnostics") {
        const input = z.object({ jobIDs: z.array(z.string().uuid()).min(1).max(20) }).strict().parse(raw);
        json(res, 200, options.store.discoveryDiagnostics(id, input.jobIDs)); return;
      }
      if (action === "execution-config") {
        const input = z.object({ revision, version: z.number().int().nonnegative(), config: executionConfigSchema }).strict().parse(raw);
        json(res, 200, implementation.configure(id, input.revision, input.config, input.version)); return;
      }
      if (action === "execution-start") {
        const input = z.object({ revision, operation: z.enum(["plan", "check", "assess", "verify-main", "continue"]), requirementID: z.string().min(1).optional(), epicID: z.string().min(1).optional(), force: z.boolean().optional(), preview: z.boolean().optional() }).strict().parse(raw);
        if (queue.isActive(id)) throw new OperationConflictError(discoveryBlockReason);
        if (input.requirementID && input.epicID) throw new Error("Choose a requirement or an epic scope.");
        if (input.requirementID && !project.requirements.some((r) => r.id === input.requirementID && r.status === "accepted")) throw new Error("Choose an accepted requirement.");
        if (input.epicID && !project.epics.some((e) => e.id === input.epicID && !e.archived)) throw new Error("Choose an active epic.");
        implementation.start(id, input.revision, input.operation, { requirementID: input.requirementID, epicID: input.epicID }, { force: input.force, preview: input.preview });
        json(res, 202, { started: true }); return;
      }
      if (action === "execution-mark-assessment") {
        const input = z.object({ revision, version: z.number().int().nonnegative(), requirementID: z.string().min(1), reason: z.string().trim().max(1000).default("") }).strict().parse(raw);
        json(res, 200, implementation.markForAssessment(id, input.revision, input.requirementID, input.reason, input.version)); return;
      }
      if (action === "execution-plan-review") {
        const input = z.object({ revision, version: z.number().int().nonnegative(), planID: z.string().min(1), decision: z.enum(["approve", "dismiss"]), acceptedEdges: z.array(z.string()).max(25000), resolution: z.string().max(6000), order: z.array(z.string()).max(500).optional() }).strict().parse(raw);
        if (queue.isActive(id)) throw new OperationConflictError(discoveryBlockReason);
        json(res, 200, implementation.reviewPlan(id, input.revision, input.version, input.planID, input.decision, input.acceptedEdges, input.resolution, input.order)); return;
      }
      if (action === "execution-stop") { z.object({}).strict().parse(raw); implementation.stop(id); json(res, 200, { stopping: true }); return; }
      if (action === "execution-archive") { const input = z.object({ version: z.number().int().nonnegative() }).strict().parse(raw); json(res, 200, implementation.archive(id, input.version)); return; }
      if (action === "retire-questions") {
        const input = z.object({ revision, questionIDs: z.array(z.string().min(1)).min(1).max(100), reason: z.string().trim().min(1).max(2000), regenerate: z.boolean().optional(), research: z.boolean().optional() }).strict().parse(raw);
        if (input.regenerate) { service.assertCanDiscover(id); if (!project.scans.length) throw new Error("Complete a folder scan before generating evidence-based replacements."); }
        const updated = options.store.retireQuestions(id, input.revision, input.questionIDs, input.reason);
        if (input.regenerate) queue.resume(id, { research: input.research ?? false });
        json(res, 200, updated); return;
      }
      if (action === "workspace") {
        const input = z.discriminatedUnion("operation", [
          z.object({ operation: z.literal("connect"), revision, path: z.string().min(1).max(4096), create: z.boolean().optional() }).strict(),
          z.object({ operation: z.literal("disconnect"), revision }).strict(),
          z.object({ operation: z.literal("sync") }).strict(),
        ]).parse(raw);
        if (input.operation === "connect") json(res, 200, options.store.connectWorkspace(id, input.revision, input.path, input.create));
        else if (input.operation === "disconnect") { options.store.disconnectWorkspace(id, input.revision); json(res, 200, null); }
        else json(res, 200, options.store.syncWorkspace(id));
        return;
      }
      if (action === "implementation") {
        const input = z.object({ revision, requirementID: z.string().min(1), status: z.enum(["not-started", "in-progress", "blocked", "implemented", "verified"]), notes: z.string().max(12000), evidence: z.string().max(12000) }).strict().parse(raw);
        json(res, 200, options.store.setImplementation(id, input.revision, input.requirementID, { status: input.status, notes: input.notes, evidence: input.evidence })); return;
      }
      if (action === "question-help") {
        const input = z.object({ revision, request: questionHelpRequestSchema }).strict().parse(raw);
        const controller = new AbortController();
        let job: Job | undefined;
        const promise = service.clarify(id, input.revision, input.request, { signal: controller.signal, onJob: (created) => { job = created; } });
        // beginJob and onJob run synchronously before the first inference await.
        if (!job) { await promise; throw new Error("Question help could not start."); }
        const jobID = job.id;
        helpWork.set(jobID, { controller, promise });
        void promise.finally(() => helpWork.delete(jobID)).catch(() => {});
        json(res, 202, { jobID }); return;
      }
      if (action === "cancel-help") {
        const input = z.object({ jobID: z.string() }).strict().parse(raw);
        const job = options.store.getJob(input.jobID);
        if (job.projectID !== id || !job.helpRequest) throw new Error("Question-help job not found.");
        const work = helpWork.get(job.id);
        work?.controller.abort();
        json(res, 200, { cancelled: !!work }); return;
      }
      if (action === "continue-exploration") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, jobID: z.string().uuid() }).strict().parse(raw);
        queue.continueExploration(id, input.revision, input.jobID);
        json(res, 202, { started: true }); return;
      }
      if (action === "resume-discovery") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, focusEpicID: z.string().optional(), research: z.boolean().optional(), questionTarget: z.number().int().min(1).max(50).optional() }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        queue.resumeBrowser(id, input);
        json(res, 202, { started: true }); return;
      }
      if (action === "process-responses") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        if (queue.isActive(id)) throw new OperationConflictError("Wait for the current task before processing saved responses.");
        const input = z.object({ revision, submissionIDs: z.array(z.string().uuid()).min(1).max(128)
          .refine((ids) => new Set(ids).size === ids.length, "Choose each saved response once."), research: z.boolean().optional(),
          additionalRequests: z.literal(4).optional(), confirmAdditionalRequests: z.literal(true).optional(), resumeJobID: z.string().uuid().optional() }).strict()
          .refine((value) => value.additionalRequests ? value.confirmAdditionalRequests && value.resumeJobID && value.submissionIDs.length === 1 && value.research !== true
            : !value.confirmAdditionalRequests && !value.resumeJobID, "Additional requests require explicit confirmation, one saved response and its exact job; research must be disabled.").parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        const saved = options.store.submissions(id);
        const resolved = resolvedReviewAttempts(project, saved);
        const selected = input.submissionIDs.map((selectedID) => saved.find((s) => s.id === selectedID));
        if (selected.some((s) => !s)) throw new Error("Choose saved responses from this project only.");
        if (selected.some((s) => s!.archivedAt || s!.conflict || resolved.has(s!.id) || !["queued", "saved", "needs-attention"].includes(s!.status)))
          throw new OperationConflictError("Selected responses changed or need an explicit human decision. Refresh before processing.");
        if (input.additionalRequests) options.store.extendSubmissionAllowance(id, input.revision, input.submissionIDs[0]!, input.resumeJobID!);
        queue.resume(id, { processOnly: true, submissionIDs: input.submissionIDs, research: input.research ?? false });
        json(res, 202, { started: true }); return;
      }
      if (action === "refresh-definition") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, focusEpicID: z.string().min(1).max(200).optional(),
          additionalRequests: z.array(z.object({ epicID: z.string().min(1).max(200), jobID: z.string().uuid() }).strict()).min(1).max(64).optional(),
          confirmAdditionalRequests: z.literal(true).optional(),
        }).strict().refine((value) => !!value.additionalRequests === !!value.confirmAdditionalRequests, "Additional requests require explicit confirmation.").parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        queue.refreshDefinition(id, input.revision, input.focusEpicID, undefined, input.additionalRequests);
        json(res, 202, { started: true }); return;
      }
      if (action === "clarify-definition") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, epicID: z.string().min(1).max(200), confirmAIUsage: z.literal(true), resumeJobID: z.string().uuid().optional() }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        json(res, 202, queue.clarifyDefinition(id, input.revision, input.epicID, input.resumeJobID)); return;
      }
      if (action === "recover-definition") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, focusEpicID: z.string().min(1).max(200), jobID: z.string().uuid(), confirmAdditionalRequest: z.literal(true) }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        queue.refreshDefinition(id, input.revision, input.focusEpicID, input.jobID);
        json(res, 202, { started: true }); return;
      }
      if (action === "maintenance") {
        const input = z.object({ revision, version: z.number().int().nonnegative(), action: z.enum(["enable", "disable", "pause", "resume"]) }).strict().parse(raw);
        if (["enable", "resume"].includes(input.action) && project.revision !== input.revision) throw new StaleRevisionError();
        json(res, 200, queue.configureMaintenance(id, input.version, input.action)); return;
      }
      if (action === "processing-policy") {
        const input = processingPolicyChangeSchema.extend({ revision }).strict().parse(raw);
        if (queue.isActive(id) || implementation.isActive(id) || workflow.active(id)) throw new OperationConflictError("Stop or finish active work before changing processing mode. No permission was changed.");
        const { revision: expectedRevision, ...change } = input;
        json(res, 200, options.store.configureProcessingPolicy(id, expectedRevision, change)); return;
      }
      if (action === "workflow") {
        const input = z.object({ revision, version: z.number().int().nonnegative(), action: z.enum(["continue", "pause", "disable"]) }).strict().parse(raw);
        json(res, 200, workflow.configure(id, input.revision, input.version, input.action)); return;
      }
      if (action === "analyze") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, focusEpicID: z.string().optional(), research: z.boolean().optional(), refinementOnly: z.boolean().optional(), continueRefinementJobID: z.string().uuid().optional(), savedEvidencePolicy: savedEvidencePolicySchema.optional(), gapMode: z.literal("epic").optional(), questionTarget: z.number().int().min(1).max(50).optional() }).strict().parse(raw);
        if (input.savedEvidencePolicy === "prefix-aux-v1" && (input.refinementOnly || !project.requirements.length && !project.questions.length)) throw new Error("The saved-evidence pilot is only available for manual next-gap exploration after initial interpretation.");
        if (project.revision !== input.revision) throw new StaleRevisionError();
        if (queue.isActive(id)) {
          json(res, 409, { error: "This project already has an active discovery job." }); return;
        }
        queue.resume(id, input);
        json(res, 202, { started: true }); return;
      }
      if (action === "scan") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, resumeJobID: z.string().uuid().optional() }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        if (!options.store.workspace(id)) throw new Error("Connect a local workspace before initializing.");
        if (input.resumeJobID) options.store.assertResumableScan(id, input.revision, input.resumeJobID);
        queue.scan(id, input.revision, input.resumeJobID);
        json(res, 202, { started: true }); return;
      }
      if (action === "cancel") { z.object({}).strict().parse(raw); if (workflow.active(id)) workflow.stop(id); else queue.stop(id); json(res, 200, { cancelled: queue.isActive(id) }); return; }
      if (action === "submit") { json(res, 202, queue.submit(id, raw)); return; }
      if (action === "archive-review-attempt") {
        const input = z.object({ revision, submissionID: z.string().min(1).max(200) }).strict().parse(raw);
        json(res, 200, options.store.archiveReviewAttempt(id, input.revision, input.submissionID)); return;
      }
      if (action === "dismiss-review-attempts") {
        const input = z.object({ revision, requirementID: z.string().min(1).max(200), submissionIDs: z.array(z.string().min(1).max(200)).min(1).max(reviewAttemptBatchLimit) }).strict().parse(raw);
        json(res, 200, options.store.dismissReviewAttempts(id, input.revision, input.requirementID, input.submissionIDs)); return;
      }
      if (action === "restore-review-attempts") {
        const input = z.object({ revision, requirementID: z.string().min(1).max(200), attempts: z.array(z.object({ submissionID: z.string().min(1).max(200), archivedAt: z.string().datetime() }).strict()).min(1).max(reviewAttemptBatchLimit) }).strict().parse(raw);
        json(res, 200, options.store.restoreReviewAttempts(id, input.revision, input.requirementID, input.attempts)); return;
      }
      if (action === "answer") {
        const input = z.object({ revision, questionID: z.string(), answer: answerSchema }).strict().parse(raw);
        json(res, 200, options.store.answer(id, input.revision, input.questionID, input.answer)); return;
      }
      if (action === "note") {
        const input = z.object({ revision, text, epicID: z.string().optional() }).strict().parse(raw);
        json(res, 200, options.store.note(id, input.revision, input.text, input.epicID)); return;
      }
      if (action === "review") {
        const input = z.object({ revision, requirementID: z.string(), action: z.enum(["accepted", "rejected"]), note: z.string().max(12000).default("") }).strict().parse(raw);
        json(res, 200, options.store.review(id, input.revision, input.requirementID, input.action, input.note)); return;
      }
      if (action === "refinement-review") {
        const input = z.object({ revision, proposalID: z.string(), accept: z.boolean() }).strict().parse(raw);
        json(res, 200, options.store.reviewRefinement(id, input.revision, input.proposalID, input.accept)); return;
      }
      if (action === "remove-duplicate") {
        const input = z.object({ revision, removeID: z.string(), keepID: z.string(), note: z.string().max(12000).default("") }).strict().parse(raw);
        json(res, 200, options.store.removeDuplicate(id, input.revision, input.removeID, input.keepID, input.note)); return;
      }
      if (action === "refresh-refinement") {
        if (implementation.isActive(id)) throw new OperationConflictError(executionBlockReason);
        const input = z.object({ revision, proposalID: z.string() }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        queue.resume(id, { refinementOnly: true, refreshProposalID: input.proposalID });
        json(res, 202, { started: true }); return;
      }
      if (action === "model") {
        const input = z.object({ revision, model: modelSelection }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        await validateConnection(input.model);
        json(res, 200, options.store.setModel(id, input.revision, input.model)); return;
      }
      if (action === "epic") {
        const input = z.object({ revision, epicID: z.string().optional(), title: text, purpose: text }).strict().parse(raw);
        const epicID = input.epicID ?? randomUUID();
        const existing = project.epics.find((item) => item.id === epicID);
        json(res, 200, options.store.organize(id, input.revision, [{ type: "upsert", epicID, title: input.title, purpose: input.purpose, dependencies: existing?.dependencies ?? [] }])); return;
      }
      if (action === "organize") {
        const input = z.object({ revision, operations: z.array(organizationSchema).max(40) }).strict().parse(raw);
        json(res, 200, options.store.organize(id, input.revision, input.operations)); return;
      }
      if (action === "organization-review") {
        const input = z.object({ revision, reviewID: z.string(), accept: z.boolean() }).strict().parse(raw);
        json(res, 200, options.store.reviewOrganization(id, input.revision, input.reviewID, input.accept)); return;
      }
      if (action === "undo-organization") {
        const input = z.object({ revision, targetRevision: revision }).strict().parse(raw);
        json(res, 200, options.store.restoreOrganization(id, input.revision, input.targetRevision)); return;
      }
      json(res, 404, { error: "Route not found." });
    })().catch((error: unknown) => {
      const status = error instanceof StaleRevisionError || error instanceof OperationConflictError ? 409 : 400;
      json(res, status, { error: error instanceof z.ZodError ? "Invalid request fields." : safeMessage(error instanceof Error ? error.message : error) });
    });
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(options.port ?? 4317, "127.0.0.1", accept); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local app did not bind a TCP port.");
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, token, close: () => {
    if (closePromise) return closePromise;
    closing = true;
    for (const work of helpWork.values()) work.controller.abort();
    closePromise = (async () => {
      const cleanup = await Promise.allSettled([
        ...[...helpWork.values()].map((work) => work.promise),
         implementation.close(), workflow.close(), queue.close(), options.connections?.close(), options.catalog?.close(),
      ]);
      server.closeAllConnections();
      await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
      // Help failures are already persisted by the service; teardown failures are actionable.
      for (const result of cleanup.slice(-5)) if (result.status === "rejected") throw result.reason;
    })();
    return closePromise;
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { "data-dir": { type: "string" }, port: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) console.log("npm run app -- --data-dir .reqwizit-state --port 4317\nOpen the printed loopback URL in your browser. Defaults to the same store as the CLI.");
  else {
    const directory = resolve(values["data-dir"] ?? defaultDataDirectory());
    const port = Number(values.port ?? "4317");
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port.");
    const store = new ProjectStore(join(directory, "projects.sqlite"));
    store.recoverExpiredJobs();
    try {
      const connections = new ConnectionManager(new CredentialStore(join(directory, "providers")));
      const app = await startApp({ store, connections, catalog: new OpenCodeCatalog(join(directory, "runtime")), adapter: new ConnectedDiscovery(connections, new OpenCodeDiscovery(join(directory, "runtime"))), port });
      console.log(`\nReqwizit is ready: ${app.origin}\nOpen this address in your browser. Existing CLI projects are available. Ctrl+C stops the app.\n`);
      let closing = false;
      const close = () => { if (closing) return; closing = true; void app.close().finally(() => store.close()); };
      process.once("SIGINT", close); process.once("SIGTERM", close);
    } catch (error) { store.close(); throw error; }
  }
}
