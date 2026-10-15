import type { Part } from "@opencode-ai/sdk/v2/client";
import type { ResearchEvidence } from "../core/model.js";

/** Citations must originate in actual completed tool output, never just model text. */
export function retrievedEvidence(parts: Part[]): ResearchEvidence[] {
  const evidence = new Map<string, ResearchEvidence>();
  for (const part of parts) {
    if (part.type !== "tool" || part.state.status !== "completed" || !["websearch", "webfetch"].includes(part.tool)) continue;
    const output = part.state.output;
    // Links inside a fetched page are not evidence that those linked pages were read.
    const urls = part.tool === "webfetch"
      ? typeof part.state.input.url === "string" ? [part.state.input.url] : []
      : [...output.matchAll(/https?:\/\/[^\s<>"\[\]()`\\]+/g)].map((match) => match[0].replace(/[.,;]+$/, ""));
    for (const candidate of urls.slice(0, 12)) {
      let url: URL;
      try { url = new URL(candidate); } catch { continue; }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /[?&](?:access_token|api_key|token)=/i.test(url.search)) continue;
      const index = Math.max(0, output.indexOf(candidate));
      evidence.set(candidate, { url: candidate, excerpt: output.slice(Math.max(0, index - 300), index + 1800),
        retrievedAt: new Date().toISOString(), kind: part.tool === "webfetch" && candidate === part.state.input.url ? "fetched-page" : "search-result" });
    }
  }
  return [...evidence.values()].slice(0, 24);
}
