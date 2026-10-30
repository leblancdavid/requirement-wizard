import { z } from "zod";
import type { assessmentSchema } from "./epics.js";
import type { DefinitionFindingOrigin } from "./definition-finding-origin.js";

export const definitionCombinationPreviewQuerySchema = z.object({ revision: z.number().int().positive(), epicID: z.string().min(1).max(500),
  snapshotKey: z.string().regex(/^[a-f0-9]{64}$/), jobID: z.string().uuid() }).strict();
export type DefinitionCombinationPreviewQuery = z.infer<typeof definitionCombinationPreviewQuerySchema>;
type Finding = z.infer<typeof assessmentSchema>["checks"][number];
export type DefinitionCombinationPreview = { format: 1; policy: "definition-combination-preview-v1"; authority: "inspection-only";
  canPublish: false; projectID: string; epicID: string; revision: number; snapshotKey: string; previewKey: string;
  jointJobID: string; requestJobID: string; respondedAt: string; completedAt: string; candidateKey: string; contextKey: string;
  responseKey: string; currentAssessmentKey: string; partition: "whole-area";
  findings: Array<{ origin: DefinitionFindingOrigin; originalFinding: Finding; currentFinding: Finding | null;
    comparison: "same-finding" | "different-finding" | "not-recorded" }> };
export type DefinitionCombinationPreviewResult = { status: "recorded"; preview: DefinitionCombinationPreview } | { status: "unavailable"; reason: string };
