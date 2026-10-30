import type { Job } from "./model.js";
import type { DefinitionFindingPreviewRequest } from "./definition-finding-origin.js";
import type { DefinitionJointResult, DefinitionJointResponse } from "./definition-joint-review.js";
import type { DefinitionJointUsageReport } from "./definition-joint-usage.js";
import type { DefinitionCombinationPreviewQuery, DefinitionCombinationPreviewResult } from "./definition-combination-preview.js";
import type { DefinitionCombinationReviewActions } from "./definition-combination-review-view.js";

/** Dated local evidence only, never a current publication/freshness certificate. */
export type DefinitionJointView = { status: "recorded"; format: 1; policy: "definition-joint-view-v1"; authority: "review-evidence-only"; canPublish: false;
  projectID: string; epicID: string; jobID: string; jobStatus: Job["status"]; request: DefinitionFindingPreviewRequest;
  createdAt: string; respondedAt?: string; completedAt?: string; reserved: boolean; sourceJobID?: string;
  result?: DefinitionJointResult; response?: DefinitionJointResponse } | { status: "unavailable"; reason: string };
export type DefinitionJointStart = { status: "accepted"; jobID: string; action?: "new-attempt" | "completed-reuse" | "saved-response-recovery" } | { status: "unavailable"; reason: string };
export type DefinitionJointActions = { start: (request: DefinitionFindingPreviewRequest) => Promise<DefinitionJointStart>;
  inspect: (epicID: string, jobID?: string) => Promise<DefinitionJointView>; stop: (jobID: string) => Promise<unknown>;
  usage?: (epicID: string) => Promise<DefinitionJointUsageReport>;
  combinationPreview?: (query: DefinitionCombinationPreviewQuery) => Promise<DefinitionCombinationPreviewResult>;
  combinationReviews?: DefinitionCombinationReviewActions };
