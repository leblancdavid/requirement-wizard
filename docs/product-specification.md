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
ChatGPT subscription connections, adaptive interviews,
source-backed research, specification review, readiness assessment, and portable
OpenCode handoffs.

GitHub Copilot support is deferred and is not an initial-release acceptance gate.
An Electron desktop wrapper is implemented under DEC-017, reusing the browser UI
and local engine. Closing its window cancels owned active work and quits; saved
state remains available and interrupted work requires explicit resume. See
[desktop.md](desktop.md) for packaging and verified versus outstanding release checks.
DEC-018 brings source-folder initialization and manual rescanning forward from M7.
Read-only evidence capture produces reviewable definitions before gap discovery.
Broader existing-project change planning/handoffs and automatic watching remain later work.
DEC-023 brings an integrated Implementation workspace pilot forward independently of
unfinished portable handoffs/readiness work. Live coding and GitHub delivery remain
unqualified. Hosted collaboration, cloud synchronization and autonomous deployment
are outside this release.
DEC-015 adds staged direct-provider migration: direct ChatGPT discovery/help and
in-app connection management are implemented alongside legacy OpenCode selections.
Direct research remains unsupported; direct live verification and distribution
eligibility remain open; see [direct-providers.md](direct-providers.md).

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
- Proactively explain technical and context-dependent terms. Any other word in a
  question, rationale, or suggested answer offers a **? What do you mean by this?**
  shortcut to contextual clarification, with visible loading feedback.
- Each question offers simpler rephrasing, explanation of why it matters, concrete
  examples, contextual decision support, and free-text clarification follow-ups.
- Rephrasing preserves the original decision, constraints, and options. Recommendations
  distinguish known human preferences from assumptions and ask for missing context.
- Help retains the original question and draft answer. Requests and responses are
  saved as revision-linked advisory exchanges, never automatically as answers,
  delegated choices, or confirmed requirements. Loading, cancellation, failure,
  interruption, and stale-context states are visible; retries require user action.

### Providers and model work

**RW-004 — Subscription connections.** Support ChatGPT subscription access with no
separate API key required for that flow. Move toward app-owned sign-in and connection
management without requiring OpenCode, subject to direct-flow qualification (DEC-015).
GitHub Copilot support is deferred.

- Verify ChatGPT with an authenticated live response during milestone 1.
- Show actionable states for missing runtime, disconnected account, expired login,
  unavailable model, and provider limits when reported by the runtime.
- Initial onboarding may hand off to OpenCode's own connection interface.
- The direct path must validate identity and plan permission, protect local credentials,
  and support reconnect/disconnect without placing credentials in project records.
- Browser Settings supports sign-in, account/model catalogs, explicit allowance-using
  connection tests/cancellation, and project selection before or after creation.
- A disconnected direct selection reports an error without falling back to OpenCode.

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
- State requirements and acceptance scenarios as detailed observable behavior. Keep
  code identifiers, internal architecture and incidental tuning values in supporting
  evidence rather than product commitments. Preserve explicit human constraints,
  meaningful numeric product rules and quality/compatibility obligations.

**RW-012 — Reviewable revisions.** Show material changes after an interview round
and allow editing, accepting, or rejecting proposed requirements.

- Record selection of an answer as an explicit decision with its original question.
- Preserve previous revisions and the rationale for superseded decisions.
- Revising a decision identifies dependent records for review; do not silently
  rewrite previously confirmed intent.
- Provide a dedicated requirement Review queue beside Questions, with optional
  addenda, approve/reject actions, automatic advance, and durable AI follow-up.
- Apply clearly requested wider changes from review addenda with linked provenance;
  ask targeted questions when scope is ambiguous. Revised wording returns to review,
  and removed features retain their records/history (DEC-020).
- Discovery includes requirement refinement, with an explicit refinement action for
  existing projects. Proposed and approved requirements are eligible; rejected or
  archived requirements are excluded. Cleanup is a separate pending proposal showing
  original/replacement wording, acceptance scenarios and the reason (DEC-022).
- Present refinements as individual expandable items in Review alongside new/revised
  requirements, with a dedicated Refinements filter, consistent counts, and clear
  proposed-work badges separate from the active requirement's approval status.
  Approve refinement or keep current wording, advance after successful decisions,
  and retain both outcomes with before/after comparisons in Reviewed history.
- Preserve active wording and approval until the replacement is explicitly approved.
  Keep IDs, sources and revision history. Reject stale approvals, retain dismissals,
  and suppress repeated suggestions for the same unchanged requirement. Refinement
  may use only detailed requirements with their full supporting evidence in context;
  missing intent needs clarification, not an invented rule.
