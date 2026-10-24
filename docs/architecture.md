# Architecture outline

Status: shared engine, browser API/UI, and the first epic/assessment/context loop
implemented under `src/`. See [decisions.md](decisions.md),
[browser-workspace.md](browser-workspace.md), and [terminal-discovery.md](terminal-discovery.md).

## Implemented slice

- `src/core/maintenance.ts`, `src/storage/maintenance.ts`, `src/service/queue.ts`:
  opt-in decision-triggered area scheduling with durable CAS dispatch receipts,
  separate settings concurrency, debounce and bounded automatic assessment bursts.
  Scheduling projections never certify coverage. Existing assessment validation and
  owned job leases remain the publication boundary; restart requires explicit consent.
  `src/ui/next-step.tsx` guides users without automatically choosing product decisions.
  `src/ui/maintenance-controls.tsx` separates per-project Settings configuration from
  operational queue status/pause/resume; navigation does not grant model-call authority.
  See [guided maintenance](guided-maintenance.md) and the schema-6 migration ledger.

- `src/core/definition-interruption.ts`: versioned, allowlisted stop-cause receipts
  separate from evidence identities. Definition queue deadlines, Stop and shutdown
  propagate their reason through the service signal; store interruption writes are
  lease/revision checked. The renderer and diagnostics distinguish pause causes
  without guessing the cause of older unclassified jobs. See
  [migration/recovery](migrations.md#definition-interruption-causes-and-timeout-recovery-2026-10-23).

- `src/core/definition-identity.ts` and `definition-assessment.ts`: relevance-bound
  definition freshness and complete-current-area assessment-only context/publication
  rules, separate from workflow gaps and implementation assessment. Original-snapshot
  legacy projection is read-only until the next ordinary store transaction. The
  progress dialog/API/queue expose an explicit bounded refresh and separate saved
  discovery blockers. Versioned staged-current-spec v3 trades draft capacity for
  exact evidence without changing older checkpoints. See
  [definition coverage](definition-coverage.md) and [migrations](migrations.md).
- `src/core/definition-stages.ts` / `src/service/definition-stages.ts`: versioned
  complete exact-record partition, bounded assessment draft and per-batch verification
  protocol for oversized areas. Store publication independently replays all request/
  response identities; checkpointed work retains spent attempts, origin and model
  provenance through SQLite/portable continuation. The queue, progress dialog and
  processing drawer show unpublished stage counts and explicit blocked/paused states.
  Existing single-context assessment identities remain unchanged. See
  [large-area assessment](definition-coverage.md#large-area-assessment-and-continuation-follow-up-2026-10-23).

- `src/core/specification.ts`: current-input-bound automatic specification activation
  and revision, exact target/context checks and reviewable exceptions. The store applies
  optional version-1 update envelopes within existing job/revision transactions;
  additive requirement authority distinguishes answer-derived text from human approval.
  Scans/gap/refinement passes cannot authorize updates. Existing content/assessment
  fingerprints and coding authorization remain separate. See
  [continuous specification](continuous-specification.md) and [migrations](migrations.md).

- `src/core/model.ts`: project/evidence/proposal schemas and reference rules.
- `src/core/discovery-diagnostics.ts`, `src/service/discovery-metrics.ts`: strict
  local-only discovery measurement envelopes and allowlisted diagnostic reports.
  The browser queue explicitly exports selected bounded SQL metadata projections;
  no prose/credentials/paths or original identifiers enter the file. Metrics do not
  affect project revisions, evidence identities or portable continuation. See
  [diagnostics](discovery-efficiency.md#export-a-representative-discovery-run).
- `src/service/epic-planning.ts` / `epic-planning-worker.ts`: owned CPU preparation
  worker with parent-controlled cancellation/deadline, on-demand immutable revision
  reads and local progress pulses. Workflow service planning stops at the first
  eligible package; reports explicitly mark examined-prefix counts. Saved exact
  context policies and model/checkpoint identities remain unchanged. The worker has
  no storage/provider ownership. See [preparation](discovery-efficiency.md#responsive-incremental-preparation-2026-10-22).
- `src/core/epic-planning-checkpoint.ts` and schema-4 `epic_planning_receipts`:
  exact-input-bound, non-pending local scheduling receipts. The parent persists
  completed root groups so explicit retries can skip resolved context reconstruction;
  pending contexts/model-stage evidence are never inferred from CPU checkpoints.
  Snapshot-local context indexes share immutable approval/decision derivations.
  See [continuation](discovery-efficiency.md#exact-input-local-planning-continuation-2026-10-22).
- Schema-5 `epic_planning_contexts` extends exact-input CPU reuse to intermediate
  context/overflow results; recursive resolved subtrees use separate receipt keys.
  Cached contexts are copied and their live review identity alias restored before
  use. Both caches remain local-only, bounded and distinct from model checkpoints.
  Worker diagnostics track exclusive sampled activity time and prefix scheduling
  states; they never export cached evidence bodies. See
  [intermediate reuse](discovery-efficiency.md#intermediate-preparation-reuse-and-explainable-progress-2026-10-22).
- `evidenceGraph.closeLegacy` preserves exact legacy sweep insertion order using an
  indexed worklist. Snapshot-local staged render reuse keys all task flags/targets
  and exact closed membership, restoring each caller's manifest ID order. Staging's
  existing target-only gate runs before full catalog preparation. Optional numeric
  blocker summaries survive interrupted planning without reconstructing older
  compatible receipts just for telemetry. See
  [staging optimization](discovery-efficiency.md#staging-cost-optimization-and-blocker-causes-2026-10-22).
- `src/core/epic-stage-context.ts`: shared stage-envelope measurement and request
  construction. Versioned `staged-headroom-v2` opens otherwise blocked indivisible
  leaves using the existing 96k ceiling with a full 12k draft reserve. Original v1
  checkpoints reconstruct unchanged; policy-bound fingerprints/protocol markers
  prevent relabelling. CPU-only blocker eligibility upgrades lazily without resetting
  model attempts. See [compatibility](migrations.md#staged-headroom-v2-and-local-eligibility-upgrade-2026-10-22).
- Saved staged-policy sixteen-batch overflows are typed, invocation-local candidate
  failures, not fatal worker errors. Both root and child compatibility probes can
  continue normal selection; true over-limit leaves remain explicit blockers.
  Original stages/identities remain untouched. See
  [recovery](migrations.md#saved-staged-policy-batch-ceiling-recovery-2026-10-23).
- `src/core/epic-run.ts` defines a staged action's 32-request/fifteen-minute bound.
  Workflow jobs reserve a sixteen-minute lease (one-minute cleanup margin); ordinary
  non-staged calls retain their five-minute execution deadline. Staged execution
  replaces that deadline with the remaining fifteen-minute allowance, including
  preparation, and honors the outer queue deadline/Stop. Budget pauses atomically
  retain checkpoints as interrupted work with versioned `stagedRun` metadata, not
  completed checks or failures. See [compatibility](migrations.md#continuous-bounded-staged-actions-2026-10-23).
- `src/core/evidence-graph.ts`: derived, invocation-local typed forward/reverse
  provenance index and queue traversal. New `current-spec-v1` workflow contexts use
  exact graph closure and proactive generated-background projection; compatible saved
  policies reconstruct unchanged. Human history is stored separately from bounded
  inference projections, not deleted or summarized away. See
  [discovery efficiency](discovery-efficiency.md) and [migrations](migrations.md).
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
  Human duplicate removal is a separate model-free, revision-checked rejection decision
  preserving the survivor exactly. Targeted outdated-proposal refresh uses the existing
  isolated single-target/pair jobs and retires stale proposals atomically on successful
  publication. Fingerprint semantics and saved check compatibility remain unchanged.
- `src/core/incremental-resolution.ts`: publication-time affected-record selection and
  top-three uncached lexical pair planning after ordinary answers/reviews, including
  non-rejected proposals. `finishJob` saves optional version-1 submission receipts in
  the same transaction as discovery. Queue follow-up checkpoints pair jobs separately,
  pins trigger evidence, retains original review responses and uses checkpoint CAS to
  reject late workers. Interrupted follow-up requires explicit resume without discovery
  replay; compatible legacy completed checks remain reusable. See [migrations.md](migrations.md).
- `src/core/epics.ts`, `round.ts`, `coverage.ts`, `context.ts`, `working-set.ts`: organization, material
  change review, deterministic coverage, and bounded working sets.
- `src/core/epic-review.ts`: workflow/dependency packages with a proactive 72k context
  target and unchanged 96k ceiling. The optional `headroom-v1` job policy applies early
  lossless compression before splitting; exact mandatory evidence can exceed the soft
  target only with explicit diagnostics. Reconstruct saved policies and compatible
  parent/split/boundary packages before regrouping, preserving completed calls and
  spent attempts. See [workflow review](epic-workflow-review.md) and
  [upgrade compatibility](migrations.md#proactive-headroom-policy-and-saved-work-preservation).
- `src/core/epic-stages.ts`: exact shared-guardrail batches for above-target new work,
  draft discovery followed by every-batch validation, replayable response receipts
  and independently guarded publication. Staged requests cap at 72k; publication
  references the explicit union of separately completed batches, not a fictitious
  single loaded context. Compatible older jobs retain their own policy.
- `src/core/question-help-context.ts`: dedicated advisory question context with exact
  linked evidence and human guardrails; one 48k input bound reserves the request and
  trims only counted historical exchanges, without discovery expansion.
  Structured word-definition requests instead load exact displayed wording only,
  validate it against the current question, and explicitly disallow decision advice
  based on unloaded evidence. This lexical scope uses `word-help-v1` manifests.
- `src/storage/store.ts`: SQLite transactions, revision snapshots, and analysis jobs.
- `src/desktop/backend-host.ts` and `backend.ts`: owned service worker lifecycle.
  SQLite, providers and portable publication run off Electron's native-window event
  loop; the shell retains native IPC and awaits worker cancellation/cleanup on quit.
- `src/storage/portable.ts` and `workspace.ts`: manifest-3 `.reqwizit/` publication,
  conservative continuation projection, lazy exact revision deltas, schema/hash/reference
  validation and explicit transactional clone/pull adoption. Local-history backups and
  shared-baseline conflicts prevent silent overwrites; machine bindings and accounts
  remain local. Ordinary action history is not the portable format (DEC-029).
- `src/core/decision-availability.ts`: shared requirement-decision availability and
  versioned relevant-evidence bases. Storage checks overlapping unfinished input,
  linked clarification, dependency guardrails and live discovery snapshots inside
  write transactions; browser review explains the same policy. New reviews/wording
  proposals retain their basis without rewriting legacy provenance or completed checks.
  Browser Review and Project map pause unsafe decision buttons before submission,
  retaining readable records/notes. This is not per-record concurrent publication:
  active discovery snapshots still exclude decisions project-wide.
- `src/service/queue.ts`: plain approvals with no substantive note complete locally
  after the existing transactional review checks, without discovery/context preparation
  or model inference. The existing Approve UI is unchanged. Paused AI processing does
  not hold an otherwise safe plain approval; live discovery/execution still does.
  Review notes, rejections, change requests and existing model-job/overlap recovery
  retain their follow-up paths. See [migrations](migrations.md#local-completion-of-plain-approvals-2026-10-22).
- `src/core/input-scope.ts`: conservative server-side answer-scope capture, immutable
  source/receipt checks and target-bounded follow-up validation. Queue tasks include
  scoped requirements as mandatory evidence; generic/legacy input stays feature-wide.
  Scope-aware decision/pair keys have read-only v1 compatibility, and legacy individual
  check hashes are verified against their original revision before equivalent reuse.
  Global live-worker publication exclusion is unchanged. See [upgrade compatibility](migrations.md#narrower-decision-blockers-and-scoped-answer-evidence).
- Targeted change requests reuse durable review submission/queue/recovery with the
  separate `changes-requested` intent and marked note evidence. Storage leaves current
  decisions intact and limits publication to target revisions/replacement proposals or
  linked clarification. Approved targets use existing refinements; unapproved targets
  use pending changes. Runtime schemas/prompt mirror this scope; no new execution or
  whole-feature mutation permission is granted. See [compatibility](migrations.md#targeted-requirement-change-requests).
- `src/core/pending-changes.ts`, `review-completion.ts`: validated, current-input-bound
  updates to unapproved records and a publication-time impact pass. Up to four optional
  related candidates fit into the existing single-response context. Completion uses
  exact source-application snapshots, retains withdrawn/retired items and records bounded
  latest-per-item notices outside model/assessment evidence. Human pending input and
  confirmed behavior remain protected; no retrospective startup sweep or extra inference.
- `src/core/project-activity.ts`, `src/storage/activity.ts`: deterministic snapshot
  comparisons and durable activity projections. Database migration 3 backfills the index
  from retained revisions and saved job/execution outcomes. New entries are written in
  the source transaction; anchored SQL pages return at most 25 filtered entries, and
  a lightweight head endpoint announces new work without reloading older pages.
- `src/service/discovery.ts`: in-process orchestration and runtime adapter contract.
  `src/core/epic-review.ts` adds a separate manual epic/workflow-package path: local
  exact-evidence preparation, combined lenses, bounded declared-dependency passes,
  one batched extra load, saved-attempt/final recovery and independent review identities.
  It uses existing job transactions without adopting or rewriting legacy gap checks.
  See [epic workflow review](epic-workflow-review.md).
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
Initial interpretation retains the broader planning path. Later gap discovery uses the
durable per-target/lens backlog and `gap-retrieval.ts`: workspace motivation can remain
unseen navigation until requested, but mandatory human constraints cannot. Strict
navigation-only replies load up to eight displayed exact record IDs; at most two such
stages precede final analysis, within three cumulative adapter attempts and a 96,000
character context cap. Loaded evidence accumulates rather than becoming model summaries.
Revision/lease-checked SQLite checkpoints retain input hashes, included IDs, requests and
optional session IDs; final schema/citation-checked responses are checkpointed separately
from the existing atomic proposal publication. Explicit retry can reuse stages across
unrelated revisions via `gap-stage-evidence-v1`: exact expanded evidence, lens and scope
must match; only declared advisory navigation/revision fields are excluded. Model/account
and research permission must also match. Original wire hashes and stage revisions are
retained, while a versioned reuse receipt records source/retry revisions and verified
stage/final counts. Legacy bases require immutable-snapshot reconstruction and the original
wire hash, never today's invented provenance. Publication still uses the new job's latest
expected revision and all existing eligibility checks; stale workers cannot rebase in flight.
Older completed checks/approvals and implementation identities are unchanged.
The test-only [first-query baseline](retrieval-baseline.md) drives these production
planner/service/checkpoint boundaries with large synthetic saved catalogs, measuring
desired handles separately from completed jobs. It does not add a runtime retrieval path.
The [test-only candidate evaluation](retrieval-evaluation.md) compares bounded ordering,
field coverage and sampling without changing production receipts, cursors or fingerprints.
An [opt-in prefix/auxiliary merge](retrieval-merge.md) uses an injectable saved-search
dependency to exercise the actual service/checkpoint path. Service construction still
defaults to original prefix search. Additive versioned experimental receipt metadata is
validated before checkpoints; old receipts/cursors retain their issued semantics.
The [browser pilot](retrieval-browser-pilot.md) additionally accepts an optional explicit
manual request policy. Queue plumbing applies it only to empty-queue gap work; work receipts
record the current request separately from immutable saved-stage policy. Default service
construction and automatic/terminal work still use original prefix search.
`gap-navigation.ts` adds strict saved-record lexical search as an alternative navigation
reply. It returns at most eight handles/excerpted labels, never detailed-evidence authority;
the model must explicitly load selected records before citing or changing them. Queries
and local prefix scanning are bounded, and search shares the existing two navigation stages
and three cumulative attempts with loading. Search receipts are checkpointed before context
expansion and replayed unchanged on explicit compatible retry, not rerun against a changing
index. Only the advisory `savedEvidenceSearch` context field is excluded from the existing
authoritative evidence basis; loaded content and applicable human constraints remain binding.
No tools, external index, new filesystem or network permissions are introduced.
Optional search `cursor` values are witnessed opaque handles, bound to project, original
snapshot revision, task/loaded-record scope, query, result limit and record/text position.
Continuation searches read the immutable original revision in original saved order; they
do not page today's shifting index. An optional independently versioned `searchResult.page`
receipt keeps positions and next-cursor provenance. Previously offered handles are skipped
on continuation. New queries without cursors start against the current snapshot. Completed
receipts are replayed unchanged across compatible retries, including older receipts without
paging metadata. The two-stage/three-attempt cap still applies: search → page → load cannot
also analyze, and blocks rather than admitting navigation-only citations. Whole text windows
are deferred at the scan-character boundary so pagination cannot skip a partial window's tail.
See [the protocol and boundaries](browser-workspace.md#bounded-exact-evidence-stages)
and [migration compatibility](migrations.md).
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
General **Explore next gaps** requests with no submission or explicit record target
use broad interpretation only before any questions/requirements exist. Subsequent
requests use `gap-backlog.ts` and `gap-context.ts`: a deterministic catalog over active
non-rejected requirements (behavior, failures, acceptance lenses), non-retired questions
and initial/note sources (behavior). Selection rotates features/records within any
explicit feature filter, skips compatible saved checks, and waits for unresolved
explicit target-linked questions. Historical answered supporting questions remain
evidence, not new task roots that force all their old motivating files into the request.
An explicitly selected empty feature can use the real initial source as its scoped
anchor; exact selected feature purposes remain in the request and its evidence identity.
The gap task declares its lens and exact detailed scope; unspecified proposal areas from
older adapters default to that target scope rather than an unseen inbox.

`current-decisions.ts` supplies a read-only gap-context projection. A canonical plain
review, or exact generated cleanup/resolution receipt matched to an accepted saved
proposal, may be omitted only through an unambiguous same-owner supersession chain to
a matching current human decision. Missing, cyclic, branched, unapproved or mismatched
provenance cannot justify omission. Generated current receipts can instead expose
structured approved wording/scenarios/reason with original source/proposal IDs; embedded
old snapshots are explicitly not detailed evidence. All human addenda and unknown review
prose remain exact, including superseded notes, without claiming they are still current
or resolved. Original sources and requirement links are never rewritten. The manifest's
`decisionProjection` lists omissions, retained notes and projected receipts.

Isolated saved-submission follow-up also uses this projection for background
guardrails, avoiding obsolete approval snapshots in every retry. The target
requirements, directly linked evidence and explicitly requested supporting records
retain their original approval history; their receipts are not projected. Human
addenda and ambiguous history remain exact, even when they still block the input
budget. This is a read-only input projection, not a change to stored decisions.

Single saved-submission follow-up has a final 144,000-character mandatory-only
allowance after exhausting the existing 48,000/96,000 planning and compaction
passes. Queue preflight and service planning both opt in; advisory help, general
discovery, gap exploration and ordinary focused checks retain their existing bounds.
Optional reconciliation candidates cannot use the larger allowance, and related-record
hints are not added to expanded packages. No optional records or navigation are
refilled. This is an application input cap, not a guarantee of a provider's model
context capacity. Evidence above the final cap still blocks before inference.

Receipt-backed duplicate/conflict checks after a saved response now share that
144k mandatory-only fallback. `DiscoveryQueue.runOverlapFollowup` supplies an
internal submission reference; `DiscoveryService` verifies the pending pair,
exact triggers and completed originating response job before opting in. It does
not treat the overlap check as a new submission batch or authorize review changes.
Ordinary refinement retains its 96k bound. Existing semantic keys/checkpoints stay
unchanged; original completed responses never replay merely to retry a large pair.
See [upgrade behavior](migrations.md#saved-response-overlap-allowance-parity-2026-10-23).

`src/core/refinement-context.ts` pins every target requirement's direct source links
as supporting records before inference, even when a linked historical approval is
owned by a background requirement. Task-target identities remain separate and
unchanged. The service and publication boundary both assert complete detailed target
evidence; historical inclusion never grants current citation authority. Missing
records block locally, and incomplete-context errors identify bounded missing IDs.
See [compatibility](migrations.md#exact-refinement-supporting-evidence-preflight-2026-10-23).

The durable backlog ledger is existing SQLite jobs, not a second source of project truth.
`gapExploration.check` records format 1, `gap-evidence-v1`, lens and an input hash. Hashes
cover normalized exact target/evidence closure, explicit linked questions, conservative
feature/project/dependency human guardrails and latest scan identity. Revision counters,
summary, UI tooltips and generated requirement rationale are excluded. Evidence hashes
use a per-feature cached guardrail digest, not repeated whole-project serialization for
every lens. `ProjectStore.gapHistory` reads only check/report metadata (plus legacy included
IDs where needed), not all old model output and growing manifests. A thousand requirements
can produce a local catalog without placing that catalog in the model prompt.

Publication marks a check only in the same successful transaction as its result. Failure,
cancellation, expiry and stale output cannot establish a check. Current compatible
checks survive unrelated revisions and independent feature edits; changed human input
conservatively reopens its feature/dependants. New unapproved requirements add tasks
without invalidating unrelated checks. Unchanged exhausted/waiting scopes save a no-call
job outcome without mutating the specification. Up to twenty local candidate packages
are planned per action; oversized tasks save fingerprinted blocker receipts, never drop
evidence, and cannot repeatedly starve later tasks. Changed evidence or planner policy
can reconsider blockers. Each action makes at most one adapter request, with no startup
inference. `gapReport` stores checked/pending/waiting/blocked counts and request attempts
for the input scope/revision, not a completeness verdict or confirmed provider token use.

Legacy bounded jobs without check envelopes can contribute only their equivalent
behavior check: use their immutable input revision, require equal current evidence identity
and verify that today's mandatory included IDs were actually in the old manifest. New
reuse receipts reference that original completed job, preserving its payload. Never
infer completion from an unmarked broad historical round. See the migration ledger for
formats and recovery. Global interpretation, organization and whole-area coverage remain
unchanged by these partial passes. Multi-stage evidence retrieval and semantic gap-priority
ranking remain future work; this catalog is not an exhaustive completeness audit.
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
