import type { Project } from "../core/model.js";
import { eligibleRequirements, assessmentCurrent, type ExecutionState } from "../core/execution.js";
import { checkExecutionContext, ExecutionContextError, requirementTaskContext } from "../core/execution-context.js";
import { shareRepeatedIdentifiers, shareRepeatedText, shareRecordStructure } from "../core/working-set.js";

/** Exact wire compression only; original records and identities are untouched. */
export function planningWire(data: unknown) {
  let best = JSON.stringify(data);
  const text = shareRepeatedText(data, true, true).data;
  const ids = shareRepeatedIdentifiers(text, true).data;
  for (const candidate of [text, ids, shareRecordStructure(ids, ["evidence", "guardrails", "supportingRequirements", "behaviorIndex", "epics"], true).data]) {
    const json = JSON.stringify(candidate); if (json.length < best.length) best = json;
  }
  return best;
}

export function planningAssessment(project: Project, state: ExecutionState, requirementID: string) {
  const assessment = state.assessments[requirementID];
  return { current: assessmentCurrent(project, state, requirementID), status: assessment?.status,
    policy: "Historical assessment metadata only, not current code evidence or branch availability. Full assessment payloads remain saved, are not supplied here and cannot support planning claims." };
}

/** Optional dependency candidates never displace the exact mandatory target closure. */
export function implementationPlanningContext(project: Project, state: ExecutionState, requirementID: string) {
  const context = requirementTaskContext(project, requirementID, state.config!.dependencies[requirementID] ?? [], false, state.config!.dependencies);
  const requirements = eligibleRequirements(project);
  const target = context.data.requirement;
  const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const targetTokens = tokens([target.statement, ...target.acceptance].join(" "));
  const represented = new Set([target.id, ...context.data.guardrails.map((r) => r.id), ...context.data.supportingRequirements.map((r) => r.id)]);
  const ranked = requirements.filter((r) => !represented.has(r.id)).map((r, index) => ({ r, index,
    score: [...tokens([r.statement, ...r.acceptance].join(" "))].filter((word) => targetTokens.has(word)).length + (r.epicID === target.epicID ? 5 : 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const behaviorIndex: { id: string; epicID: string; statement: string; acceptance: string[] }[] = [];
  const evidenceIDs = () => [...new Set([...represented, ...behaviorIndex.map((r) => r.id), ...context.data.evidence.map((s) => s.id),
    ...context.data.questions.map((q) => q.id), ...context.data.research.map((r) => r.id), ...project.epics.map((e) => e.id)])];
  const assessment = planningAssessment(project, state, requirementID);
  const sections = () => ({ project: { name: project.name, summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions, epics: project.epics },
    target: context.data, behaviorIndex, evidenceIDs: evidenceIDs(), existingDependencies: state.config!.dependencies, assessment,
    dependencyScope: { omittedRequirements: ranked.length - behaviorIndex.length,
      policy: "Candidates are ranked by shared behavior words and feature, not proof of dependency coverage. Exact selected behavior is retained. Omitted requirements are unreviewed, not independent. Do not propose prerequisites outside the supplied exact requirement records. Human review must resolve omitted dependency scope before approval." } });
  const prompt = (compact = false) => `Propose exactly ONE work package for approved target ${requirementID}, using supplied exact behavior to identify prerequisites. Include supporting technical steps and verification tied to acceptance scenarios. Do not add scope. Hard dependencies require concrete necessity; preferences only guide order. Existing epic and configured prerequisites remain guardrails. Shared foundations belong in the earliest supporting requirement; expose inseparable or ambiguous scope as questions. Assessments are historical and dated, not proof of current code or execution-branch availability. No new source capture was performed. Suggest Check progress when availability is uncertain. Cite only supplied evidenceIDs. Unrelated omitted human history cannot justify proposals. Omitted dependency candidates cannot establish absence of prerequisites.\n${compact ? planningWire(sections()) : JSON.stringify(sections())}`;
  // Reserve space for omission counts changing as candidates are added.
  let compact = false;
  const fits = (allowCompact = false) => {
    try { checkExecutionContext(prompt(compact) + " ".repeat(100), false, requirementID, 0, true); }
    catch (error) {
      if (!(error instanceof ExecutionContextError) || !allowCompact) throw error;
      compact = true; checkExecutionContext(prompt(true) + " ".repeat(100), false, requirementID, 0, true);
    }
  };
  try { fits(true); } catch (error) {
    if (!(error instanceof ExecutionContextError)) throw error;
    const sizes = Object.entries(sections()).map(([name, value]) => `${name}: ${JSON.stringify(value).length.toLocaleString()}`).join(", ");
    throw new PlanningContextOverflow(`${error.message} Mandatory planning context alone exceeds the limit; no optional dependency candidates were included. Section characters: ${sizes}. Exact staged planning is required; splitting a requirement may not reduce shared context.`);
  }
  for (const { r } of ranked) {
    behaviorIndex.push({ id: r.id, epicID: r.epicID, statement: r.statement, acceptance: r.acceptance });
    try { fits(); } catch (error) {
      behaviorIndex.pop();
      if (!(error instanceof ExecutionContextError)) throw error;
      // An oversized candidate must not prevent smaller exact candidates fitting.
    }
  }
  const omitted = sections().dependencyScope.omittedRequirements;
  return { prompt: prompt(compact), evidenceIDs: evidenceIDs(), requirementIDs: new Set([...represented, ...behaviorIndex.map((r) => r.id)]),
    reviewQuestion: omitted ? `Dependency coverage is incomplete: ${omitted} approved requirement(s) were omitted from this package's bounded context. Review their exact behavior and resolve any additional prerequisites before approving.` : undefined };
}

export class PlanningContextOverflow extends Error {}
