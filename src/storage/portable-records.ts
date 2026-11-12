import type { Project } from "../core/model.js";

/** Disposable exact JSON strings, not a new evidence or portable-file format.
 * null denotes an undefined field; the JSON string "null" denotes actual null. */
export type PortableSnapshotRecords = { format: "portable-records-v1"; fields: [string, string | string[] | null][] };

export function portableRecords(project: Project): PortableSnapshotRecords {
  const portable = { ...project, model: { providerID: project.model.providerID, modelID: project.model.modelID } };
  return { format: "portable-records-v1", fields: Object.entries(portable).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(item => JSON.stringify(item) ?? "null") : JSON.stringify(value) ?? null]) };
}

export function isPortableRecords(value: unknown): value is PortableSnapshotRecords {
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== "portable-records-v1"
    || !("fields" in value) || !Array.isArray(value.fields)) return false;
  const keys = new Set<string>();
  return value.fields.every(field => {
    if (!Array.isArray(field) || field.length !== 2 || typeof field[0] !== "string" || keys.has(field[0])) return false;
    keys.add(field[0]);
    return field[1] === null || typeof field[1] === "string" || Array.isArray(field[1]) && field[1].every(item => typeof item === "string");
  }) && keys.has("model") && keys.has("revision");
}

export function projectFromPortableRecords(records: PortableSnapshotRecords): Project {
  return Object.fromEntries(records.fields.map(([key, value]) => [key,
    Array.isArray(value) ? value.map(item => JSON.parse(item) as unknown) : value === null ? undefined : JSON.parse(value) as unknown])) as Project;
}
