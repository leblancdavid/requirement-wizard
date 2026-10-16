import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep, join } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { modelSelection, answerSchema, questionHelpRequestSchema, StaleRevisionError, type Job } from "../core/model.js";
import { organizationSchema } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { safeMessage } from "../runtime/contract.js";
import { ConnectionManager, connectionError, type Connections } from "../providers/connections.js";
import { ProviderError } from "../providers/chatgpt.js";
import { CredentialStore } from "../providers/credentials.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import type { ModelSelection } from "../core/model.js";

const revision = z.number().int().positive();
const text = z.string().min(1).max(12000);

export async function startApp(options: { store: ProjectStore; adapter: DiscoveryAdapter; connections?: Connections; port?: number; staticDir?: string }) {
  const token = randomBytes(32).toString("hex");
  const service = new DiscoveryService(options.store, options.adapter);
  const queue = new DiscoveryQueue(service);
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
      if (req.headers.host !== new URL(origin).host) { json(res, 403, { error: "Invalid local host." }); return; }
      const url = new URL(req.url ?? "/", origin);
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET") { json(res, 405, { error: "Method not allowed." }); return; }
        const path = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
        if (!path.startsWith(root + sep)) { json(res, 403, { error: "Invalid asset path." }); return; }
        try {
          let content = await readFile(path);
          if (extname(path) === ".html") content = Buffer.from(content.toString().replace("__WIZARD_TOKEN__", token));
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path)] ?? "application/octet-stream");
          res.end(content);
        } catch { json(res, 404, { error: "UI asset not found. Run npm run build:ui first." }); }
        return;
      }
      if (req.headers["x-wizard-token"] !== token || (req.headers.origin && req.headers.origin !== origin)) {
        json(res, 403, { error: "Invalid local app session. Reload this app's page." }); return;
      }
      if (req.method !== "GET" && req.headers.origin !== origin) { json(res, 403, { error: "Same-origin request required." }); return; }
      if (url.pathname.startsWith("/api/connections")) {
        try {
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
          json(res, 400, { error: error instanceof z.ZodError ? "Invalid connection request fields." : connectionError(error) }); return;
        }
      }
      if (url.pathname === "/api/projects") {
        if (req.method === "GET") { json(res, 200, options.store.list()); return; }
        if (req.method === "POST") {
          const input = z.object({ name: text, idea: text, model: modelSelection }).strict().parse(await body(req));
          await validateConnection(input.model);
          json(res, 201, options.store.create(input.name, input.idea, input.model)); return;
        }
      }
      const route = /^\/api\/projects\/([^/]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
      if (!route?.[1]) { json(res, 404, { error: "Route not found." }); return; }
      const id = decodeURIComponent(route[1]);
      const project = options.store.get(id);
      const action = route[2];
      if (req.method === "GET" && !action) {
        const jobs = options.store.jobs(id).filter((j) => !j.helpRequest).slice(-20).map(({ result: _, researchEvidence: __, ...job }) => job);
        const lastRound = jobs.filter((item) => item.status === "completed").at(-1);
        const previousCoverage = lastRound ? coverage(options.store.get(id, lastRound.expectedRevision)).percent : null;
        const helpJobs = options.store.jobs(id).filter((j) => j.helpRequest).map(({ result: _, researchEvidence: __, ...job }) => job);
        json(res, 200, { project, coverage: coverage(project), previousCoverage, jobs, helpJobs, active: queue.isActive(id), progress: queue.progress(id), submissions: options.store.submissions(id), queuePaused: options.store.queuePaused(id) }); return;
      }
      if (req.method === "GET" && action === "history") { json(res, 200, options.store.history(id)); return; }
      if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
      const raw = await body(req);
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
      if (action === "analyze") {
        const input = z.object({ revision, focusEpicID: z.string().optional(), research: z.boolean().optional() }).strict().parse(raw);
        if (project.revision !== input.revision) throw new StaleRevisionError();
        if (queue.isActive(id)) {
          json(res, 409, { error: "This project already has an active discovery job." }); return;
        }
        queue.resume(id, input);
        json(res, 202, { started: true }); return;
      }
      if (action === "cancel") { z.object({}).strict().parse(raw); queue.stop(id); json(res, 200, { cancelled: queue.isActive(id) }); return; }
      if (action === "submit") { json(res, 202, queue.submit(id, raw)); return; }
      if (action === "answer") {
        const input = z.object({ revision, questionID: z.string(), answer: answerSchema }).strict().parse(raw);
        json(res, 200, options.store.answer(id, input.revision, input.questionID, input.answer)); return;
      }
      if (action === "note") {
        const input = z.object({ revision, text, epicID: z.string().optional() }).strict().parse(raw);
        json(res, 200, options.store.note(id, input.revision, input.text, input.epicID)); return;
      }
      if (action === "review") {
        const input = z.object({ revision, requirementID: z.string(), action: z.enum(["accepted", "rejected"]), note: text }).strict().parse(raw);
        json(res, 200, options.store.review(id, input.revision, input.requirementID, input.action, input.note)); return;
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
      const status = error instanceof StaleRevisionError ? 409 : 400;
      json(res, status, { error: error instanceof z.ZodError ? "Invalid request fields." : safeMessage(error instanceof Error ? error.message : error) });
    });
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(options.port ?? 4317, "127.0.0.1", accept); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local app did not bind a TCP port.");
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, token, close: async () => {
    for (const work of helpWork.values()) work.controller.abort();
    await Promise.allSettled([...helpWork.values()].map((work) => work.promise));
    await queue.close();
    await options.connections?.close();
    server.closeAllConnections();
    await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { "data-dir": { type: "string" }, port: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) console.log("npm run app -- --data-dir .wizard-state --port 4317\nOpen the printed loopback URL in your browser. Defaults to the same store as the CLI.");
  else {
    const directory = resolve(values["data-dir"] ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local/share"), "requirement-wizard"));
    const port = Number(values.port ?? "4317");
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port.");
    const store = new ProjectStore(join(directory, "projects.sqlite"));
    store.recoverExpiredJobs();
    try {
      const connections = new ConnectionManager(new CredentialStore(join(directory, "providers")));
      const app = await startApp({ store, connections, adapter: new ConnectedDiscovery(connections, new OpenCodeDiscovery(join(directory, "runtime"))), port });
      console.log(`\nRequirement Wizard is ready: ${app.origin}\nOpen this address in your browser. Existing CLI projects are available. Ctrl+C stops the app.\n`);
      let closing = false;
      const close = () => { if (closing) return; closing = true; void app.close().finally(() => store.close()); };
      process.once("SIGINT", close); process.once("SIGTERM", close);
    } catch (error) { store.close(); throw error; }
  }
}
