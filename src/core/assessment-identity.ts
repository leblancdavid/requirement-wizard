/** Bump only when evidence/acceptance semantics change, not for workflow prose.
 * A bump needs an explicit compatibility/migration decision in docs/migrations.md. */
export const assessmentCompatibility = "assessment-evidence-v1";
export const executionSchemaVersion = 2;

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}

/** Decisions are independent of prompt instructions, skill prose and budget policy.
 * Arrays retain their order; only referenced path sets and object keys normalize.
 * This v1 projection is also used by historical migrations: keep it immutable and
 * add a new versioned projection/migration for future representation changes. */
export function decisionIdentity(data: Record<string, unknown>, paths: string[]) {
  const { evidencePolicy: _instructions, ...decisions } = data;
  return canonicalJSON(["decisions-v1", decisions, [...paths].sort()]);
}
