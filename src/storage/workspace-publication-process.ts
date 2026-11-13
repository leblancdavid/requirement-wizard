import { ProjectStore } from "./store.js";

if (!process.send || !process.argv[2] || !process.argv[3]) throw new Error("Workspace publication requires its owned process.");
const store = new ProjectStore(process.argv[2], undefined, { publication: "manual", publicationOwner: process.argv[3],
  publicationProgress: progress => process.send?.({ projectID: progress.projectID, progress }) });
let closed = false;
const close = () => { if (!closed) { closed = true; store.close(); } };
process.on("message", (input: { projectID?: string; close?: boolean }) => {
  if (input.close) { close(); process.disconnect(); return; }
  if (!input.projectID) return;
  const binding = store.syncWorkspace(input.projectID);
  // Coalesce newer revisions/checkpoints, not failed/conflicting writes or work
  // still owned by another live execution/discovery worker.
  process.send!({ projectID: input.projectID, retry: binding?.status === "pending"
    && store.workspacePublicationCanRetry(input.projectID) });
});
// Parent loss never starts models or leaves a reusable publication process alive.
process.on("disconnect", () => { try { close(); } finally { process.exit(); } });
