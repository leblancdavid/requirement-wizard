import { z } from "zod";
import type { Project } from "./model.js";
import type { ExecutionConfig } from "./execution.js";
import { canonicalJSON } from "./assessment-identity.js";

/** Literal repository-relative files or directory prefixes, never glob patterns. */
export const assessmentPathSchema = z.string().trim().min(1).max(300)
  .transform((path) => path.replaceAll("\\", "/").replace(/\/$/, ""))
  .refine((path) => !path.startsWith("/") && !/[\x00-\x1f:*?\[\]{}]/.test(path)
    && path.split("/").every((part) => !!part && part !== "." && part !== ".."), "Use a repository-relative file or directory, without wildcards or parent traversal");

export type AssessmentFootprint = {
  version: 1; policy: string; fingerprint: string;
  files: { path: string; hash: string; ranges: string }[];
  omissionsFingerprint: string; broad: boolean;
};
export type AssessmentImpact = { fingerprint?: string; policy?: string; reusable: boolean; reason: string };

export function matchesAssessmentPath(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** A missing prerequisite boundary widens to the repository, rather than guessing. */
export function reviewedAssessmentPaths(project: Project, id: string, config?: ExecutionConfig): string[] | undefined {
  if (!config) return;
  const paths = new Set(config.sharedAssessmentPaths ?? []), visited = new Set<string>();
  function visit(target: string): boolean {
    if (visited.has(target)) return true;
    visited.add(target);
    const r = project.requirements.find((r) => r.id === target);
    const own = config!.assessmentScopes?.[target];
    if (!r || !own?.length) return false;
    own.forEach((path) => paths.add(path));
    const epic = project.epics.find((e) => e.id === r.epicID);
    const prerequisites = [...config!.dependencies[target] ?? [], ...project.requirements
      .filter((other) => other.status === "accepted" && epic?.dependencies.includes(other.epicID)).map((other) => other.id)];
    return prerequisites.every(visit);
  }
  return visit(id) ? [...paths].sort() : undefined;
}

export function assessmentImpactPolicy(project: Project, id: string, config?: ExecutionConfig) {
  return canonicalJSON(["assessment-impact-v1", reviewedAssessmentPaths(project, id, config) ?? null]);
}

/** Root metadata and nested configuration remain global guardrails even with reviewed scopes. */
export function sharedAssessmentFile(path: string) {
  return !path.includes("/") || /\.(?:json|ya?ml|toml|ini|godot|csproj|sln)$/i.test(path)
    || /(?:^|\/)(?:[^/]*config[^/]*|[^/]*lock[^/]*)$/i.test(path);
}
