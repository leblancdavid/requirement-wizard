import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executionSkill, skillDocument } from "../core/execution-skills.js";

export const codingTools = ["read", "glob", "grep", "list", "edit", "write", "patch", "apply_patch", "bash"];
export function executionPermissions(coding: boolean, planning = false) {
  return [
    { permission: "*", pattern: "*", action: "deny" as const },
    ...(coding ? codingTools.map((permission) => ({ permission, pattern: "*", action: "allow" as const })) : []),
    { permission: "skill", pattern: executionSkill(coding, planning).name, action: "allow" as const },
    { permission: "external_directory", pattern: "*", action: "deny" as const },
  ];
}
/** OpenCode 1.18.32 appends session permission updates. The last rules must
 * establish our whole role profile, including deny-all before its exact grants.
 */
export function executionPermissionsCurrent(saved: { permission: string; pattern: string; action: string }[], coding: boolean, planning = false) {
  const required = executionPermissions(coding, planning), tail = saved.slice(-required.length);
  return tail.length === required.length && required.every((rule, i) =>
    tail[i]!.permission === rule.permission && tail[i]!.pattern === rule.pattern && tail[i]!.action === rule.action);
}

/** Stage outside the target repository, including for detached worktrees and packaged apps. */
export async function stageExecutionSkill(coding: boolean, planning = false) {
  const directory = await mkdtemp(join(tmpdir(), "reqwizit-skills-")), skill = executionSkill(coding, planning);
  try {
    const folder = join(directory, skill.name); await mkdir(folder);
    const path = join(folder, "SKILL.md"); await writeFile(path, skillDocument(skill), "utf8");
    return { directory, path, close: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
