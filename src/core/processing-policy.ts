import { z } from "zod";

/** Machine-local project consent. Legacy is a compatibility choice, not new
 * automatic authority. Manual narrows existing permissions; Guided routes new
 * input only through explicit, bounded coordinator grants. */
export const processingPolicySchema = z.object({ format: z.literal(1), version: z.number().int().nonnegative(),
  mode: z.enum(["legacy", "manual", "guided"]),
}).strict();
export type ProcessingPolicy = z.infer<typeof processingPolicySchema>;
export const emptyProcessingPolicy = (): ProcessingPolicy => ({ format: 1, version: 0, mode: "legacy" });
export const processingPolicyChangeSchema = z.object({ version: z.number().int().nonnegative(),
  workflowVersion: z.number().int().nonnegative(), maintenanceVersion: z.number().int().nonnegative(),
  mode: processingPolicySchema.shape.mode,
}).strict();
export type ProcessingPolicyChange = z.infer<typeof processingPolicyChangeSchema>;
/** Eligibility flag for a newly saved response, never authority to dispatch a
 * request or renew a grant. Existing saved flags are not reinterpreted here. */
export function automaticInputPermission(policy: ProcessingPolicy | undefined, browserAuto: boolean, workflowEnabled: boolean) {
  return policy?.mode === "guided" || (policy?.mode !== "manual" && (workflowEnabled || browserAuto));
}
