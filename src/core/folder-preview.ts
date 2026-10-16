import { z } from "zod";

export const folderPreviewSchema = z.object({
  name: z.string().min(1).max(150), description: z.string().max(3000), projectType: z.string().max(120),
  evidence: z.array(z.object({ path: z.string().max(500), hash: z.string().regex(/^[a-f0-9]{64}$/), field: z.enum(["name", "description", "projectType"]) }).strict()).max(8),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type FolderPreview = z.infer<typeof folderPreviewSchema>;
