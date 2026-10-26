# Decisions and open questions

## Confirmed product direction

**DEC-033 — Clear workspace responsibilities and consolidated logs (2026-10-24).**
The user approved merging Project map into Specification, keeping the queue focused
on unfinished work, separating meaningful Activity from technical Logs, and replacing
duplicate viewers with brief status/deep links. Keep recovery and consequential
consent visible; preserve all saved evidence. See
[implemented boundaries and limits](workspace-navigation.md).

These choices come from the project conversation. They do not imply acceptance of
every technical detail proposed in the planning documents.

| ID | Decision | Source |
| --- | --- | --- |
| DEC-001 | Start from a human idea and iteratively research, ask questions, and define requirements. | Initial project request |
| DEC-002 | Serve technical and nontechnical users. | User selected both audiences |
| DEC-003 | Provide desktop and terminal experiences. | User selected both interfaces |
| DEC-004 | Originally prioritize GitHub Copilot and ChatGPT connections; initial-release provider scope superseded by DEC-007. | Original provider selection, retained as history |
| DEC-005 | Include work organization and implementation planning. | Initial project request |
| DEC-006 | OpenCode is an acceptable initial build integration; integrated coding is a future goal. | User's build-workflow preference |
| DEC-007 | Use ChatGPT for now and defer Copilot support. Copilot compatibility is not a current milestone or release gate. | User explicitly deferred Copilot support |
| DEC-008 | Prioritize a local browser application for the first playable visual experience. Desktop remains a later wrapper target. | User approved browser-first delivery |
| DEC-009 | Organize ideas into evolving epics, continually evaluate their gaps, and support splitting/merging/refining them. | User described the discovery workflow |
| DEC-010 | Automatically organize unconfirmed information; show changes and review changes affecting confirmed decisions. | User approved AI-driven organization |
| DEC-011 | Show estimated completeness for epics and the project, with explanations and explicit uncertainty. Manage AI context as part of the engine. | User requested progress feedback and appropriate context management |
| DEC-012 | Explain ambiguous concepts inline and offer question-level rephrasing, context, examples, and decision support without automatically answering the question. | User requested concept tooltips and clarification/help deciding, then approved the proposed behavior |
| DEC-013 | Make the browser question-first with a compact expandable list, visible answer revision, feature/category context, a grouped feature map, and on-demand progress/details. | User selected the compact question list, requested broader map/health/header cleanup, and approved implementation |
| DEC-014 | Add existing-project discovery as a follow-on after core review and portable handoffs: reconstruct evidence-backed requirements from a local source folder, review them with the user, and use them as the starting point for feature work. | User proposed importing existing projects and approved the recommended follow-on scope |
| DEC-015 | Move toward app-owned AI connections, authentication, and model selection without requiring OpenCode for discovery; start with a direct ChatGPT-plan compatibility spike. | User requested independence and approved the staged recommendation; distribution/license and live direct access remain unresolved |
| DEC-016 | Give each project a persistent local workspace connection with automatically generated requirements/progress files. Start with app-generated outputs and track both discovery and manual implementation progress, retaining external-edit conflicts for review. | User requested per-project local repos/workspaces, chose app-generated files and discovery plus implementation tracking, then approved implementation |
| DEC-017 | Build the desktop application with Electron. Closing the window quits and cancels active work, without tray/background mode or confirmation; retained work requires explicit resume. | User approved Electron implementation and specified quitting active work on close |
| DEC-018 | Bring source-folder initialization forward: offer it during creation and after workspace selection, plus explicit rescanning. Generate reviewable definitions/requirements before gap discovery. Existing specification documents are evidence alongside code/tests, not structured imports. | User requested initialization/rescan, selected review first and existing definitions as evidence, then approved implementation |
| DEC-019 | Explicitly distinguish New idea from Existing project. For existing projects, choose the folder first and suggest editable name/description from local metadata/documents, then initialize before gap discovery. Add unrelated-question cleanup and evidence-based replacements; improve Godot/source capture and incomplete-initialization recovery. | User reported irrelevant questions for Rust Grind Galaxy, requested existing-project identity autofill, then approved the combined implementation |
| DEC-020 | Add a dedicated Review tab with approve/reject, optional addenda, auto-advance and durable AI follow-up. Carry out clearly requested wider changes, including feature removal, preserving history; ask about ambiguous scope. Revised wording returns to review. This explicit-request path is an exception to DEC-010's additional organization-review step. | User requested a question-like review workflow, chose automatic application of explicit requests, and approved implementation |
| DEC-021 | Process queued AI follow-up one submission at a time, each with its own focused revision-linked context. Do not combine the queue or include unrelated feature history solely because it shares an area. Retain exact target evidence and explicit guardrails; preserve omitted records and request wider context when needed. | User requested individual processing/contexts after repeated queue-size blockers |
| DEC-021 | Split generated requirements by stable feature ID, keep original evidence in shared referenced files, and avoid rewriting unchanged outputs. Retain an on-demand combined specification export. | User reported large generated files and confirmed both reading/coding-agent context and disk/Git efficiency as goals after the feature-based export recommendation |

