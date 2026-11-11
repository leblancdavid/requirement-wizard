import type Database from "better-sqlite3";
import { projectFields } from "../core/model.js";
import type { DecisionEvidenceProject } from "../core/decision-availability.js";

const evidence = projectFields.pick({ sources: true, questions: true, requirements: true, epics: true });

/** Read all identity inputs, in original order, without decoding unrelated large
 * assessment/activity payloads. This projection cannot authorize any other task. */
export function readRefinementEvidence(db: Database.Database, projectID: string, revision: number): DecisionEvidenceProject {
  const row = db.prepare(`SELECT json_extract(payload, '$.sources', '$.questions', '$.requirements', '$.epics') AS evidence
    FROM revisions WHERE project_id=? AND revision=?`).get(projectID, revision) as { evidence: string } | undefined;
  if (!row) throw new Error("Project or revision not found.");
  const [sources, questions, requirements, epics] = JSON.parse(row.evidence) as unknown[];
  return evidence.parse({ sources, questions, requirements, epics });
}
