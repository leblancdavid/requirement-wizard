# Product specification

Status: planning baseline, revision 0.2 (browser-first epic discovery). Requirements below define intended
behavior; they are not claims of implemented functionality. Technical proposals
and unresolved details are recorded in [decisions.md](decisions.md).

## 1. Purpose and audience

Help technical and nontechnical users discover the consequential decisions needed
to build software, without requiring them to write a complete specification from
scratch. Produce a coherent, reviewable release specification and phased AI build
packages while keeping assumptions and unresolved choices visible.

Success means a fresh coding session can implement the selected release with fewer
material guesses and clarifications. Document length and question count are not
success measures.

## 2. Initial release scope

Include a browser workspace and terminal client, shared local projects,
ChatGPT subscription connections through OpenCode, adaptive interviews,
source-backed research, specification review, readiness assessment, and portable
OpenCode handoffs.

GitHub Copilot support is deferred and is not an initial-release acceptance gate.
A desktop wrapper remains a follow-on delivery target.
An integrated coding workspace follows the initial release. Hosted collaboration,
cloud synchronization, direct-provider adapters, and autonomous deployment are
outside this release.

## 3. Main journey

1. Connect a provider and select an available model.
2. Create a project and describe the idea in ordinary language.
3. Review the initial interpretation, goals, likely actors, and assumptions.
4. Answer a small batch of related questions; request research or explanations.
5. Review resulting specification changes and explore concrete scenarios.
6. Resolve material gaps or explicitly defer/delegate decisions within a scope.
7. Select and review a release baseline.
8. Generate dependency-aware phases and export an OpenCode handoff.
9. Revise the project as new information arrives; identify affected build packages.

Users can pause, restart, switch models, and move between clients during discovery.

## 4. Requirements and acceptance criteria

### Project lifecycle and interfaces

**RW-001 — Local project persistence.** Store projects, interview state, sources,
decisions, specifications, and work status locally.

- After restart, a saved project retains its answers, pending questions, and revision.
- A failed model call does not discard already saved human input.

**RW-002 — Browser and terminal continuity.** Both clients use the same project model
and support the main journey, including review and export.

- A project created in the terminal can be continued in the browser and vice versa.
- Concurrent edits cannot silently overwrite one another; a stale edit receives a
  refresh/retry response.

**RW-003 — Adjustable explanation depth.** Use plain language by default and offer
technical detail, tradeoffs, and recommendations per question.

- Expanding an explanation does not alter the selected answer.
- Users can supply technical constraints directly without following every suggested option.
- Unfamiliar concepts in question text, rationale, and suggested answers can carry
  subtle inline explanations of meaning and practical impact. Explanations open on
  hover, keyboard focus, or tap and can be dismissed without selecting an answer.
- Each question offers simpler rephrasing, explanation of why it matters, concrete
  examples, contextual decision support, and free-text clarification follow-ups.
- Rephrasing preserves the original decision, constraints, and options. Recommendations
  distinguish known human preferences from assumptions and ask for missing context.
- Help retains the original question and draft answer. Requests and responses are
  saved as revision-linked advisory exchanges, never automatically as answers,
  delegated choices, or confirmed requirements. Loading, cancellation, failure,
  interruption, and stale-context states are visible; retries require user action.

### Providers and model work

**RW-004 — Subscription connections.** Support ChatGPT subscription access through
supported OpenCode connection flows, with no separate API key required for that flow.
GitHub Copilot support is deferred.

- Verify ChatGPT with an authenticated live response during milestone 1.
- Show actionable states for missing runtime, disconnected account, expired login,
  unavailable model, and provider limits when reported by the runtime.
- Initial onboarding may hand off to OpenCode's own connection interface.

**RW-005 — Model selection.** List connected providers and available models; allow
selection and switching for subsequent calls while preserving project state.

- Record the actual provider/model reported for each call when available.
- An unavailable selected model is surfaced; do not silently select another provider.

**RW-006 — Observable, interruptible work.** Show running work and support cancellation,
bounded retries, and restart recovery.

- Cancellation leaves project records in a consistent state and allows another call.
- Interrupted work is distinguishable from completed work after restart.
- Display usage and cost when reported; mark unavailable values as unknown.

### Adaptive discovery

**RW-007 — Initial interpretation.** Extract candidate goals, actors, constraints,
scope, assumptions, and unknowns from the initial idea.

- Preserve the original prompt as a source.
- Inferred features are proposals, not automatically confirmed requirements.

**RW-008 — Adaptive question batches.** Generate small related batches, normally
three to five questions, prioritized by impact, uncertainty, and dependencies.

- Explain why a question matters and the consequences of its options.
- Support custom text, help deciding, deferral, and scoped delegation.
- Re-evaluate outstanding questions after answers; retire irrelevant ones with a reason.
- Avoid re-asking resolved questions unless new or conflicting information warrants it.

**RW-009 — Scenario walkthroughs.** Explore happy paths, alternatives, and failures
for important workflows.

- A scenario can expose a new decision and link it to the affected workflow.
- Include relevant permissions, invalid inputs, retries, and partial failures rather
  than applying every edge-case question to every project.

**RW-010 — Targeted research.** Research explicit uncertainties using configured
search/fetch tools and retain source URLs, retrieval dates, findings, and limitations.

- Link findings to the question or decision they inform.
- Distinguish documented claims, AI interpretations, and recommendations.
- A tool failure is shown as incomplete research; fabricated citations cannot
  substitute for retrieved evidence.