## Coordinated project workflow (DEC-032)

Confirmed continuation-control follow-up: the user approved consolidating normal
continuation into **Continue project**, with clear first-entry scope/allowance
explanation and narrow manual recovery under **Advanced actions**. Do not silently
relabel a scoped/manual Resume as authorization for project-wide coordination.
Waiting decisions show their status rather than a misleading resume action. Mode
configuration stays in Project settings; existing evidence and budgets are unchanged.

Confirmed direction (2026-10-23): the user approved coordinating idea → questions →
requirements → implementation-readiness while preserving existing views and evidence.
Faithful requirements become current automatically; choices/conflicts go to the user;
relevant changes trigger rechecks. Configuration stays in Project settings and
operational controls in Processing & queue, without the redundant What's next card.

Implemented opt-in preview: Continue project, shared allowance, decision inbox,
provenance/checkpoint reuse and revision-linked receipts. Do not manufacture approval
or promote legacy proposals. Specification checks passed differs from ready to
implement, which also requires a current reviewed plan and configuration; neither
authorizes coding. Automatic planning and delta-only assessments remain follow-on
work. See [coordinated workflow](coordinated-workflow.md).

Implemented readiness follow-up: the user selected targeted readiness questions as
the next slice. Current unresolved definition checks can request up to three scoped,
evidence-linked questions for one dimension using the same allowance. Answers
trigger affected rechecks, not automatic approval. Technical/evidence blockers stay
blocked; unchanged completed no-question tasks are reused across restart/Continue.
No automatic planning or coding authority is added.

## Guided workflow and bounded automatic maintenance (DEC-031)

Confirmed direction (2026-10-23): simplify the growing set of long-running operations
with one next-action recommendation and opt-in background maintenance after stories
and accepted decisions change. Preserve explicit approval, coding and delivery
boundaries, model-usage limits, Stop and no automatic repeat inference on restart.
The user approved the staged implementation recommendation in this conversation.

Originally implemented first slice: What’s next guidance, decision-triggered area scheduling,
twenty-second coalescing and eight-request/five-minute/three-area bursts, durable
blocked/paused tasks and explicit restart consent. Individual process actions remain
available. Delta-only evidence review and consolidating every advanced control are
follow-on work, not verified capabilities. See [guided maintenance](guided-maintenance.md).

Confirmed placement follow-up: maintenance is a per-project, machine-local setting.
The user approved configuration in Settings → Project settings, operational status
and pause/resume in Processing & queue, and only brief status/navigation in What’s
next rather than a maintenance configuration panel repeated across workspace tabs.

Superseding UI simplification: the user requested removal of the entire What’s next
card because it duplicated information already visible elsewhere. Its presentation
and card-only navigation helpers are removed; Design, Specification, Overall progress,
Processing & queue and Project settings retain the actual workflow controls.
Automatic maintenance, consent, saved preferences and task checkpoints are unchanged.

## Continuous specification (DEC-030)

Confirmed direction (2026-10-22): the user approved replacing routine requirement
approval with automatic creation/revision from explicit answers, visible changes and
review by exception. Product decisions belong in questions; faithfully restating an
answer should not require another approval. Preserve the distinction between explicit
human approval, answer-derived wording and AI inference. Keep coding authorization
separate. This supersedes DEC-020's mandatory rereview for eligible answer-derived
wording, not its preserved review-addendum/removal workflow.

Implemented first slice: bounded current-input `specificationUpdates`, additive
answer-derived authority, Specification / Needs your decision UI and portable evidence.
Legacy proposals/approvals, scans, pure cleanup and pair resolutions retain their
original review semantics. See [continuous specification](continuous-specification.md)
for boundaries and verification limits.

## Portable team project state (DEC-029)

Confirmed direction: commit `.reqwizit/` alongside code so a teammate can clone,
open in Reqwizit and continue saved requirements work without unnecessary repeated
assessment/model calls. Preserve sufficient current decisions, original evidence,
unresolved input, reusable results and continuation checkpoints—not every user action
or historical database snapshot. Accounts, folder bindings, processes and logs remain
local. Safely migrate legacy `.requirement-wizard/` folders without discarding existing
work. Start with coordinated editing per branch and explicit conflict-safe adoption;
automatic concurrent merging and local-history deletion are not in scope.

