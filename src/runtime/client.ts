import { OpenCode, type OpenCodeClient, type SessionMessageInfo, type SessionMessageAssistant, type PermissionRule, type OpenCodeEvent } from "@opencode/client";
import { safeMessage } from "./contract.js";
import { runtimeFetch } from "./http.js";

/** App-owned projection; never expose V2 provider settings or credential payloads. */
export type RuntimePermission = { permission: string; pattern: string; action: "allow" | "deny" | "ask" };
export type ToolPart = { type: "tool"; id: string; tool: string; state: { status: "completed"; input: Record<string, unknown>; output: string; [key: string]: unknown }
  | { status: "running" | "error" | "streaming" | "pending"; input: Record<string, unknown>; output?: string; [key: string]: unknown }; [key: string]: unknown };
export type Part = ToolPart | { type: "text" | "reasoning"; text: string; [key: string]: unknown };
type Message = { info: { id: string; role: string; time: { completed?: number }; providerID: string; modelID: string;
  error?: { name: string; data: { message: string; statusCode?: number; isRetryable?: boolean } }; tokens?: SessionMessageAssistant["tokens"]; cost?: number; structured?: unknown }; parts: Part[] };
type Options = { signal?: AbortSignal };
export const runtimeToolNames = ["skill", "read", "glob", "grep", "edit", "shell", "webfetch", "websearch"];
const action = (name: string) => ["bash", "shell"].includes(name) ? "shell" : ["write", "patch", "apply_patch", "edit"].includes(name) ? "edit" : name === "task" ? "subagent" : name;
export const nativePermissions = (rules: RuntimePermission[]): PermissionRule[] => rules.map((r) => ({ action: action(r.permission), resource: r.pattern, effect: r.action }));
const projectedPermissions = (rules: PermissionRule[] = []): RuntimePermission[] => rules.map((r) => ({ permission: r.action, pattern: r.resource, action: r.effect }));

export function runtimeMessage(message: SessionMessageInfo): Message {
  if (message.type === "user" && (message.files?.length || message.agents?.length || message.skills?.length))
    throw new Error("Saved OpenCode input contains attachments outside this app's text-only contract. No saved evidence was silently omitted or model request repeated.");
  const assistant = message.type === "assistant" ? message : undefined;
  const parts: Part[] = assistant ? assistant.content.map((part): Part => {
    if (part.type !== "tool") return { type: part.type, text: part.text };
    const state = part.state;
    return { type: "tool", id: part.id, tool: part.name, state: { status: state.status,
      input: "input" in state && typeof state.input === "object" ? { ...state.input, ...(part.name === "skill" && "id" in state.input ? { name: state.input.id } : {}) } : {}, output: "content" in state ? state.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "" : "" } };
  }) : message.type === "user" || message.type === "synthetic" || message.type === "system" ? [{ type: "text", text: message.text }]
    : message.type === "skill" ? [{ type: "tool", id: message.id, tool: "skill", state: { status: "completed", input: { name: message.skill }, output: message.text } }]
    : message.type === "compaction" && message.status === "completed" ? [{ type: "text", text: message.summary }]
    : message.type === "shell" ? [{ type: "tool", id: message.id, tool: "shell", state: { status: message.status === "exited" ? "completed" : "error", input: { command: message.command }, output: message.output?.output ?? "" } }] : [];
  return { info: { id: message.id, role: message.type, time: { completed: "completed" in message.time ? message.time.completed : undefined },
    providerID: assistant?.model.providerID ?? "", modelID: assistant?.model.id ?? "",
    ...(assistant?.error ? { error: { name: assistant.error.type, data: { message: safeMessage(assistant.error.message), statusCode: assistant.error.status } } } : {}),
    ...(assistant ? { tokens: assistant.tokens, cost: assistant.cost } : {}) }, parts };
}

