import { z } from "zod";
import type { DiscoveryAdapter, DiscoveryOptions } from "../service/discovery.js";
import type { Project, QuestionHelpRequest } from "../core/model.js";
import { discoveryPrompt, questionHelpPrompt } from "../runtime/discovery.js";
import { ConnectionManager, connectionError } from "./connections.js";
import { generate, ProviderError } from "./chatgpt.js";

/** Explicit selection dispatch: a disconnected direct account never falls back to OpenCode. */
export class ConnectedDiscovery implements DiscoveryAdapter {
  constructor(private readonly connections: ConnectionManager, private readonly legacy: DiscoveryAdapter, private readonly request: typeof fetch = fetch) {}
  analyze(project: Project, options: DiscoveryOptions) {
    if (!project.model.connectionID) return this.legacy.analyze(project, options);
    if (options.research) throw new ProviderError("Direct ChatGPT research is not available yet. Turn off targeted research in Settings before exploring.");
    return this.direct(project, options, discoveryPrompt(project, options.context, false));
  }
  clarify(project: Project, request: QuestionHelpRequest, options: DiscoveryOptions) {
    if (!project.model.connectionID) {
      if (!this.legacy.clarify) throw new ProviderError("Question help is unavailable for this connection.");
      return this.legacy.clarify(project, request, options);
    }
    return this.direct(project, options, questionHelpPrompt(project, request, options.context));
  }
  private async direct(project: Project, options: DiscoveryOptions, prompt: string): Promise<unknown> {
    try {
      if (project.model.providerID !== "openai") throw new ProviderError("Select an OpenAI model for this ChatGPT connection.");
      options.onProgress("Generating with your connected ChatGPT plan…");
      return await this.connections.withAccount(project.model.connectionID!, async (account, signal) => {
        const result = await generate(account, project.model.modelID, "You are Reqwizit's requirements assistant. Follow the supplied task and JSON schema. Do not use tools.", prompt, signal, this.request);
        signal.throwIfAborted();
        const usage = z.object({ input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative(),
          output_tokens_details: z.object({ reasoning_tokens: z.number().nonnegative() }).optional() }).safeParse(result.response.usage);
        options.onTelemetry({ actualModel: { providerID: "openai", modelID: result.response.model }, runtimeReportedCost: null,
          usage: usage.success ? { input: usage.data.input_tokens, output: usage.data.output_tokens, reasoning: usage.data.output_tokens_details?.reasoning_tokens ?? 0 } : null });
        options.onResearch([]);
        return JSON.parse(result.text) as unknown;
      }, options.signal);
    } catch (error) { throw new ProviderError(connectionError(error)); }
  }
}