- Explicit cleanup processes requirements individually with their exact linked evidence
  and applicable human guardrails. Save each completed check, including no-change
  results, and resume unfinished work on explicit retry without repeating unchanged
  completed checks. Never discard mandatory constraints to fit an individual task.

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
- Accepted background requirements retain exact decisions and human approval evidence;
  their original workspace-only motivation may be explicitly omitted from partial
  tasks. Current task and unconfirmed requirement files remain pinned. Omitted file
  links must be reported and cannot support claims or citations.
- Process queued responses individually, with one revision-linked AI job and focused
  context per submission. Preserve target evidence and project/dependency guardrails;
  explicitly omit unrelated same-feature history and checkpoint each completed item.
- Apply lossless text, identifier, and structural compaction against the normal
  target before expanding mandatory-only context. Single-submission follow-up must not
  refill recovered space with unrelated feature records or combine waiting responses.
- Partial passes cannot replace global interpretation or whole-area assessments, or
  reorganize areas. Retirements and organization changes require detailed records.
- Reject oversized calls before inference rather than silently truncating decisions.
- Preflight queued follow-up before creating an AI job. Persist indivisible budget
  blockers on saved submissions, let fitting responses proceed, and recheck scope on
  explicit resume without duplicating human sources or failed jobs for unchanged input.
- Reject generated references outside the detailed working set; support focused rounds.
- Record the context revision, selection, budget, and usage metadata available from the runtime.

### Existing-project discovery (initialization/rescan implemented; planning follow-on)

**RW-021 — Evidence-backed project reconstruction.** Import a selected local source
folder and propose a structured understanding of its goals, actors, epics, workflows,
business rules, integrations, and technical constraints.

- Inspect documentation, source, tests and configuration without modifying source
  files or running scripts. Offer initialization during creation and after workspace
  connection, with an optional idea for source initialization. Generate initial
  definitions/requirements, then stop for review before missing-requirement discovery.
  Existing specification documents are evidence, not structured imports.
- Explicitly distinguish a new idea from an existing project. Existing-project entry
  selects the folder first and suggests editable title/description/type from local
  metadata and documents without inference. Preserve extraction provenance and manual
  edits. Reject changed preview evidence before creation. Incomplete initialization
  must offer retry rather than silently starting an idea interview.
- Allow users to retire unrelated unanswered questions individually or in a batch,
  retaining reasons/history and protecting answered or queued input. After a successful
  scan, offer replacements tied to detailed baseline evidence and specific gaps/conflicts.
- Record inspected and omitted scope, analysis limitations, and snapshot identity.
  Link each finding to file evidence at that snapshot; a Git commit alone is insufficient
  when selected files contain uncommitted or untracked content.
- Keep observed implementation behavior, documented/tested intent, AI-inferred
  requirements, user-confirmed requirements, and requested changes distinguishable.
  Static inspection and test definitions do not establish successful runtime behavior.
- Present inferred requirements for acceptance, correction, or rejection. Code behavior
  does not automatically establish desired behavior or increase confirmed completeness.
- Ask targeted questions about missing intent, conflicting evidence, and incomplete
  workflows; preserve unknowns rather than inventing a complete specification.
- Preserve prior human input and apply validated results atomically with expected-revision
  checks. Failed, cancelled, interrupted, or stale analysis cannot confirm requirements.
- Offer explicit folder rescanning, retained evidence, inspected-file changes and
  omission reports. Preserve accepted/rejected decisions and stable IDs; expose affected
  requirements for review. Fixed budgets limit coverage; automatic watching is deferred.

**RW-022 — Feature work from a reviewed existing-project baseline.** Use reviewed
project understanding to discover and plan new or revised behavior.

- Capture the requested change separately from existing behavior and ask questions in
  the context of affected workflows, constraints, integrations, and dependencies.
- Review which behavior should be retained, changed, or left unresolved. A discovered
  defect is not automatically a preservation requirement.
- Produce acceptance scenarios for the change and relevant behavior to preserve, with
  links to reviewed requirements and imported evidence.
- Export a change-focused handoff identifying the specification revision, source
  snapshot, affected areas, additions/modifications, preservation scenarios, and unknowns.
  Impact analysis remains an estimate, not a claim of exhaustive dependency coverage.
- Keep the initial imported baseline tied to its captured snapshot; do not imply that
  a one-time analysis stays synchronized with subsequent source changes.

### Local project workspaces and implementation tracking