export function runtimeClient(native: OpenCodeClient, directory: string) {
  const location = { directory };
  const messages = async ({ sessionID }: { sessionID: string }, options: Options = {}) => {
    const result: SessionMessageInfo[] = []; let after: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const page = await native.message.list({ sessionID, ...(after ? { cursor: after } : { order: "asc" as const }), limit: 100 }, options);
      result.push(...page.data);
      const next = page.cursor.next;
      if (!next) break;
      if (seen.has(next) || seen.size >= 1000 || result.length > 100000) throw new Error("OpenCode message pagination did not finish; no history was silently omitted.");
      seen.add(next); after = next;
    }
    return result;
  };
  return {
    native,
    global: { health: async () => ({ data: await native.server.info() }) },
    config: { get: async () => {
      const config = await native.config.get({ location });
      return { data: { permission: config.flatMap((entry) => entry.type === "document" ? entry.info.permissions ?? [] : []) } };
    } },
    provider: {
      list: async (_input = {}, options: Options = {}) => {
        // V2 initializes active providers while loading the model catalog.
        const models = await native.model.list({ location }, options);
        const [providers, integrations] = await Promise.all([native.provider.list({ location }, options), native.integration.list({ location }, options)]);
        return { data: { connected: providers.data.filter((p) => p.activation !== "disabled" && (p.activation === "enabled" || integrations.data.some((i) => i.id === (p.integrationID ?? p.id) && i.connections.length))).map((p) => p.id),
          all: providers.data.map((p) => ({ id: p.id, name: p.name, models: Object.fromEntries(models.data.filter((m) => m.providerID === p.id && m.enabled).map((m) => [m.id, { name: m.name }])) })) } };
      },
      auth: async () => ({ data: Object.fromEntries((await native.integration.list({ location })).data.map((i) => [i.id, i.methods.map((m) => ({ type: m.type, label: "label" in m ? m.label : m.type }))])) }),
    },
    app: {
      agents: async () => ({ data: (await native.agent.list({ location })).data.map((a) => ({ name: a.id, permission: projectedPermissions(a.permissions) })) }),
      skills: async (_input = {}, options: Options = {}) => ({ data: (await native.skill.list({ location }, options)).data.map((s) => ({ name: s.id, location: s.path, content: s.content })) }),
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }, options: Options = {}) => {
        const info = await native.session.get({ sessionID }, options);
        return { data: { id: info.id, permission: projectedPermissions(info.permissions) } };
      },
      create: async (input: { title: string; permission: RuntimePermission[] }, options: Options = {}) => {
        const info = await native.session.create({ title: input.title, location, permissions: nativePermissions(input.permission) }, options);
        return { data: { id: info.id } };
      },
      update: async (input: { sessionID: string; permission: RuntimePermission[] }, options: Options = {}) => native.session.update({ sessionID: input.sessionID, permissions: nativePermissions(input.permission) }, options),
      delete: async (input: { sessionID: string }, options: Options = {}) => native.session.remove(input, options),
      messages: async (input: { sessionID: string }, options: Options = {}) => ({ data: (await messages(input, options)).filter((m) => m.type !== "idle").map(runtimeMessage) }),
      abort: async (input: { sessionID: string }, options: Options = {}) => native.session.interrupt(input, options),
      prompt: async (input: { sessionID: string; model: { providerID: string; modelID: string }; agent: string; tools?: Record<string, boolean>;
        parts: { type: "text"; text: string }[]; format?: unknown }, options: Options = {}) => {
        if (input.format) throw new Error("OpenCode V2 native schema generation is not qualified. Explicitly select text-json; no prompt was sent.");
        await native.session.switchAgent({ sessionID: input.sessionID, agent: input.agent }, options);
        await native.session.switchModel({ sessionID: input.sessionID, model: { providerID: input.model.providerID, id: input.model.modelID } }, options);
        if (input.tools) {
          const info = await native.session.get({ sessionID: input.sessionID }, options);
          await native.session.update({ sessionID: input.sessionID, permissions: [...info.permissions ?? [],
            ...Object.entries(input.tools).filter(([, allowed]) => !allowed).map(([name]): PermissionRule => ({ action: action(name), resource: "*", effect: "deny" }))] }, options);
        }
        const queued = await native.session.prompt({ sessionID: input.sessionID, text: input.parts.map((p) => p.text).join("\n") }, options);
        await native.session.wait({ sessionID: input.sessionID }, options);
        options.signal?.throwIfAborted();
        const history = await messages({ sessionID: input.sessionID }, options);
        const index = history.findIndex((m) => m.id === queued.id && m.type === "user" && m.text === input.parts.map((p) => p.text).join("\n"));
        if (index < 0) throw new Error("OpenCode did not retain this exact queued prompt; no older output was reused.");
        runtimeMessage(history[index]!); // Reject unsupported attached context, never silently drop it.
        const tail = history.slice(index + 1), idle = [...tail].reverse().find((m) => m.type === "idle");
        if (tail.some((m) => m.type === "user")) throw new Error("Another prompt intervened in the saved session; no unrelated response was reused.");
        if (!idle || idle.type !== "idle" || idle.outcome !== "succeeded") throw new Error(safeMessage(idle?.type === "idle" && idle.error ? idle.error.message : "OpenCode did not finish this request successfully."));
        for (const message of tail) if (message.type === "assistant") {
          if (message.model.providerID !== input.model.providerID || message.model.id !== input.model.modelID) throw new Error("OpenCode returned a different provider/model; no result was accepted.");
          if (message.error) throw new Error(safeMessage(message.error.message));
        }
        const response = [...tail].reverse().find((m) => m.type === "assistant");
        if (!response || response.type !== "assistant" || !response.time.completed) throw new Error("OpenCode returned no completed assistant output for this prompt.");
        const projected = runtimeMessage(response);
        const tools = tail.flatMap((m) => runtimeMessage(m).parts).filter((p): p is ToolPart => p.type === "tool");
        if (input.tools && tools.some((part) => !input.tools![part.tool])) throw new Error("OpenCode attempted a tool outside this request's permission profile; no result was accepted.");
        // Tool activity can occur in earlier assistant steps; never hide it behind
        // the final JSON-only text step when checking discovery/research budgets.
        projected.parts = [...new Map(tools.map((part) => [part.id, part])).values(), ...projected.parts.filter((p) => p.type !== "tool")];
        return { data: projected };
      },
    },
    event: { subscribe: async (_input = {}, options: Options = {}) => ({ stream: (async function* () {
      for await (const event of native.event.subscribe({ signal: options.signal })) {
        const normalized = runtimeEvent(event);
        if (normalized) yield normalized;
      }
    })() }) },
  };
}

function runtimeEvent(event: OpenCodeEvent): { type: string; properties: { sessionID?: string; part: Part & { sessionID: string } } } | undefined {
  if (!("data" in event) || !event.data || typeof event.data !== "object" || !("sessionID" in event.data)) return;
  const sessionID = String(event.data.sessionID);
  if (event.type === "permission.asked") return { type: "permission.asked", properties: { sessionID, part: { type: "text", text: "", sessionID } } };
  if (event.type === "session.tool.input.started") return { type: "message.part.updated", properties: { sessionID, part: { type: "tool", id: event.data.id, tool: event.data.name, state: { status: "running", input: {}, output: "" }, sessionID } } };
  if (event.type === "session.text.delta" || event.type === "session.reasoning.delta") return { type: "message.part.delta", properties: { sessionID, part: { type: "text", text: "", sessionID } } };
}

export const createRuntimeClient = (url: string, directory: string, headers: Record<string, string>) => runtimeClient(OpenCode.make({ baseUrl: url, headers, fetch: runtimeFetch }), directory);
