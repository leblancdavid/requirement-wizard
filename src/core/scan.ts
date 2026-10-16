import type { Analysis } from "./model.js";

/** Scan requirements cannot be referenced by organization operations, so their
 * optional model-local IDs are unnecessary. Durable IDs are assigned on apply. */
export function prepareScanAnalysis(result: Analysis): Analysis {
  if (result.questions.length || result.retireQuestions.length || result.assessments?.length || result.researchFindings?.length || result.organization?.some((op) => op.type !== "upsert" || !op.epicID.startsWith("new:"))) throw new Error("Scans may only add feature and requirement proposals; review precedes gap discovery.");
  const epics = new Map<string, string>();
  const organization = result.organization?.filter((op) => {
    if (op.type !== "upsert") return false;
    const definition = JSON.stringify(op);
    const previous = epics.get(op.epicID);
    if (previous !== undefined) {
      if (previous !== definition) throw new Error(`Epic alias ${JSON.stringify(op.epicID.slice(0, 120))} has conflicting definitions. Each new feature needs a unique new: alias. No scan proposals applied; resume to regenerate this batch.`);
      return false; // Exactly repeated declarations have one unambiguous meaning.
    }
    epics.set(op.epicID, definition);
    return true;
  });
  return { ...result, organization, requirements: result.requirements.map(({ localID: _, ...requirement }) => requirement) };
}
