import type { ExecutionConfig } from "../core/execution.js";
import { checkExecutionContext, executionPrompt, type ExecutionContextManifest } from "../core/execution-context.js";
import { startRuntime } from "./server.js";
import { selectModel, safeMessage } from "./contract.js";
import { resolve } from "node:path";
import { executionSkill } from "../core/execution-skills.js";
import { codingTools, executionPermissions, executionPermissionsCurrent } from "./skills.js";

export type ExecutionRequest = {
  planning?: boolean;
  directory: string; config: ExecutionConfig; prompt: string; coding: boolean;
  sessionID?: string; signal: AbortSignal; onSession: (id: string) => void; onProgress: (message: string) => void;
  requirementID?: string; onContext?: (context: ExecutionContextManifest) => void;
};
export interface ExecutionAdapter { perform(request: ExecutionRequest): Promise<string>; }
export class OpenCodeExecution implements ExecutionAdapter {
  constructor(private createRuntime = startRuntime) {}
  async perform(request: ExecutionRequest) {
    const { directory, config, signal, coding, planning = false } = request;
    if (planning && (coding || request.sessionID)) throw new Error("Planning needs a fresh read-only session.");
    const initialContext = checkExecutionContext(request.prompt, coding, request.requirementID, 0, planning);
    request.onContext?.(initialContext);
    const runtime = await this.createRuntime(`${config.providerID}/${config.modelID}`, directory, signal, false, coding, !coding && !planning, planning);
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
        const savedSession = (await runtime.client.session.get({ sessionID }, { signal })).data;
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
        if (!executionPermissionsCurrent(savedSession?.permission ?? [], coding))
          await runtime.client.session.update({ sessionID, permission: executionPermissions(coding) }, { signal });
        request.onProgress("Resuming the saved OpenCode session after repository reconciliation.");
      } else {
        sessionID = (await runtime.client.session.create({ title: `Reqwizit ${planning ? "planning" : coding ? "implementation" : "assessment"}${request.requirementID ? ` · ${request.requirementID}` : ""}`, permission: executionPermissions(coding, planning) }, { signal })).data?.id;
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
      const skill = executionSkill(coding, planning), catalogSkills = (await runtime.client.app.skills({}, { signal })).data ?? [];
      const registered = catalogSkills.find((s) => s.name === skill.name);
      if (!registered || !runtime.skillPath || resolve(registered.location) !== resolve(runtime.skillPath) || !registered.content.includes(skill.body.trim())) throw new Error("The bundled Reqwizit skill was not registered correctly. Restart the app before retrying.");
      const allowed = new Set(["skill", ...(coding ? codingTools : [])]);
      const tools = (await runtime.client.tool.ids({}, { signal })).data ?? [];
      if (!tools.includes("skill")) throw new Error("This OpenCode runtime does not expose the required skill tool. No prompt was sent.");
      const response = (await runtime.client.session.prompt({ sessionID, model, agent: planning ? "reqwizit-planning" : coding ? "reqwizit-implementation" : "reqwizit-assessment",
        tools: Object.fromEntries(tools.map((id) => [id, allowed.has(id)])),
        parts: [{ type: "text", text: executionPrompt(request.prompt, coding, planning) }],
      }, { signal: requestSignal })).data;
      requestSignal.throwIfAborted();
      if (!response) throw new Error("OpenCode returned no result.");
      if (response.info.error) throw new Error(safeMessage(response.info.error.data.message));
      if (response.info.providerID !== model.providerID || response.info.modelID !== model.modelID) throw new Error("OpenCode returned a different provider/model.");
      const messages = (await runtime.client.session.messages({ sessionID }, { signal: requestSignal })).data ?? [];
      const loaded = messages.some((m) => m.parts.some((p) => p.type === "tool" && p.tool === "skill" && p.state.status === "completed"
        && p.state.input.name === skill.name && p.state.output.includes(skill.body.trim())));
      if (!loaded) throw new Error(`OpenCode did not load the required ${skill.name} skill. No task completion was accepted.`);
      return response.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    } finally {
      signal.removeEventListener("abort", cancel); await abort; stream.abort(); await events; await runtime.close();
    }
  }
}
