/** Shared explanations for operations that require a stable specification. */
export const executionBlockReason = "Assessment or implementation is running. Wait for it to finish, or stop it in Processing & queue. Saved responses will wait safely.";
export const discoveryBlockReason = "Discovery or a folder scan has active work. Wait for it to finish, or stop it in Processing & queue.";

export class OperationConflictError extends Error {}
