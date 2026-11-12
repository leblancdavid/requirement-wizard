/** Shared explanations for operations that require a stable specification. */
export const executionBlockReason = "Assessment or implementation is running. Wait for it to finish, or use Pause in the header. Your saved responses are kept.";
export const discoveryBlockReason = "Discovery or a folder scan has active work. Wait for it to finish, or use Pause in the header.";

export class OperationConflictError extends Error {}