The first implementation uses manifest 3 plus independently versioned continuation
artifacts and explicit browser/API/terminal opening. See
[project workspaces](project-workspaces.md) and [migration ledger](migrations.md).
Cross-machine coding sessions/worktrees are not reconstructed. Deterministic clone/
assessment reuse is tested; real-project/live cross-machine workflows remain unqualified.

## Epic-by-epic alternative (DEC-028)

Confirmed direction (2026-10-21): the user approved changing gap discovery toward
epic/workflow reviews, preparing evidence locally, combining lenses, checking cross-epic
boundaries and reusing unaffected reviews rather than repeatedly increasing allowances.
Implemented first slice originally added **Review next epic workflow** alongside legacy discovery;
the approved 2026-10-22 UI consolidation now presents it as the single **Design →
Explore next gaps** action, with a compact **Questions ready** target and no discovery
controls in Review. Legacy API/terminal discovery and saved-job recovery remain.
Workflow mode uses deterministic bounded candidate packages (not inferred/named workflows), exact linked
evidence, one extra evidence batch and separate progress/check identities. Declared
dependency boundaries receive bounded counterpart passes, not exhaustive integration
coverage. Existing saved work is preserved. Live usefulness and provider cost reductions
remain unqualified; see [epic workflow review](epic-workflow-review.md).

## Explicit bounded gap-exploration continuation