- Apply a configured research/tool-call budget and allow cancellation.

### Living specification

**RW-011 — Structured, traceable records.** Maintain stable IDs for goals, actors,
workflows, requirements, decisions, questions, sources, scenarios, and work packages.

- Link requirements to their sources/decisions and acceptance scenarios.
- Distinguish human statements, human selections, delegated choices, AI proposals,
  and research findings.
- Research alone cannot establish a user's product preference.

**RW-012 — Reviewable revisions.** Show material changes after an interview round
and allow editing, accepting, or rejecting proposed requirements.

- Record selection of an answer as an explicit decision with its original question.
- Preserve previous revisions and the rationale for superseded decisions.
- Revising a decision identifies dependent records for review; do not silently
  rewrite previously confirmed intent.

**RW-013 — Coverage and conflicts.** Review applicable areas such as goals, workflows,
data lifecycle, permissions, integrations, quality constraints, and operations.

- Show contradictions and missing acceptance scenarios with record references.
- Track areas as reviewed, unresolved, deferred, or not applicable, with explanations.
- Report checklist coverage rather than claiming exhaustive discovery of all requirements.

**RW-014 — Release readiness.** Assess readiness for a selected scope and revision.

- Report specific blockers and deferred/delegated decisions.
- Block a ready assessment on unresolved material contradictions and missing critical
  workflow behavior or acceptance scenarios.
- Record the user's explicit baseline review separately from AI readiness assessment.
- Changing relevant scope or decisions makes the assessment require re-review.

### Planning and handoff

**RW-015 — Implementation planning.** Generate phases and work packages linked to
requirements, with dependencies, acceptance scenarios, constraints, and deliverables.

- Favor end-to-end functional slices and early investigations for uncertain dependencies.
- Every in-scope requirement maps to work; technical tasks have a recorded rationale.
- Validate references and reject dependency cycles.
- Material changes mark affected plans as needing review.

**RW-016 — Portable handoffs.** Export human-readable Markdown and structured JSON
for the selected baseline and implementation phases.

- Include revision identity, project overview, decisions, unresolved choices,
  requirements, acceptance scenarios, and per-phase instructions.
- A fresh OpenCode session can use the package without the original interview chat.
- Export into an explicitly selected destination without silently replacing existing files.

### Epic discovery and visual progress

**RW-017 — Playable browser workspace.** Provide project selection/creation,
clickable questions, free-form input, requirement review, progress, and cancellation.

- Normal discovery/review does not require copying IDs.
- Existing persisted projects remain usable without losing human input or history.
- Default to a compact question list with one expanded answer form, feature/category
  context, and visible previous/submitted-response editing. Preserve drafts while
  switching questions in the current page; saving a correction retains earlier input.
- Replace waiting answers atomically; processing-time corrections wait for the next
  round. Never let a correction silently overwrite a newer answer or active snapshot.
- Group requirements under expandable features in Project map; show progress,
  supporting evidence, settings, and diagnostics on demand rather than as permanent
  competing columns. Use plain-language labels without implying build readiness.

**RW-018 — Living epic organization.** Each round can create/edit epics, assign
records, split/merge areas, and identify dependencies.

- Routine organization of unconfirmed material is automatic and visible.
- Changes affecting confirmed information require review; stale proposals are rejected.
- Splits/merges preserve records and identities, reject cycles, and invalidate inherited assessments.
- Restoring an earlier map preserves current answers and requirement decisions.

**RW-019 — Estimated completeness.** Assess applicable coverage areas per epic and
show a deterministic project aggregate with explanations and evidence.

- Unknown areas remain visible; unconfirmed proposals cannot count as fully defined.
- Show critical gaps, assessment freshness, and qualitative scope confidence separately.
- Explain that newly discovered scope can lower the estimate; even 100% is not proof of readiness.
- Expose the rubric and the supporting records behind each assessment.

**RW-020 — Bounded AI context.** Assemble fresh, revision-bound working sets with
global information, focused epics, dependencies, exact evidence, and omission manifests.

- Summaries do not replace original human decisions.
- Reject oversized calls before inference rather than silently truncating decisions.
- Reject generated references outside the detailed working set; support focused rounds.
- Record the context revision, selection, budget, and usage metadata available from the runtime.

## 5. Quality expectations

- Windows is the first verified platform; keep the engine portable for future platforms.
- Keep credentials out of project records and exports; let the runtime own provider auth.
- Validate model output before applying changes; malformed output cannot partially
  overwrite the specification.
- Preserve original human input and distinguish it from summaries.
- Keep desktop provider/runtime access in the local service, outside the renderer.
- Use deterministic fixtures for routine workflow checks and opt-in live checks for
  actual provider compatibility. Fixtures do not prove subscription support.
- Discovery receives research/project tools appropriate to its task; coding capabilities
  belong to the later build workflow.

## 6. Release evaluation

Exercise at least three contrasting project ideas, including one integration-heavy
project, before declaring the initial release ready. Use one small project end to end
through a fresh OpenCode coding session.

Record material clarifications requested by the builder, unsupported assumptions,
acceptance scenario outcomes, user corrections, interview effort, and available usage
telemetry. Establish observed baselines before setting numerical improvement targets.

An AI readiness assessment is useful evidence, not proof of product completeness or
successful implementation.
