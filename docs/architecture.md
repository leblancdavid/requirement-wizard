# Architecture outline

Status: shared engine, browser API/UI, and the first epic/assessment/context loop
implemented under `src/`. See [decisions.md](decisions.md),
[browser-workspace.md](browser-workspace.md), and [terminal-discovery.md](terminal-discovery.md).

## Implemented slice

- `src/core/model.ts`: project/evidence/proposal schemas and reference rules.
- `src/core/similarity.ts`: wording identity, project-wide lexical candidate retrieval,
  advisory proposal warnings and read-only requirement comparisons. Discovery adds
  bounded navigation hints without changing citation authority or mandatory evidence;
  Review compares the expanded requirement against saved records across features.
  The asynchronous approved-pair scan is internal candidate planning for Refine: it
  evaluates active approved pairs locally, yields for cancellation and bounds retained
  candidates. There is no separate bulk-audit UI; per-requirement comparisons remain.
- `src/core/resolution.ts`: exact pair/current-human-evidence identity, stale/pending
  input guards and clarification routing. Refinement adds optional versioned resolution
  proposals; existing storage transactions publish and approve both records atomically.
  The discovery queue runs bounded pair tasks before compatible individual cleanup and
  retains completed pair outcomes independently; no automatic approval or startup replay.
- `src/core/incremental-resolution.ts`: publication-time affected-record selection and
  top-three uncached lexical pair planning after ordinary answers/reviews, including
  non-rejected proposals. `finishJob` saves optional version-1 submission receipts in
  the same transaction as discovery. Queue follow-up checkpoints pair jobs separately,
  pins trigger evidence, retains original review responses and uses checkpoint CAS to
  reject late workers. Interrupted follow-up requires explicit resume without discovery
  replay; compatible legacy completed checks remain reusable. See [migrations.md](migrations.md).
- `src/core/epics.ts`, `round.ts`, `coverage.ts`, `context.ts`, `working-set.ts`: organization, material
  change review, deterministic coverage, and bounded working sets.
- `src/storage/store.ts`: SQLite transactions, revision snapshots, and analysis jobs.
- `src/core/project-activity.ts`, `src/storage/activity.ts`: deterministic snapshot
  comparisons and durable activity projections. Database migration 3 backfills the index
  from retained revisions and saved job/execution outcomes. New entries are written in
  the source transaction; anchored SQL pages return at most 25 filtered entries, and
  a lightweight head endpoint announces new work without reloading older pages.
- `src/service/discovery.ts`: in-process orchestration and runtime adapter contract.
  Question clarification shares bounded runtime/job orchestration but saves only
  advisory responses; it cannot apply discovery proposals or mutate project decisions.
