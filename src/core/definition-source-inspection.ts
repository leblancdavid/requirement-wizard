import { z } from "zod";
import type { DefinitionFindingOrigin } from "./definition-finding-origin.js";
import type { DefinitionFindingPreviewRequest, DefinitionFindingOriginPreview } from "./definition-finding-origin.js";

export const definitionSourceQuerySchema = z.object({ revision: z.number().int().positive(), epicID: z.string().min(1).max(500),
  snapshotKey: z.string().regex(/^[a-f0-9]{64}$/), beforeRevision: z.number().int().positive().optional() }).strict();
export type DefinitionSourceQuery = z.infer<typeof definitionSourceQuerySchema>;
export type DefinitionSourcePage = { status: "recorded"; format: 1; policy: "definition-source-inspection-v1"; authority: "inspection-only";
  projectID: string; epicID: string; revision: number; snapshotKey: string; canPublish: false;
  entries: Array<{ assessmentRevision: number; status: "verified"; certificateKey: string; origins: DefinitionFindingOrigin[] }
    | { assessmentRevision: number; status: "unavailable"; reason: string }>;
  nextBeforeRevision: number | null } | { status: "unavailable"; reason: string };
export type DefinitionOriginInspection = { status: "recorded"; preview: DefinitionFindingOriginPreview } | { status: "unavailable"; reason: string };
export type DefinitionSourceActions = { sources: (query: DefinitionSourceQuery) => Promise<DefinitionSourcePage>;
  compare: (request: DefinitionFindingPreviewRequest) => Promise<DefinitionOriginInspection> };
