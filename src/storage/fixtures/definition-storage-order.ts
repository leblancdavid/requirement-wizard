import type { Project } from "../../core/model.js";
import { definitionInputKey } from "../../core/definition-identity.js";

/** Frozen pre-fix emitter field order. Values and array order are not changed.
 * Used to create actual v12-shaped saved data, not a new app round masquerading
 * as a legacy fixture. The original v1 digest algorithm remains unchanged. */
export function legacyDefinitionOrder(project: Project, kinds: ("requirements" | "questions" | "research")[] = ["requirements", "questions", "research"]) {
  const raw = structuredClone(project);
  const order = <T extends object>(record: T, keys: string[]): T => Object.fromEntries(
    [...keys.filter((key) => Object.hasOwn(record, key)), ...Object.keys(record).filter((key) => !keys.includes(key))]
      .map((key) => [key, (record as Record<string, unknown>)[key]])) as T;
  if (kinds.includes("requirements")) raw.requirements = raw.requirements.map((r) => order(r, ["statement", "rationale", "sourceIDs", "acceptance", "id", "status", "epicID"]));
  if (kinds.includes("questions")) raw.questions = raw.questions.map((q) => order(q, ["text", "whyItMatters", "options", "concepts", "category", "evidenceIDs", "id", "status", "epicID"]));
  if (kinds.includes("research")) raw.research = raw.research.map((r) => order(r, ["url", "excerpt", "retrievedAt", "kind", "title", "finding", "id", "epicID"]));
  for (const assessment of raw.assessments) assessment.inputBasis = { format: 1,
    key: definitionInputKey(raw, assessment.epicID, assessment.checks.flatMap((c) => c.evidenceIDs)) };
  return raw;
}