Confirmed direction (2026-10-21): after a saved task exhausted the three-request evidence
allowance, the user approved an explicit **Continue exploration** recovery action that
preserves saved work and grants a bounded additional allowance. Implemented policy: up
to three additional requests once for the same evidence-bound task, at most six attempts
and five navigation stages across retries. Ordinary Resume never silently expands the
allowance; original evidence, provider selection, research permissions and hard context
limits remain protected. See [browser behavior](browser-workspace.md#explicit-additional-exploration-allowance)
and [upgrade compatibility](migrations.md#explicit-one-time-gap-continuation-allowance).

## Narrower Design/Review blockers (DEC-027)

Confirmed direction (2026-10-21): the user requested implementation of narrower blockers
after the separate change-request action, so independent work need not repeatedly
invalidate another review solely because it shares a feature.

Implemented approach: target-specific change requests and newly captured explicit answer
scopes can remain independent, with the same scope enforced at publication. Shared input,
legacy/general notes/answers/addenda, explicit relationships and dependency guardrails
remain conservative. Existing saved evidence/checks have read-only compatibility rather
than reset/replay. Global discovery snapshot locking and queue pause/resume are not
replaced by parallel feature workers. See [browser behavior](browser-workspace.md#narrower-blockers-and-bounded-answer-follow-up)
and [compatibility](migrations.md#narrower-decision-blockers-and-scoped-answer-evidence).

## Targeted requirement change requests (DEC-026)

Confirmed direction (2026-10-21): the user approved adding an explicit **Request changes**
action next, separating requested revisions from approval/rejection notes. Narrower
feature-level blockers were implemented next under DEC-027; project-wide discovery-lock
changes remain a separate follow-up.

Implemented approach: save required feedback as a separate durable review intent;
preserve the current approval/rejection state, propose replacements for approved
wording, and allow target-only unapproved revisions. Requests are not permission to
remove requirements/features or modify unrelated records. Old review addenda keep
their original semantics and are not converted. See [browser workflow](browser-workspace.md#request-changes-without-approving-or-rejecting)
and [compatibility](migrations.md#targeted-requirement-change-requests) for behavior and
checks actually run. Live model compatibility for this new intent is not yet qualified.

## Reviewable implementation planning (DEC-025)

Confirmed direction: discover and explain dependencies before coding, distinguish hard
prerequisites from preferred order and unresolved decisions, review work packages and
derive a deterministic dependency-safe sequence. User approved the proposed workflow.

Implemented first slice: one requirement-linked package with technical steps and
verification per approved requirement, bounded checkpointed proposal sessions, individual
hard-edge review, order adjustments and cycle/freshness validation. Approved guidance
feeds sequential execution. Existing epic guardrails remain; cross-requirement packages,
independently executable subpackages and automatic dependency discovery during coding
remain follow-on work. No new live model qualification is claimed.

## Incremental implementation assessment (DEC-024)

Confirmed direction: minimize repeated requirement assessments with durable per-target
evidence, explainable change impact and a pending queue. Preserve original evidence and
upgrade compatibility. Distinguish semantic assessment, test execution and verified
main delivery. User approved the change-driven assessment recommendation.

Implemented: optional human-reviewed per-requirement/feature code boundaries, shared
paths and conservative prerequisite/capture fallback; new/deleted-file detection;
model-free local queue preview; manual reassessment requests; equivalent-content commit
reuse and opt-in local/main semantic reuse with independent verification. Automatic
dependency-boundary inference and scenario-level test/assessment scheduling remain
future work. See [implementation-workspace.md](implementation-workspace.md).

## Requirement refinement (DEC-022)

Confirmed October 20, 2026: integrate duplicate/conflict candidates into Refine, with
AI-prepared fixes requiring human approval. Consolidate true duplicates while preserving
scenarios/evidence, propose coordinated corrections when explicit current human decisions
resolve an inconsistency, and ask one targeted question when intent is ambiguous. Do not
silently choose a product preference or overwrite approved requirements. Implemented as
bounded checkpointed pair tasks, retained resolution comparisons and atomic approve/keep
both actions; queued concrete clarification answers return to the same resolution path.
See [resolution workflow](browser-workspace.md#resolve-candidates-through-refine) and
the [migration ledger](migrations.md#reviewable-requirement-resolutions-v1-2026-10-20).

Confirmed simplification: remove the standalone approved-requirement audit section;
Refine is the single manual duplicate/conflict resolution entry point. Retain its internal
candidate scan and all existing review/approval safeguards and saved work.

Confirmed extension: ordinary concrete answers and requirement reviews automatically
prepare targeted resolution checks after discovery. Compare affected/new/changed records
with relevant active counterparts, including proposed/needs-review records without
promoting AI wording to confirmed intent. At most three strongest uncached candidate
pairs per response; show additional unscheduled candidates. Save discovery and a durable
follow-up receipt together, then checkpoint pair calls independently. Preserve completed
work on failure/restart, require explicit resume and never replay successful discovery
to retry pair checking. Approved requirements still require explicit resolution approval;
ambiguous intent still needs a targeted question. Explicit Refine keeps its approved-only
pair scope and existing 20-pair-call limit. Implemented and deterministically tested;
live semantic resolution quality remains unqualified.

Confirmed review presentation: refinement proposals are individual expandable items
in the shared Review queue, with a Refinements filter, approve/keep-current actions,
automatic advance and retained comparisons in Reviewed history. Display pending-work
status separately from active requirement approval. User approved this layout.

Requirements remain detailed at the behavioral/product level. Discovery
refines implementation-heavy wording and incidental tuning values, including in
previously approved requirements. Show separate cleanup proposals and preserve active
wording until replacement approval; preserve IDs, sources and history. An explicit
refinement action supports already-extracted projects. Confirmed by the user's
requirement-cleanup request and approval, including approved requirements.

Implemented: shared scan/discovery writing policy, persistent cleanup proposals,
bounded discovery/refinement-only passes, Review before/after comparison and
approve/dismiss actions, stale checks and unchanged-target repeat suppression.
Deterministic tests verify the lifecycle and browser interaction; actual model cleanup
quality has not been live-qualified.

## Integrated implementation (DEC-023)

Confirmed October 18, 2026: add **Implementation (x)** beside Review, matching existing
tab/row/group/theme styling. Assess approved requirements against file evidence and
recommend dependency-first order by epic. Implement requirements, epics or Continue
sequentially through local persistent/resumable OpenCode sessions, stopping on
failures/blockers. Automatically commit successful verified work with requirement-
specific titles/details. Support GitHub PR per requirement, PR per epic, named branch
and direct main. Execution and Git delivery remain independent; only verified main
delivery counts as implemented. The badge counts accepted active requirements not
delivered. PR strategies wait for user merge; no auto-merge. OpenCode installation is
external initially; installer management is a future option. User approved the plan,
matching style and implementation. The pilot has deterministic checks and a bounded
live sandbox coding/completed-session continuation pass. In-flight recovery and full
coding/GitHub delivery remain unqualified. See [implementation-workspace.md](implementation-workspace.md).

## Proposed implementation defaults

| ID | Proposal | Rationale / validation |
| --- | --- | --- |
| TECH-001 | Local-first TypeScript service with SQLite. | SQLite/in-process service and authenticated loopback browser API implemented. CLI still attaches to storage in process; daemon discovery remains planned. |
| TECH-002 | React browser first; add an Electron shell using the same service and UI. Ink remains a later option. | Browser delivery follows DEC-008; Electron implemented under DEC-017. See desktop.md for packaging and verified checks. |
| TECH-003 | Use OpenCode as the initial model/tool runtime, migrating toward direct providers under DEC-015. | User approved migration to OpenCode V2 on 2026-10-25 after V1/V2 credential divergence. The shared adapter now uses @opencode/client 2.1.4 and V2 credentials owned by OpenCode; live synthetic JSON response recovery and a bounded skill-backed assessment passed. Coding/GitHub delivery and actual-project clarification remain unqualified on V2. Direct-provider status is unchanged. See runtime-spike.md and direct-providers.md. |
| TECH-004 | Use ChatGPT subscription sign-in for the initial release. | Current provider scope follows DEC-007; verify actual account/model availability. |
| TECH-005 | Export build packages before embedding build execution. | Test specification quality with a fresh coding session before adding orchestration. |
| TECH-006 | Windows first for verification. | Current development environment; portable core preserves later platform options. |
| TECH-007 | Keep requirements in structured ordinary-language records. | Traceability without requiring a new programming language or compiler. |
| TECH-008 | Use better-sqlite3 11.10.0 and a readline terminal prototype for the first vertical slice. | Native module verified on Node 20.11/Windows; keeps persistence usable before introducing the richer Ink interface. |
| TECH-009 | Use Vite 6.4.4 and React for the browser build. | Compatible with Node 20.11; built assets served by the local Node API. |
| TECH-010 | Nine fixed coverage dimensions with evidence-gated statuses and 3/2/1 importance weights. | Implemented deterministic estimate; calibration and model semantic judgment remain limitations. |
| TECH-011 | Fresh revision-bound context with a 48,000-character detail budget. | Implemented deterministic task working sets and automatic queue grouping on overflow, with pinned human guardrails/evidence closure, versioned manifests, and scope-validated partial results. Help reserves room for bounded history. Exact tokenization/model-capacity adaptation remain future work. |
| TECH-012 | Capture read-only bounded snapshots, analyze sequential batches, retain content/hash/path evidence and inspected/omitted scope, and offer manual hash-based rescans. | Implemented under DEC-018; see project-workspaces.md for limits. Automatic watching and configurable selection remain future work. |

## Open questions

| ID | Question | Resolve by | Initial handling |
| --- | --- | --- | --- |
| OPEN-001 | Which installed OpenCode/client versions support the needed behavior? | Milestone 1 | Current client pinned to @opencode/client 2.1.4, tested against OpenCode 2.1.4. Historical V1 SDK/runtime 1.18.32 observations remain dated; V2 verification gaps are explicit in runtime-spike.md. |
| OPEN-002 | Can supported auth flows be embedded, or must onboarding launch OpenCode? | Milestone 1 | Accept external connection flow initially. |
| OPEN-003 | Which search/fetch integration should research use? | Milestone 1 recommendation; milestone 4 verification | OpenCode webfetch verified on two official specifications; websearch path implemented but not live-qualified. |
| OPEN-004 | How reliably can discovery tool profiles exclude coding tools and inherited workspace instructions? | Milestone 1 | Test effective behavior before relying on the runtime profile. |
| OPEN-005 | How should service discovery, lifecycle, and local authentication work? | Milestone 2 | Foreground loopback browser server with per-launch token and same-origin checks implemented; daemon discovery/CLI attachment remain open. |
| OPEN-006 | What budgets should apply to discovery and research? | Milestone 4 | Start with bounded configurable calls/retries; calibrate from observed use. |
| OPEN-007 | What export layout best supports fresh OpenCode sessions? | Milestone 5 | Feature-based workspace definitions and shared evidence implemented under DEC-021. Evaluate fresh-session usability, baselines and per-phase packages; the split definitions do not complete handoffs. |
| OPEN-008 | Which files and snapshot limits give useful existing-project coverage without excessive context or storage? | Milestone 7 | Fixed capture rules/budgets implemented and fixture-tested; real-project calibration, configurable selection, ignore-rule integration and larger-project snapshot storage remain open. |
| OPEN-009 | Does intended distribution qualify for OpenAI's direct ChatGPT-plan preview, and does the direct flow work for the account? | Direct-provider migration | Confirm open-source/local versus paid/hosted distribution; run independent live sign-in/catalog/inference/refresh checks. No direct live access claimed. |

## Revision policy

Record new product decisions with their human source or explicit delegated scope.
Keep technical recommendations marked as proposals until adopted or verified by the
relevant implementation work. Supersede decisions with rationale rather than removing
their history. A failed capability check should change the affected plan explicitly.