- `src/service/queue.ts`: durable-submission orchestration, per-project serial rounds,
  batched follow-ups, pause/resume, and interrupted-batch reconciliation.
  Submissions wait while execution owns the project; a lightweight wake-up also notices
  another process releasing ownership. Storage transactions enforce mutual discovery/
  execution exclusion and reject specification writes during execution. Execution takes
  a project startup reservation before asynchronous inspection, then atomically binds it
  to the canonical Git common-directory lease before repository work. Advisory help is
  independent. See [operation availability](browser-workspace.md#operation-availability-and-disabled-action-explanations).
- `src/core/execution.ts`, `src/service/implementation.ts`, `git-delivery.ts` and
  `src/runtime/execution.ts`: dependency-aware implementation pilot, separate code/
  execution/delivery state, isolated Git worktrees, sequential OpenCode sessions,
  verification, automatic commits and GitHub merge barriers. Execution state/CAS/
  repository leases are independent of specification revisions. See
  [implementation-workspace.md](implementation-workspace.md) for contracts and gaps.
- `src/core/execution-context.ts` and `src/storage/assessment.ts`: one-target evidence
  closure, focused captured-source windows, bounded evidence requests, app-owned prompt/
  schema/agent/history preflight and explicit context blockers. Requirement sessions
  remain isolated even when verified commits share an epic delivery branch.
- `src/core/execution-skills.ts` and `src/runtime/skills.ts`: versioned assessment/coding
  workflows, temporary native OpenCode skill registration, role-scoped permissions,
  content-aware context budgeting and cache invalidation. SQLite retains per-scope
  assessment checkpoints independently of active attempts; incremental and forced
  checks share the same orchestration and validation.
- `src/core/assessment-impact.ts` and `src/storage/assessment.ts`: reviewed impact/search
  boundaries, conservative prerequisite/shared/configuration closure and versioned content
  footprints. The service publishes a model-free pending queue, preserves legacy exact
  capture reuse, and optionally shares equivalent semantic evidence across workspace/main
  while retaining separate main command execution and delivery evidence.
- `src/runtime/`: shared owned-server lifecycle, provider validation, and discovery adapter.
- `src/providers/`: app-owned protected ChatGPT credentials, OAuth attempt lifecycle,
  connection service, account catalog/probe, and direct/legacy discovery dispatch.
- `src/terminal/cli.ts`: scriptable commands and a readline interview menu.
- `src/spike/`: compatibility runner using the shared runtime implementation.
- `src/web/server.ts`: authenticated loopback browser API and built-asset hosting.
- `src/web/snapshot.ts`: opt-in section-content tokens for lightweight snapshot polling;
  the UI merges request-linked deltas without persisting transport state. A bounded
  revision/coverage cache avoids repeated deterministic work; volatile outcomes remain
  content-checked independently of specification/execution version counters.
- `src/ui/`: React workspace and responsive styles, built with Vite 6.4.4.
- `src/desktop/`: Electron main process, sandboxed preload, and desktop smoke check.
  The main process owns the existing local service; the renderer reuses the React UI.

Browser/terminal storage uses `better-sqlite3` 11.10.0; the independently staged
desktop uses 13.0.3 with bundled Node-API prebuilds. Development now requires Node
22.12+ for Electron tooling. See [desktop.md](desktop.md) for verification and packaging.
SQLite has a versioned schema and WAL mode. Initial records use versioned JSON
snapshots; dedicated relation tables can be introduced as richer models require them.
Database schema 2 adds an ordered transactional migration registry and original execution
payload backups. Execution JSON schema versions, concurrency counters, decision identity
and assessment semantic compatibility are separate; see [migrations.md](migrations.md).

The service core remains an in-process facade; the browser API wraps it and hosts
background jobs inside a foreground Node server. CLI processes share SQLite using
transactional expected-revision checks. Automatic daemon discovery, CLI-to-HTTP
attachment and the proposed Ink interface remain future work. Electron owns an
in-process backend and cancels active work when its window closes (DEC-017).

## Components

```text
React browser                   Readline terminal
      |                               |
Loopback HTTP API                In-process facade
             \                    /
                  Shared service
                       |
              Requirements engine
             /         |          \
       SQLite       Job runner    Exporter
                       |
                 Selection dispatcher
                   /           \
        App-owned OAuth/API   OpenCode server / SDK
                 |                   |
            ChatGPT plan           ChatGPT
```

TypeScript is shared across service, schemas, and clients. UI components do not own
requirements logic or issue SQL. The browser polls durable job state/progress while
the server subscribes to OpenCode events. Same-store CLI/browser writes use expected
revisions. Future wrappers can reuse this API; discovery/attachment is not yet automatic.

The API binds only to loopback and uses a per-launch bootstrap token, Host checks,
same-origin mutations, bounded bodies, and a self-only script policy. Credentials
remain with OpenCode for legacy selections; direct ChatGPT credentials are protected
by the local provider service and never returned to the renderer. It is a local
personal workspace, not a hosted multi-user service.

## Engine workflow

Requirement refinement is part of discovery and is also available as a bounded
refinement-only pass. `src/core/refinement.ts` stores suggestions separately from
active requirements: original snapshot/fingerprint, replacement statement/rationale/
scenarios, reason, status and creation revision. Model output cannot approve or apply
one. Storage checks detailed target/evidence scope, expected revisions and human review
conflicts; explicit approval replaces wording under the same ID and records human
confirmation. Dismissal retains the suggestion and suppresses repeats for that target
fingerprint. Approval uses the existing implementation fingerprint to flag old progress
for re-review and invalidates assessments citing the changed requirement. Refinement-only
passes preserve global interpretation and cannot add gaps, organization or assessments.
Both provider routes share the behavior-focused writing policy and proposal schema.

Explicit cleanup runs enumerate eligible requirements in the selected feature or all
areas, then process isolated individual requirement tasks. Target evidence closes fully;
project/dependency guardrails and feature notes stay exact, while unrelated feature
approvals/requirements do not become mandatory. Each task uses a fresh revision and
saves its result independently. `refinementTarget` in the job context records the target
fingerprint and a context key derived from applicable evidence/guardrails. Completed
checks, including no-change outcomes, are skipped on explicit retry/restart while that
key matches. Errors/cancellation stop the finite run and preserve previous results;
there is no automatic replay after restart. A single oversized target still blocks
before model inference. Normal gap discovery retains its existing working-set policy.

```text
Analyze → Identify gaps → Research when needed → Propose questions
    → Await answers → Propose record changes → Review → Repeat
    → Assess selected release → Human baseline review → Plan → Export
```

These are durable job/interaction states, not one endless model conversation.
Human answers are persisted before follow-up model work begins. The engine assembles
context from relevant project records and sources; the transcript is retained as
evidence rather than being the only source of truth.

The browser saves responses/notes to SQLite `submissions` before acknowledging them.
Submission IDs deduplicate retries; exact question text and previous source IDs protect
against conflicting answers without rejecting unrelated project changes. Queued inputs
do not mutate an active round's snapshot. At round boundaries a transaction applies
waiting inputs in order, retaining conflicts as needs-attention records. Follow-up
rounds process exactly one saved input per job and replan against each committed
revision. Queued follow-up sets `isolatedTask`: it skips the full-area planner and
retains the target's exact evidence closure, current project/dependency guardrails,
feature notes and directly source-linked requirements. Sharing the same feature does
not make every historical answer, review or requirement mandatory. Omitted history
is explicitly counted and may appear in a bounded navigation index; it cannot justify
new decisions or changes to omitted records. No optional-detail refill is performed.
These are partial passes: global interpretation, organization, whole-area assessment
and feature archival remain unavailable without a wider detailed discovery context.
Plain discovery without a queued submission retains the broader planning path.
Before starting a queued AI job, each indivisible candidate is checked against the
service's compacted mandatory package. If it cannot fit, the submission remains applied
but becomes `needs-attention` with `contextBlock`: revision, usage/budget, selected areas
and section sizes, plus a durable diagnostic. No job/model call is created for that
preflight failure. Fitting submissions continue, including past a blocked first item.
After fitting work finishes, remaining blockers pause the queue. Explicit resume
replans against the current revision, so unchanged over-budget retries create no failed
jobs; a scope change can release a blocker without reapplying its input. Block metadata
clears when the response passes preflight. Direct non-queued service calls retain the
existing attempted-job manifest and publication/revision guards.
An optional submission `replaces` ID atomically supersedes an unapplied waiting
answer for the same question; its exact original payload remains in history with
status `superseded` and is excluded from application/processing. Already-applied
answers use the normal source-linked correction path. Processing-time corrections
queue for the next round without changing the active snapshot. Replacement validation
and insertion share the enqueue transaction, including idempotent retry checks.
An explicitly focused resume selects submissions by their current epic membership,
applies only that subset, and runs one round. Other submissions remain pending;
remaining work pauses the queue for an explicit next resume. Previously applied
sources are reused, and dependencies remain context rather than completion claims
for other areas' submissions.
Each processing submission links to its job; completed means that job's result applied.
Failures/cancellation pause the durable queue state. Restart preserves the queue and
requires explicit resume instead of repeating inference; other workers' live leases
are left intact. Existing direct CLI mutations still use revision checks and can make
an in-flight result stale.

Question help uses the existing durable jobs table with optional `helpRequest` and
`helpResponse` payloads. Starting help checks the expected project revision and
question identity; completion rejects changed revisions and expired leases. Help
does not increment project revisions or affect coverage. Each project can have one
help request alongside discovery; discovery can make that help stale. Browser
snapshots expose help history separately from discovery jobs. Shutdown cancels owned
requests; expired leases recover without automatic inference retries.

The clarification adapter disables research and uses focused, revision-bound context,
the original question, and up to six recent completed help exchanges (history removed
to fit is explicitly counted as omitted). The base package is bounded to 36,000
characters, reserving room for the request/history within 48,000 characters. User
help messages and model explanations remain advisory, outside normative evidence.
The original question/options are not replaced. Concept annotations reference exact,
unique phrases in specified question/option fields. Round application omits annotations
with missing, ambiguous, overlapping, or invalid option references, retaining valid
annotations in response order and recording the omission count in round changes.
Question wording is preserved; substantive reference validation still rejects invalid
discovery proposals atomically.

Question selection combines applicable coverage templates, model gap analysis, and
research findings. Start with a simple impact/uncertainty/dependency rubric. Store
why questions were asked, resolved, deferred, or retired.

## Runtime adapter

### Direct provider migration

The approved direction is app-owned connections and model selection without a
required OpenCode discovery runtime (DEC-015). `src/providers/` now contains an
independent ChatGPT OAuth/catalog/streaming implementation and protected credential
transactions. Browser connection endpoints and Settings provide login/status/cancel,
account/model listing, explicit test/cancel, reconnect, and disconnect. Production
browser and terminal discovery dispatch by the saved optional connection reference.
Direct selections also support question help, retain schema/revision checks, and
reject research before inference. Live compatibility/distribution eligibility remain unverified.
See [direct-providers.md](direct-providers.md) for commands, evidence, and migration.

The target boundary separates provider registry, connection metadata, credentials,
account-specific model catalogs, and inference adapters. Connection secrets remain
outside project snapshots/exports; project connection references require local
mapping when transferred. Research tools must become application-owned. The
OpenCode adapter described below remains the legacy execution path for projects
without a connection reference. No failed direct request falls back to that path.

Expose application-level operations for:

- Runtime discovery, compatibility, and connection status.
- Provider/model listing and supported authentication handoff.
- Structured requests with explicit context, schema, model, and tool profile.
- Streaming progress, results, errors, and available usage metadata.
- Cancellation, session lookup, and reconciliation after interruption.

OpenCode sessions execute model/tool work. Application IDs and specification revisions
remain independent of runtime session IDs. Store mappings for diagnostics and recovery.

Pin and document the SDK/runtime versions used in the spike. Check capabilities rather
than assuming every documented endpoint works on the installed version. The documentation
review establishes a plausible path, not verified compatibility.

Provider connection flows should use supported OpenCode interfaces. Do not parse or
copy its credential file. If embedded auth cannot be supported through the selected
API, launch the supported connection flow and refresh provider status afterward.

Discovery uses a restricted tool profile: source retrieval and application-controlled
project operations. The coding adapter operates against an explicitly selected
target workspace. Verify how OpenCode configuration and inherited instructions affect
these profiles during the spike.

Research is an opt-in runtime profile exposing only websearch/webfetch, with monitored
tool counts and final-trace validation. Source URLs must originate in actual tool
results; snippets and fetched pages are distinguished. Live webfetch is verified;
websearch and adversarial enforcement still need qualification.

## Reviewable implementation planning

`src/core/implementation-planning.ts` validates package coverage and evidence references,
separates hard prerequisites from soft ordering preferences, checks selected graphs and
derives dependency-safe order through the existing execution planner. Configuration's
optional `implementationOrder` is a tie-breaking input, never a prerequisite bypass.
`ImplementationService` runs one bounded read-only proposal session per approved target,
checkpoints packages in execution state, and applies human-reviewed edges/order atomically
under revision/version checks. A separate bundled planning skill and agent share the
owned runtime lifecycle with assessment/coding but grant only their exact skill tool.
Planning adds no source inspection or coding tools. Existing dated assessments are
explicitly historical context; omitted human history cannot support new proposals.

Execution schema 1 optionally retains planning-format-1 proposals/history and approval
provenance. Legacy state is equivalent to absent planning; assessment/delivery identity
is unchanged by package order. Approved steps/verification feed the target's coding
prompt. See [implementation workflow](implementation-workspace.md#prepare-and-review-implementation-order-dec-025)
and the [migration ledger](migrations.md).

## Epic organization, assessment, and context

Epics and typed memberships live in revisioned snapshots. A pure round applier
validates temporary model aliases, IDs, dependencies, splits/merges, and assessment
evidence before a transaction can commit. Confirmed material is protected by a queued
organization review. Manual map restoration retains current source/decision records.

Requirement reviews also travel through the durable submission queue. Exact snapshot
fingerprints guard the reviewed requirement, while expected-revision publication guards
AI follow-up. Optional `reviewResponses` are persisted with job results. Source-linked
`reviewChanges` can revise requirements back to needs-review, reject related requirements,
or archive explicitly removed features. Store validation requires a nonempty current
review addendum from the job's own submission batch and detailed target records; feature
retirement requires a complete area and preserves history. Scans cannot invoke these
operations. This is an explicit-request path under DEC-020; ordinary confirmed-material
organization changes still require their separate review.

The model provides evidence-backed statuses, never an authoritative percentage.
`coverage.ts` computes a fixed-nine-dimension weighted estimate, caps unresolved
proposals, keeps unknowns in the denominator, and invalidates superseded evidence.
Project scope confidence and critical gaps are separate from the arithmetic.

`context.ts` constructs a fresh working set from exact source records, project-wide
information, focused epics/dependencies, an excerpted recent index, and research.
Jobs persist a versioned manifest, including section sizes and failed oversized
attempts. Automatic full-project selection retries with a focused area if the
detail exceeds the budget; required batch areas and dependencies cannot be dropped.
Before narrowing or rejecting oversized context, deterministic compaction removes
question concept-tooltip metadata and index labels duplicated by detailed records.
The package declares this compaction and the manifest retains original size and
omission counts; saved records and all decision/evidence fields remain exact.
If full detail still does not fit, `working-set.ts` pins the task records, current
human evidence in selected areas and transitive dependencies, non-proposed requirements,
and task/unconfirmed-requirement evidence. Historical answered questions retain exact
wording, options, answers and provenance links, but workspace excerpts that only
motivated those questions are optional. Current task questions/answers, unconfirmed
requirements, and human evidence links still resolve fully. `tasks-v3` packages list omitted
historical question/file links explicitly; omitted files cannot support new claims
or citations. `tasks-v6` additionally makes workspace-only motivation optional for
accepted background requirements with a current, owning human confirmation. Exact
requirement text, scenarios, source links, and all human evidence remain included.
Explicit task requirements/reviews and requirements directly motivating the current
question (including cited review sources) still pin their files. Needs-review,
unconfirmed, superseded-approval, or mismatched-confirmation records cannot use this
omission. `omittedRequirementWorkspaceEvidence` lists every omitted requirement/file
link and forbids citing those file contents or claiming verified implementation.
Files independently required elsewhere remain detailed. This avoids an approval
turning baseline workspace excerpts into mandatory input for every later answer.
It removes generated question help text outside the
task, previous assessments, and other optional AI detail, then adds fitting related
proposals/open questions/research. A bounded excerpt index provides navigation.
These `tasks-v1` packages declare partial scope and persist task, indexed, included,
and omitted IDs with section sizes. They cannot replace global interpretation,
scope confidence, or whole-area assessments, or perform organization operations.
All rounds reject retirement/organization of unseen records and proposals targeting
areas outside their working scope. Exact source records remain authoritative.
Question help reserves room for its request/history and can fall back to question
evidence plus project guardrails; omitted help exchanges are explicitly counted.
Queue grouping normally retains the 48,000-character target. Discovery can expand a
mandatory-only task package to a hard 96,000-character bound after compaction and
grouping; it adds no optional detail and reports the expanded budget/selection reason
in the manifest and progress. Advisory help and scan planning retain their own bounds.
Before rejecting a discovery package above 96,000 characters, a final compaction pass
can omit task questions' generated `whyItMatters` explanations, with affected IDs in
the package and an explicit manifest selection reason. It preserves exact sources,
question wording/options/answer links, requirements, and stored UI explanations.
Mandatory-only discovery packages above the normal target use lossless sharing before
expanding their budget, even if they already fit under 96,000 characters. Compaction
targets 48,000 and returns without optional-detail refill if it recovers enough room.
Shared-text encoding (`tasks-v2`) works as follows:
repeated long text fields/lines, including wording embedded in review snapshots, are
sent once in a `sharedText` table. Fields reference exact strings or ordered literal/
reference parts; IDs and evidence closure are unchanged. The prompt specifies expansion
and citations to owning record IDs. The manifest records pre-sharing size, shared-text
and reference counts, and actual final section sizes. Encoding is retained only when
smaller; stored records are untouched. This is not a summary or a larger context bound.
If text sharing is insufficient, `tasks-v4` packages can also share repeated record
and scope identifiers through `identifierTable`. Integers in identifier fields
(`id`, names ending in `ID`/`IDs` except `sharedTextID`, and `dependencies`, including
array elements) index the table's original strings. Human prose and other numbers
remain untouched. Output must use expanded original IDs, and validation/manifests
continue to use those original IDs. This pass is also retained only if smaller,
and its pre-sharing size and identifier/reference counts are recorded separately.
If the package still exceeds the normal target, `tasks-v5` shares repeated field
names in ordered record tables (including nested options). Each table has `columns`
and `rows`; optional `absent` cell coordinates distinguish missing fields from null.
The prompt specifies table expansion before interpreting identifier/text references.
Tables are selected only where smaller, and the whole pass must save space including
its explanation. The manifest records input size, table/row counts, and final section
sizes. Stored records and evidence closure stay unchanged.
If exact encoded evidence still exceeds 96,000 characters, `tasks-v7` retries the
same closure with explicitly listed generated-background omissions: rationales of
currently human-confirmed background requirements and consequences of unselected
historical options. Only an answered question with a current answer matching exactly
one option label qualifies; freeform/ambiguous/superseded answers and current-task-linked
questions keep all consequences. All human sources, option labels and selected
consequences, requirement wording/scenarios/links, and current-task/unconfirmed
rationales remain exact. The smaller candidate is encoded and measured again; no
optional context is added and no stored records change. The omission notice forbids
inference from missing explanations. Advisory help does not use this fallback.
Mandatory evidence beyond the hard bound fails before inference; evidence
outside the detailed working set cannot justify generated requirements/assessments.
The character bound is not an exact tokenizer/model-window estimate. See the browser
guide for the implemented rubric and limitations.
Navigation-index trimming computes the package's serialized size once, then subtracts
each removed item's exact JSON length and comma. It preserves the same selection and
counts without repeatedly serializing the entire package for every label.
The runtime specializes partial-pass instructions and output schemas: organization
and assessments are empty tuples, ignored global fields use fixed valid Analysis
placeholders, and review changes exclude whole-feature archival. Full passes keep
their organization/coverage contract. No-research calls use an empty research output
tuple; zero-question-slot calls omit the unusable question item schema. Serialization
instructions are emitted only for encoded contexts and refer to the app's existing
table explanations. Independent storage validation still enforces partial scope.

## Storage and revisions

The shared `ProjectStore` also owns local workspace bindings and dirty-save journals;
`src/storage/workspace.ts` renders and publishes revision-linked Markdown/JSON artifacts.
Format 2 uses a project overview/index, stable per-feature requirement files, and separate
ID-referenced source/research/scan files. The manifest owns the set's revision; unchanged
files are not rewritten. The terminal `export` command renders a combined specification
on demand. Version 1 publication migrates without changing the project revision.
Bindings and writer leases are stored separately from portable project snapshots.
Every committed specification/progress revision marks the binding dirty in the same
transaction. Publication runs after commit, with intended hashes committed before
per-file atomic renames, journaled owned-file removals, and manifest-last publication.
New and retired nested paths are checked as well as existing outputs. Hash checking preserves external
edits and a cross-process lease serializes writers sharing the store. Implementation
assessments are manual requirement-linked records; a content/review fingerprint flags
changed requirements without discarding prior evidence. See
[project-workspaces.md](project-workspaces.md) for the implemented file format,
recovery semantics, UI/CLI controls, and limitations.

Initial record families:

| Family | Examples |
| --- | --- |
| Project and release | Project, scope selection, baseline review |
| Evidence | Human message, answer, source document, research finding |
| Specification | Goal, actor, workflow, requirement, acceptance scenario |
| Discovery | Question, option, assumption, decision, conflict, coverage item |
| Execution | Job, model call, runtime session mapping, usage |
| Planning | Readiness assessment, phase, work package, export manifest |

Use stable logical IDs with versioned content and typed relationships. Records have
type-specific statuses; a proposed requirement and a running job do not share one
generic status vocabulary. Start with relational metadata/links and schema-validated
JSON payloads for evolving content.

Write record changes, revision metadata, and job checkpoints transactionally. Apply
model proposals only after schema/reference validation and expected-revision checks.
Keep a reviewable change set rather than granting the model unrestricted database writes.

If a user changes an answer while analysis runs, mark the result stale and regenerate
or explicitly reconcile it. Never apply it automatically to a newer revision.

On restart, reconcile pending/running jobs with runtime state. Preserve completed
results, mark unrecoverable interruptions, and offer an explicit retry. Use operation
IDs to avoid duplicate local updates; do not assume remote calls execute exactly once.

## Change impact

Relationships connect decisions to workflows, requirements, scenarios, and work
packages. Revision invalidation marks dependent assessments and plans for review.
Dependency traversal can identify candidates for review; it does not prove semantic
impact completeness. Model analysis may propose additional affected records.

## Existing-project discovery (initial slice implemented)

DEC-018 brings the initial M7 entry path into the shared discovery engine:

```text
Local source folder → Bounded evidence snapshot → Proposed project understanding
    → Human review → Requested feature/change → Discovery → Plan → Export
```

`src/storage/scan.ts` owns bounded read-only capture. `DiscoveryService.scan` runs
sequential batches using the selected adapter with tools/research disabled.
`src/service/scan-batches.ts` plans bounded evidence tasks and subdivides unfinished
work. Jobs retain the captured snapshot, versioned batch plan, attempt counts and
validated responses in SQLite. Explicit resume creates a new job, reuses those
checkpoints and rejects changed project revisions/models/folder connection IDs.
Five-minute batch deadlines run within automatically renewed fifteen-minute execution
windows. Before launching a batch with less than six minutes left, an atomic checkpoint
validates current revision/binding and the unexpired lease, extends the lease sixteen
minutes, and resets the window. The same worker continues the finite plan; completed
calls are not replayed. Expired leases, explicit stop and app restart retain saved work
for explicit resume rather than automatically repeating inference.
The browser API returns checkpoint counts rather than unpublished batch responses.
`ProjectStore.finishScan` applies all validated batches in one expected-revision/binding
transaction, recording scan manifests and distinct `workspace` evidence sources.
The queue pauses for review; API `POST /api/projects/:id/scan` and terminal `scan`
share the service. Captured contents keep file evidence available after local changes.
DEC-019 adds explicit existing-project creation and a separate read-only folder preview
(`src/storage/folder-preview.ts`, shared schema in `src/core/folder-preview.ts`). Metadata
and document suggestions carry file hashes and a fingerprint rechecked before creation;
portable `origin` metadata distinguishes suggestions from manual edits. Existing creation
starts a scan server-side, never a generic interview. Incomplete scans block discovery
including automatic queue work. Question retirement is an expected-revision transaction
protecting saved/queued responses, with reasons retained in working context; replacements
start only after successful initialization. Initialized-project questions must cite
detailed evidence IDs. This validates provenance, not semantic relevance.

Capture now prioritizes project/vision/slice metadata, gameplay source and scenes, supports
Godot/.NET text formats, and splits larger files into bounded explicit excerpts. Human
guardrails and accepted-requirement evidence remain mandatory; unrelated captured files
are optional context so capture volume does not itself exhaust later discovery budgets.

The local service owns folder access and snapshot capture; the renderer presents
selection, inspection scope, progress, and review. The capture module selects
documentation, source, tests, and configuration under explicit file/total budgets,
recording exclusions and omissions. Initial import is read-only and does not execute
project scripts. Target files and repository instructions are evidence, not authority
to alter the discovery tool profile. Fixed rules exclude potentially sensitive/hidden,
generated and dependency paths and common secret-content patterns before inference.
Limits/heuristic limitations are documented in project-workspaces.md; calibration,
configurable selection and ignore-rule integration remain OPEN-008.

Capture repository identity/commit when available plus file hashes and retained evidence
for the actual selected content, including local changes and non-Git folders. Findings
reference snapshot ID, path, location, and supporting excerpts. Bounded working sets
must identify omitted files; references are validated against the captured evidence.
The snapshot design must keep links usable after the source folder changes.

Imported observations and documented/tested intent remain evidence types, distinct from
AI-inferred requirements and human confirmation. Existing proposal/review, epic, and
coverage rules apply; finding code or a test does not confirm desired product behavior
or prove execution. Unclear intent and conflicting artifacts become review questions.

Import runs through durable jobs with cancellation, interruption recovery, and
expected-revision application. It cannot silently replace confirmed decisions. A reviewed
baseline then supports change discovery with explicit additions, modifications, and
preservation scenarios. Handoffs identify both specification revision and source snapshot.
Explicit rescans compare captured file hashes and flag affected requirement IDs while
retaining human decisions. Automatic watching and change-focused handoffs remain future work.

## Export boundary

Export one versioned manifest plus Markdown and JSON artifacts. The manifest records
the project, selected release, baseline revision, and included record IDs. Every work
package references this manifest and includes enough context to stand alone in a fresh
coding session. Omit credentials and unrelated interview content.

## Suggested source layout

```text
apps/desktop/          Electron shell and React interface
apps/terminal/         Ink interface
packages/core/         Schemas, discovery, review, planning
packages/service/      Local API, persistence, durable jobs
packages/runtime/      Runtime contract and OpenCode adapter
packages/export/       Markdown/JSON handoffs
fixtures/              Synthetic interviews and runtime responses
```

Create packages as milestones require them; avoid empty scaffolding in advance.

## Verification strategy

- Engine checks: revisions, stale results, provenance, dependency cycles, readiness rules.
- Workflow checks: interruption, resumption, changed answers, contradictory inputs.
- Client checks: keyboard operation and the same project continued across clients.
- Live compatibility checks: ChatGPT subscription access, structured output, cancellation,
  restart, available research tools, and tool profile behavior.
- Existing Copilot adapter paths remain available experimentally, but Copilot support
  and its compatibility checks are deferred.
- Product evaluation: a fresh builder consumes an export and executes acceptance scenarios.

## Documentation consulted

Reviewed October 15, 2026; implementation must verify installed-version behavior.

- https://opencode.ai/docs/sdk/
- https://opencode.ai/docs/providers/

Prior Lykoi work in `D:\Dev\axiom` informs provenance and behavioral decision discovery.
This application does not depend on its compiler or experimental runtime.
