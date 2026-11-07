import { z } from "zod";

export const workflowStopSchema = z.enum(["scheduler-yield", "collection-budget", "decision", "saved-input", "human-pause", "task-stopped", "task-failed", "ready"]);
