import type { ExecutionConfig } from "../core/execution.js";
import { checkExecutionContext, executionPrompt, type ExecutionContextManifest } from "../core/execution-context.js";
import { startRuntime } from "./server.js";
import { selectModel, safeMessage } from "./contract.js";

export type ExecutionRequest = {
  directory: string; config: ExecutionConfig; prompt: string; coding: boolean;
  sessionID?: string; signal: AbortSignal; onSession: (id: string) => void; onProgress: (message: string) => void;
  requirementID?: string; onContext?: (context: ExecutionContextManifest) => void;
};
export interface ExecutionAdapter { perform(request: ExecutionRequest): Promise<string>; }
export class OpenCodeExecution implements ExecutionAdapter {
  constructor(private createRuntime = startRuntime) {}
  async perform(request: ExecutionRequest) {
    const { directory, config, signal, coding } = request;
    const initialContext = checkExecutionContext(request.prompt, coding, request.requirementID);
    request.onContext?.(initialContext);
    const runtime = await this.createRuntime(`${config.providerID}/${config.modelID}`, directory, signal, false, coding, !coding);
    let sessionID = request.sessionID;
    const stream = new AbortController();
    const requestAbort = new AbortController();
    const requestSignal = AbortSignal.any([signal, requestAbort.signal]);
    let abort: Promise<unknown> | undefined;
    const cancel = () => {
      requestAbort.abort();
      stream.abort();
      if (sessionID) abort = runtime.client.session.abort({ sessionID }, { signal: AbortSignal.timeout(10_000) }).catch(() => request.onProgress("Remote abort unconfirmed; stopping the owned runtime."));
    };
    signal.addEventListener("abort", cancel, { once: true });
    let events: Promise<void> | undefined;
    try {
      signal.throwIfAborted();
      const catalog = (await runtime.client.provider.list({}, { signal })).data;
      if (!catalog) throw new Error("OpenCode returned no provider catalog.");
      const model = selectModel(catalog, config.providerID, config.modelID);
      if (sessionID) {
        // Lookup must succeed. Never silently create a replacement for a missing session.
        await runtime.client.session.get({ sessionID }, { signal });
        const messages = (await runtime.client.session.messages({ sessionID }, { signal })).data ?? [];
        if (request.requirementID) for (const message of messages.filter((m) => m.info.role === "user")) for (const part of message.parts) if (part.type === "text") {
          const owner = /^Reqwizit task [^/\n]+\/([^/\n]+)\//.exec(part.text)?.[1];
          if (owner && owner !== request.requirementID) throw new Error("Saved OpenCode session belongs to another requirement. It cannot be reused for this task.");
        }
        const user = [...messages].reverse().find((m) => m.info.role === "user");
        const latest = messages.at(-1);
        const task = request.prompt.split("\n")[0]!;
        if (user?.parts.some((p) => p.type === "text" && p.text.split("\n", 1)[0] === task) && latest?.info.role === "assistant" && latest.info.time.completed && !latest.info.error && latest.parts.some((p) => p.type === "text" && p.text.includes('"outcome"'))) {
          if (latest.info.providerID !== model.providerID || latest.info.modelID !== model.modelID) throw new Error("Saved session response came from a different provider/model.");
          request.onProgress("Recovered the completed response from the saved coding session.");
          return latest.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
        }
        const context = checkExecutionContext(request.prompt, coding, request.requirementID, JSON.stringify(messages).length);
        request.onContext?.(context);
        request.onProgress("Resuming the saved OpenCode session after repository reconciliation.");
      } else {
        sessionID = (await runtime.client.session.create({ title: `Reqwizit ${coding ? "implementation" : "assessment"}${request.requirementID ? ` · ${request.requirementID}` : ""}`, permission: [
          { permission: "*", pattern: "*", action: "deny" },
          ...(coding ? ["read", "glob", "grep", "list", "edit", "write", "patch", "apply_patch", "bash"].map((permission) => ({ permission, pattern: "*", action: "allow" as const })) : []),
          { permission: "external_directory", pattern: "*", action: "deny" },
        ] }, { signal })).data?.id;
        if (!sessionID) throw new Error("OpenCode did not create a session.");
        request.onSession(sessionID);
      }
      const subscription = await runtime.client.event.subscribe({}, { signal: stream.signal });
      events = (async () => {
        try { for await (const event of subscription.stream) {
          if (event.type === "message.part.updated" && event.properties.part.sessionID === sessionID && event.properties.part.type === "tool") request.onProgress(`OpenCode: ${event.properties.part.tool}`);
          if (event.type === "permission.asked" && event.properties.sessionID === sessionID) {
            request.onProgress("Blocked: OpenCode requested an unavailable permission. Stop and review the task."); cancel();
          }
        } } catch { if (!stream.signal.aborted) request.onProgress("Progress stream interrupted; awaiting request result."); }
      })();
      const allowed = new Set(coding ? ["read", "glob", "grep", "list", "edit", "write", "patch", "apply_patch", "bash"] : []);
      const tools = (await runtime.client.tool.ids({}, { signal })).data ?? [];
      const response = (await runtime.client.session.prompt({ sessionID, model, agent: coding ? "reqwizit-implementation" : "reqwizit-assessment",
        tools: Object.fromEntries(tools.map((id) => [id, allowed.has(id)])),
        parts: [{ type: "text", text: executionPrompt(request.prompt, coding) }],
      }, { signal: requestSignal })).data;
      if (!response) throw new Error("OpenCode returned no result.");
      if (response.info.error) throw new Error(safeMessage(response.info.error.data.message));
      if (response.info.providerID !== model.providerID || response.info.modelID !== model.modelID) throw new Error("OpenCode returned a different provider/model.");
      return response.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    } finally {
      signal.removeEventListener("abort", cancel); await abort; stream.abort(); await events; await runtime.close();
    }
  }
}
