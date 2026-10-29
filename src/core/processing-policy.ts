import { z } from "zod";

/** Machine-local project consent. Legacy is a compatibility choice, not new
 * automatic authority. Manual only narrows existing automatic permissions. */
export const processingPolicySchema = z.object({ format: z.literal(1), version: z.number().int().nonnegative(),
  mode: z.enum(["legacy", "manual"]),
}).strict();
export type ProcessingPolicy = z.infer<typeof processingPolicySchema>;
export const emptyProcessingPolicy = (): ProcessingPolicy => ({ format: 1, version: 0, mode: "legacy" });
export const processingPolicyChangeSchema = z.object({ version: z.number().int().nonnegative(),
  workflowVersion: z.number().int().nonnegative(), maintenanceVersion: z.number().int().nonnegative(),
  mode: processingPolicySchema.shape.mode,
}).strict();
export type ProcessingPolicyChange = z.infer<typeof processingPolicyChangeSchema>;
export function automaticInputPermission(policy: ProcessingPolicy | undefined, browserAuto: boolean, workflowEnabled: boolean) {
  return policy?.mode !== "manual" && (workflowEnabled || browserAuto);
}