**RW-023 — Persistent local workspace.** Connect each project to a local directory
and automatically save revision-linked requirements and progress Markdown/JSON.

- Support selection/creation at project creation and connection/reconnection for
  existing projects in both clients; show path, sync status, and saved revision.
- Keep portable artifacts separate from machine-local bindings and provider credentials.
- Retain saved app changes when a directory becomes unavailable. Recover interrupted
  saves without repeating model calls; serialize app/CLI publishers sharing storage.
- Detect external edits and ownership collisions before replacement. Disconnecting
  retains files and project data. Initial files are app-generated outputs.
- Split requirements/questions by stable feature ID with a project overview and shared
  evidence references. Preserve original inputs without embedding them in each feature.
- Keep unchanged outputs byte-identical without rewriting them, and reference requirement
  statements from progress. Version the manifest and preserve external edits during
  migration/retired-file cleanup. Offer a combined specification export on demand (DEC-021).

**RW-024 — Manual implementation progress.** Track not-started, in-progress, blocked,
implemented, and verified states per requirement independently of requirements review
and discovery coverage.

- Record notes and verification evidence; verified requires nonblank evidence and
  represents a human assessment rather than an automatically executed check.
- Preserve previous assessments/evidence and flag them for review when a requirement's
  statement, acceptance criteria, or requirements-review status changes.
- Apply expected-revision checks, retain history, and save progress into the connected
  workspace. Current progress counts must exclude stale implementation assessments.

### Integrated implementation pilot (DEC-023)

**RW-025 — Evidence-backed implementation workspace.** Add Implementation beside Review,
matching existing tabs, compact rows, feature groups, theme/appearance and responsive
behavior. Its badge counts accepted active requirements not delivered to main.

- Assess approved requirements and every acceptance scenario against bounded captured
  file evidence, preserving hashes, paths/line ranges, HEAD, scope and omissions.
- Distinguish complete, partial, missing and unknown; omitted scope is not missing.
  Test definitions/static evidence do not establish executed verification.
- Group by epic, recommend prerequisite-first order and explain blockers. Validate
  cycles and unknown dependencies. Offer Implement per requirement/epic and Continue.
- Start epic drawers collapsed. Search epic names/purposes and requirement text, IDs
  and acceptance scenarios, combined with feature/status filters. Show matching counts
  and an actionable empty state; presentation filters do not alter execution scope.

**RW-026 — Sequential local execution and recovery.** Run OpenCode locally in isolated
repository worktrees with explicit coding model/connection settings, separate from
discovery. Persist sessions, frozen requirement/revision context and checkpoints.

- Execute one requirement at a time. Stop on failures, blockers, stale context or
  cancellation; preserve completed work and require explicit resume after interruption.
- Reconcile repository/session state before more work. Never silently replace a
  missing session or replay successful commits/PR creation. Retain archived runs.
- Run configured checks and assess acceptance before automatic commits. Exclude
  unrelated existing user changes. Commit titles/details identify the requirement,
  specification revision and verification. Preserve hooks and reject unexpected history.
- Serialize local workers sharing the project store/repository; preserve other workers'
  live leases. Closing the app cancels owned work and retains resumable state.

**RW-027 — GitHub delivery and completion.** Support PR per requirement, PR per epic,
commit/push to a named branch, or commit/push to main.

- Track assessment, execution and delivery independently. Verified branch work is not
  implemented until confirmed delivered to main for the current requirement fingerprint.
- PRs wait for user merge before the next delivery unit; no auto-merge. Epic PRs retain
  sequential requirement-specific commits. Reconcile merge metadata/current main,
  including squash/rebase cases, and block on closed-unmerged PRs or delivery failures.
- Recognize already-existing implementation through explicit main verification and
  assessment. Retain observed main SHA/time; refresh after external changes.
- Keep credentials/local execution details out of portable progress summaries.
  Manual RW-024 assessments remain historical evidence, not main-delivery confirmation.
- Require an installed compatible OpenCode initially; installer dependency management
  is a future option. Live qualification remains an explicit milestone exit check.

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
  belong to the separate Implementation workflow.

## 6. Release evaluation

Exercise at least three contrasting project ideas, including one integration-heavy
project, before declaring the initial release ready. Use one small project end to end
through a fresh OpenCode coding session.

Record material clarifications requested by the builder, unsupported assumptions,
acceptance scenario outcomes, user corrections, interview effort, and available usage
telemetry. Establish observed baselines before setting numerical improvement targets.

An AI readiness assessment is useful evidence, not proof of product completeness or
successful implementation.
