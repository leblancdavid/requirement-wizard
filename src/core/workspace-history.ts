import { z } from "zod";

const id = z.string().min(1).max(200);
export const workspaceHistorySchema = z.object({ format: z.literal(1), lastProjectID: id.nullable(), recentProjectIDs: z.array(id).max(100) }).strict();
export type WorkspaceHistory = z.infer<typeof workspaceHistorySchema>;
export type WorkspaceHistorySnapshot = { status: "ready"; history: WorkspaceHistory | null } | { status: "unavailable" };
export function visitWorkspace(history: WorkspaceHistory, projectID: string): WorkspaceHistory {
  id.parse(projectID);
  return { format: 1, lastProjectID: projectID, recentProjectIDs: [projectID, ...history.recentProjectIDs.filter(item => item !== projectID)].slice(0, 100) };
}
