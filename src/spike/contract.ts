import { z } from "zod";

export function safeMessage(message: unknown): string {
  return (typeof message === "string" ? message : "Runtime error (details unavailable).")
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)\b/g, "[redacted]")
    .replace(/((?:access_token|refresh_token|api_key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi, "$1[redacted]")
    .slice(0, 1200);
}

export const interpretation = z.object({
  summary: z.string().min(1),
  assumptions: z.array(z.string()),
  questions: z.array(z.object({
    question: z.string().min(1),
    whyItMatters: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(5),
  }).strict()).min(1).max(3),
}).strict();

export const interpretationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1 },
    assumptions: { type: "array", items: { type: "string" } },
    questions: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          question: { type: "string", minLength: 1 },
          whyItMatters: { type: "string", minLength: 1 },
          options: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 1 } },
        },
        required: ["question", "whyItMatters", "options"],
      },
    },
  },
  required: ["summary", "assumptions", "questions"],
};

export function positiveMilliseconds(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 600_000) {
    throw new Error(`${name} must be an integer between 1 and 600000.`);
  }
  return number;
}

export function selectModel(
  catalog: { all: Array<{ id: string; models: Record<string, unknown> }>; connected: string[] },
  providerID: string,
  modelID: string,
) {
  if (!["github-copilot", "openai"].includes(providerID)) {
    throw new Error("Select github-copilot or openai for this subscription spike.");
  }
  if (!catalog.connected.includes(providerID)) {
    throw new Error(`Provider ${providerID} is not connected. Run opencode auth login first.`);
  }
  const provider = catalog.all.find((item) => item.id === providerID);
  if (!provider || !Object.hasOwn(provider.models, modelID)) {
    throw new Error(`Model is unavailable for ${providerID}. Run the providers command to list model IDs.`);
  }
  return { providerID, modelID };
}
