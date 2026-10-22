import { decisionAvailability } from "./decision-availability.js";
import { requirementEvidenceIDs, type Analysis, type Job, type Project, type Submission } from "./model.js";
import { proposeRefinements } from "./refinement.js";

/** Apply only explicit, current-batch intent. The model judges semantic fidelity;
 * these structural gates cannot prove that prose faithfully captures an answer. */
export function applySpecificationUpdates(before: Project, project: Project, result: Analysis, aliases: Map<string, string>, job: Job, submissions: Submission[], newID: () => string) {
  const changes = result.specificationUpdates?.changes ?? [];
  if (!changes.length) return;
  if (!job.context?.submissionIDs?.length || job.context.refinementOnly || job.context.epicReview || job.context.gapExploration) throw new Error("Automatic specification updates require concrete queued human input, not scans, gap checks or refinement passes.");
  const included = new Set(job.context.includedIDs);
  const batch = submissions.filter((s) => job.context!.submissionIDs!.includes(s.id) && s.applied);
  const eligible = new Set(requirementEvidenceIDs(project));
  const inputs = new Set(batch.filter((s) => s.input.type === "note" || s.input.type === "answer" && s.input.answer.kind === "answer"
    || s.input.type === "review" && s.input.action === "changes-requested").flatMap((s) => s.appliedSourceID ? [s.appliedSourceID] : [])
    .filter((id) => eligible.has(id) && included.has(id)));
  const waiting = submissions.filter((s) => !job.context!.submissionIDs!.includes(s.id));
  const seen = new Set<string>();
  let applied = 0;
  for (const change of changes) {
    const id = aliases.get(change.requirementID) ?? change.requirementID;
    if (seen.has(id)) throw new Error("Automatic specification updates repeat a target.");
    seen.add(id);
    if (!change.sourceIDs.length || new Set(change.sourceIDs).size !== change.sourceIDs.length || change.sourceIDs.some((id) => !inputs.has(id))) throw new Error("Automatic specification updates must cite current concrete answers, notes or change requests from this batch; delegation, deferral, reviews and workspace observations cannot authorize them.");
    const old = before.requirements.find((r) => r.id === id);
    const target = project.requirements.find((r) => r.id === id);
    const created = !old && result.requirements.some((r) => r.localID === change.requirementID && aliases.get(r.localID!) === id);
    if (!target || (!created && (!old || !included.has(id) || old.sourceIDs.some((id) => !included.has(id))))
      || target.status === "rejected" || !project.epics.some((e) => e.id === target.epicID && !e.archived)) throw new Error("Automatic specification updates need an active detailed target and its complete supporting evidence.");
    if (batch.some((s) => s.answerScope && !s.answerScope.requirementIDs.includes(id)
      || s.input.type === "review" && s.input.action === "changes-requested" && s.input.requirementID !== id)) throw new Error("Automatic specification update exceeds the human input's exact target scope.");
    if (result.reviewChanges?.some((c) => c.type === "archive-feature" ? c.epicID === target.epicID : c.requirementID === id)
      || result.refinements?.some((p) => p.requirementID === id || p.resolution?.relatedRequirementID === id)
      || result.pendingChanges?.changes.some((c) => c.type !== "revise-question" && c.requirementID === id && (c.type !== "revise-requirement" || change.type !== "activate"))) throw new Error("Automatic specification updates cannot combine competing changes to a target.");
    if (change.type === "activate" && (!created && !["proposed", "needs-review"].includes(target.status)
      || change.sourceIDs.some((id) => !target.sourceIDs.includes(id)))) throw new Error("Activation must capture current input in a new or revised unapproved requirement.");
    if (change.type === "revise" && (!old || !["accepted", "needs-review"].includes(old.status))) throw new Error("Automatic revisions require an existing active specification requirement.");
    // Safe exceptions stay visible without failing the user's successfully processed answer.
    const availability = decisionAvailability(project, [id], waiting);
    if (availability.state !== "ready" || project.refinements.some((p) => p.status === "pending" && (p.requirementID === id || p.resolution?.relatedRequirementID === id))) {
      if (change.type === "revise") proposeRefinements(project, [{ requirementID: id, statement: change.statement, rationale: change.rationale, acceptance: change.acceptance,
        reason: `Automatic update held for a decision: ${change.reason}` }], newID);
      project.roundChanges.push(`Needs your decision: ${target.statement}. ${availability.reason ?? "A replacement proposal is awaiting a decision."}`);
      continue;
    }
    if (change.type === "revise") Object.assign(target, { statement: change.statement, rationale: change.rationale, acceptance: [...change.acceptance] });
    target.sourceIDs = [...new Set([...target.sourceIDs, ...change.sourceIDs])];
    target.status = "accepted";
    if (target.reviewNote === "Supporting human response changed; review against the current answer.") delete target.reviewNote;
    target.authority = { format: 1, kind: "answer-derived", sourceIDs: [...change.sourceIDs], reason: change.reason, atRevision: project.revision + 1 };
    // Keep old human confirmations as dated evidence. Never manufacture or supersede them.
    project.roundChanges.push(`${created ? "Added" : "Updated"} from your answer: ${target.statement} — ${change.reason}`);
    applied++;
  }
  if (applied) project.roundChanges.push(`Specification updated automatically from explicit input: ${applied} requirement${applied === 1 ? "" : "s"}. No separate approval or coding was started.`);
}
