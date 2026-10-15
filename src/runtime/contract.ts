export function safeMessage(message: unknown): string {
  return (typeof message === "string" ? message : "Runtime error (details unavailable).")
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)\b/g, "[redacted]")
    .replace(/((?:access_token|refresh_token|api_key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi, "$1[redacted]")
    .slice(0, 1200);
}

export function selectModel(
  catalog: { all: Array<{ id: string; models: Record<string, unknown> }>; connected: string[] },
  providerID: string,
  modelID: string,
) {
  if (!["github-copilot", "openai"].includes(providerID)) throw new Error("Select github-copilot or openai.");
  if (!catalog.connected.includes(providerID)) {
    throw new Error(`Provider ${providerID} is not connected. Run opencode auth login first.`);
  }
  const provider = catalog.all.find((item) => item.id === providerID);
  if (!provider || !Object.hasOwn(provider.models, modelID)) {
    throw new Error(`Model is unavailable for ${providerID}. Run npm run spike -- providers to list model IDs.`);
  }
  return { providerID, modelID };
}
