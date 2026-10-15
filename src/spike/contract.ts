import { z } from "zod";

export { safeMessage, selectModel } from "../runtime/contract.js";

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
