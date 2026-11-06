/** Read-only fit measurement. Never open user data through ProjectStore: doing so
 * can migrate/write it. No inference, credential inspection or raw evidence output. */
import Database from "better-sqlite3";
import { parseArgs } from "node:util";
import { projectSchema, type Project } from "../src/core/model.js";
import { canonicalJSON } from "../src/core/assessment-identity.js";
import { definitionChangeBaseline, definitionChangeReceipt } from "../src/core/definition-change-review.js";
import { prepareDefinitionChangeEvidence, type DefinitionChangeEvidenceTask } from "../src/core/definition-change-evidence.js";
import { prepareDefinitionChangeGroup } from "../src/core/definition-change-group.js";

const { values } = parseArgs({ options: { database: { type: "string" }, project: { type: "string" }, revision: { type: "string" } } });
if (!values.database || !values.project || !values.revision || !/^[1-9]\d*$/.test(values.revision))
  throw new Error("Provide --database <sqlite> --project <id> --revision <number>.");
const db = new Database(values.database, { readonly: true, fileMustExist: true }); db.pragma("query_only=ON");
try {
  const read = (revision: number): Project => {
    const row = db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(values.project!, revision) as { payload: string } | undefined;
    if (!row) throw new Error("Requested immutable revision is missing."); return projectSchema.parse(JSON.parse(row.payload));
  };
  const current = read(Number(values.revision)), tasks: DefinitionChangeEvidenceTask[] = [];
  let preservedBaselines = 0, unavailable = 0;
  for (const assessment of current.assessments) {
    const original = read(assessment.atRevision), candidate = current.definitionChangeReviews?.find(r => r.epicID === assessment.epicID);
    let baseline: Project | undefined;
    if (candidate?.response.outcome === "unaffected") {
      const snapshot = read(candidate.reviewedRevision + 1);
      if (!definitionChangeBaseline(original, current, assessment.epicID, snapshot)) { unavailable++; continue; }
      let receipt = candidate;
      for (let depth = 0; receipt.baseline; depth++) {
        if (depth >= 128) throw new Error("Baseline ancestry exceeds the supported bound.");
        const previous = read(receipt.baseline.revision), reviewed = read(receipt.reviewedRevision);
        if (canonicalJSON(definitionChangeBaseline(original, reviewed, assessment.epicID, previous)) !== canonicalJSON(receipt.baseline))
          throw new Error("Baseline ancestry differs.");
        receipt = definitionChangeReceipt(previous, assessment.epicID)!;
      }
      baseline = snapshot;
    }
    const task = prepareDefinitionChangeEvidence(original, current, assessment.epicID, baseline);
    if (task) { tasks.push(task); if (task.fields.baseline) preservedBaselines++; } else unavailable++;
  }
  const cohorts: { areas: number; characters: number; separateCharacters: number }[] = [];
  while (tasks.length) {
    const selected = [tasks.shift()!]; let group;
    for (let i = 0; i < tasks.length && selected.length < 4;) {
      const combined = prepareDefinitionChangeGroup(current, [...selected, tasks[i]!]);
      if (combined) { selected.push(tasks.splice(i, 1)[0]!); group = combined; } else i++;
    }
    const separateCharacters = selected.reduce((n, t) => n + t.context.manifest.characters, 0);
    cohorts.push({ areas: selected.length, characters: group?.context.manifest.characters ?? separateCharacters, separateCharacters });
  }
  console.log(JSON.stringify({ revision: current.revision, assessmentCount: current.assessments.length, preservedBaselines,
    individualOrFullReviewRequired: unavailable, cohorts, separateRequests: cohorts.reduce((n, c) => n + c.areas, 0), groupedRequests: cohorts.length,
    note: "Fresh context-fit estimate only, not saved-job scheduling eligibility or semantic verdicts. Paid compatible work takes precedence in the app. Omitted evidence may require individual source review and further requests. Original data unchanged." }, null, 2));
} finally { db.close(); }
