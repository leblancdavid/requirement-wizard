# Milestone backlog

DEC-032 coordinated-workflow preview sequences existing specification checks with
bounded consent and a decision inbox while preserving checkpoints. It reaches a
specification-check/planning boundary, not autonomous planning or coding. M4 baseline
and handoff exits remain incomplete. Targeted definition-blocker questions and
answer-triggered rechecks are now implemented; delta-only assessment and
live/actual-user qualification remain. See
[coordinated workflow](coordinated-workflow.md).

Status: M1 partially verified; M2 persistent engine and local API implemented with
remaining review/UI work; M3 browser-first workspace implemented; M4 research/epic
coverage/context slice implemented with readiness work pending. Requirements refer to
[product-specification.md](product-specification.md). Complete and verify each
vertical slice before expanding it. The integrated build pilot follows the initial release.

DEC-029 adds portable `.reqwizit/` state, explicit clone/open and conflict-safe shared
checkpoint adoption. An actual local Git clone test preserves a partial implementation
assessment and reuses completed calls; source-folder migration and browser opening are
covered deterministically. This does not complete portable phased build handoffs,
automatic multi-user merges, live cross-machine qualification or coding-session recovery.
See [project workspaces](project-workspaces.md).

DEC-025 planning slice: reviewable requirement-linked work packages, dependency
proposals/reasons, selected hard-edge validation and deterministic sequence now feed the
integrated executor. Planning is checkpointed and explicitly reviewed; broad epic
guardrails remain. Multi-requirement packages, executable subpackages, adaptive coding-time
dependency discovery and live planning qualification remain follow-on checks. This does
not complete portable handoff/readiness milestones.

DEC-031 adds opt-in, bounded changed-area assessment
maintenance. This is a workflow slice, not completion of readiness or discovery
milestones. True delta-only evidence review and live maintenance qualification remain
pending. The duplicate What’s next card was subsequently removed; existing views
retain workflow status/actions. See [guided maintenance](guided-maintenance.md).

## M1 — OpenCode runtime integration spike

Progress: version-pinned runner, provider discovery, live ChatGPT JSON-text response,
streaming, cancellation, and completed-session recovery verified. Native
structured-output/recovery failures remain. Copilot support is deferred and its
quota does not block M1. See [runtime-spike.md](runtime-spike.md)
for evidence and outstanding checks; M1 exit criteria are not all met.

Dependencies: none. Covers RW-004–006; investigates RW-010 and the runtime/tool boundary.

Work:

- M1.1 Inspect installed runtime and current SDK interfaces; pin tested versions.
- M1.2 Create a minimal TypeScript integration runner with explicit provider/model selection.
- M1.3 Exercise supported ChatGPT sign-in and model discovery. Copilot checks are deferred.
- M1.4 Request a small schema-validated interpretation/question response with streaming.
- M1.5 Exercise cancellation, provider failure, and reconnection after process restart.
- M1.6 Inspect effective configuration/tool profiles and verify discovery can run with
  the intended tool restrictions. Identify a feasible source-backed search/fetch path.
- M1.7 Publish reproducible commands, results, gaps, and the adapter recommendation.

Exit checks:

- A live authenticated response succeeds through the ChatGPT subscription connection.
- Schema errors and runtime failures are surfaced; cancellation permits a subsequent call.
- Restart behavior and actual tool-profile behavior are recorded.
- Record model IDs and available usage metadata without recording secrets.
- Missing credentials may block a live check; report it as blocked, never as a pass
  based on a fixture. Continue independent implementation work where possible.

Deliverables: runnable spike, versioned runtime notes, capability report, and updated
technical decisions. Do not commit to full UI infrastructure before reviewing the result.

### M1 direct-provider migration follow-up (DEC-015)

App-owned direct ChatGPT OAuth/catalog/streaming, browser Settings connection UI/API,
and direct discovery/help dispatch are implemented under `src/providers/` and `src/ui/`.
Deterministic service/API/browser checks and native Windows credential protection pass;
live sign-in, inference, refresh, revocation, and reconnect remain unverified.
Legacy selections still require OpenCode; direct selections do not launch it.
Direct research remains unsupported. This does not complete M1.
See [direct-providers.md](direct-providers.md).

- Confirm distribution eligibility and exercise the direct live compatibility checks.
- Qualify the implemented connection/catalog operations and direct discovery adapter.
- Broaden terminal selection controls; browser auth/model selection is implemented
  and existing snapshots retain their explicit legacy route.
- Replace research/tool execution and qualify provenance, budgets, and cancellation.
- Remove required OpenCode discovery execution after end-to-end verification.

## M2 — Shared engine and terminal vertical slice

Progress: project/evidence/proposal schemas, SQLite revision snapshots, durable jobs,
in-process discovery service, runtime adapter, and terminal create/show/answer/review
commands implemented. A two-round live ChatGPT interview preserved answers and an
accepted requirement across processes. Deterministic checks cover failures, stale
updates, cancellation, and restart/lease recovery. See
[terminal-discovery.md](terminal-discovery.md) for verification details.

M2 remains in progress: richer terminal help, explanation/recommendation requests,
requirement editing, and automatic service discovery are outstanding. The browser
now uses an authenticated loopback API; CLI commands still use the in-process facade.

Dependencies: M1 adapter path established. Covers RW-001, 003, 005–008, 011–012.

Work:

- M2.1 Define schemas for projects, evidence, questions, answers, decisions, and requirements.
- M2.2 Implement SQLite revisions, expected-revision writes, jobs, and restart recovery.
- M2.3 Implement local service lifecycle and the runtime adapter boundary.
- M2.4 Implement initial interpretation, question batches, and proposed requirement changes.
- M2.5 Add terminal project creation/opening, model selection, answering, and review.
- M2.6 Support custom answers, explanations, scoped delegation, and deferral.
- M2.7 Add meaningful fixtures and failure/restart checks.

Exit checks:

- Complete a small interview, restart, and continue without losing decisions.
- A changed answer retires irrelevant questions and leaves prior answers traceable.
- Malformed/stale model output does not overwrite newer project records.
- Provider/model switching preserves project state.

## M3 — Browser workspace and cross-client continuity

Priority changed by DEC-008: browser first. DEC-017 subsequently authorizes the
Electron shell and Windows packaging; see [desktop.md](desktop.md). The shell,
close/cancel lifecycle, native folder picker, installer generation, and staged/packaged
launch checks are implemented. Installer installation/upgrades, signing, and live
provider qualification remain unverified.
Implemented: React browser shell, same-store project selection, clickable answers,
requirement confirmation/rejection, epic map, discovery progress/cancellation, and
responsive layout. Playwright checks creation, answering without IDs, review, reload
continuity, and mobile overflow. See [browser-workspace.md](browser-workspace.md).

Dependencies: M2. Covers RW-002–003 and RW-017–020.

Work:

- M3.1 Add a local browser API and React interface using the shared service.
- M3.2 Add project/model selection, interview cards, explanations, and specification panel.
  Inline concept annotations and durable question-help panels (rephrase, rationale,
  example, decision support, follow-up) are implemented in the browser. Terminal help
  presentation and live qualification of explanation quality remain outstanding.
- M3.3 Add proposed-change review and visible pending/interrupted work states.
- M3.4 Verify cross-client continuity, stale-edit handling, and keyboard access.
- M3.5 Document the Windows browser and Electron run paths; verify desktop packaging
  and close/cancel behavior. Broader installation/release qualification remains open.

Exit checks:

- Start an interview in either client and continue in the other.
- Simultaneous edits receive a conflict response rather than silently losing an answer.
- Both clients support the same persisted decisions and review actions.

## M4 — Research, scenario review, and readiness

DEC-028 first slice adds a manual epic workflow review alongside per-record gap checks:
local exact linked-evidence preparation, combined behavior/failure/acceptance reviews,
bounded declared-dependency passes, independent saved checks and explicit evidence
blockers. Deterministic/API/browser qualification is recorded in
[epic workflow review](epic-workflow-review.md). Live semantic quality/cost comparison,
curated/named workflows and undeclared cross-epic discovery remain follow-on work;
this does not complete M4/readiness exit criteria.

Progress: the dedicated requirement Review queue, optional addenda, durable AI responses,
stable-ID revisions and source-linked explicit scope removal are implemented (DEC-020).
Deterministic/browser checks pass; live review-note interpretation remains unqualified.
Opt-in source-backed webfetch was verified live; nine-area epic assessments,
deterministic coverage scoring, split/merge/move operations, confirmed-organization
review, map undo, bounded revision-aware task context, and automatic saved-response
grouping on overflow are implemented. Partial passes preserve global interpretation
and whole-area assessments. Websearch and
adversarial tool-budget/permission checks still need live qualification. Full scenario
review, conflict resolution, release baselines, and readiness gates remain pending.

2026-10-23: explicit complete-current-area definition refresh, relevant-input
freshness and separate discovery blocker reporting are implemented. Near-limit
workflow v3 retains exact evidence with a smaller draft reserve; original policies
and completed calls remain reusable. A follow-up adds resumable whole-area exact
evidence batches with complete per-batch verification before publication; indivisible
records, over-sixteen-batch areas and indispensable missing evidence still block;
this does not complete readiness/baseline or exhaustive impact-analysis work. See
[definition coverage](definition-coverage.md) for bounds and upgrade behavior.

2026-10-24: manual definition refresh now continues to completion/pause without the
shared fifteen-minute, ten-area or staged-action request budget. Finite rolling
leases, per-request timeouts, exact stage/attempt limits and saved-call reuse remain;
automatic maintenance/coordinated allowances are unchanged. Deterministic tests and
a focused browser runner verify the continuous path; this does not qualify live
latency or complete the readiness/baseline milestone exits.

Next-gap scalability foundation: general discovery after initial interpretation now
uses a durable evidence-keyed workflow/failure/acceptance backlog and read-only current-
decision projection. Compatible checks survive unrelated changes/restarts; exact human
addenda and original history are preserved. Deterministic upgrade/failure checks include
a 1,000-requirement catalog; browser checks cover no-call reuse and scope/reload status.
This is bounded adjacent-gap exploration, not qualified semantic completeness or a
readiness gate. Bounded multi-stage saved-evidence retrieval is implemented: exact human
constraints stay pinned, static motivation can be requested by displayed record ID,
completed stages are revision/lease-checkpointed, and explicit compatible retry avoids
replaying saved model responses. Three cumulative requests and a 96,000-character
evidence cap block rather than truncate constraints. Explicit retries reuse compatible
stages across unrelated revisions with original provenance and current-revision publication;
in-flight stale workers never rebase automatically. Bounded lexical search can discover
saved handles outside displayed indexes; navigation results require explicit exact loading
and share the same stage/request budget. Search receipts survive compatible retries without
being rerun, and the queue exposes omissions and blockers. Deterministic upgrade/recovery
and focused browser checks pass; this adds no exhaustive-search or completeness guarantee.
Snapshot-bound continuation handles now advance bounded result/text windows without
rerunning prior pages or changing request budgets. New queries can refine navigation;
unloaded page results still cannot support analysis. Original receipts (including legacy
nonpaged receipts), human constraints, completed checks and assessments are preserved.
Startup reliability now has controlled browser regressions for list/snapshot ordering,
failed lists, overtaking polls and stale selection responses. Tooltip checks establish
actual hover/touch preconditions without whole-test retries. Windows Node 22.23.3 passed
clean installation, all 417 deterministic tests, type checking, UI build, the full serial
browser command and CLI help entry points. Prior failed runs and remaining timing/live-
provider limits remain documented; this does not qualify release readiness or desktop packaging.
Live semantic quality, arbitrary evidence
windows and semantic prioritization remain follow-on
work; see [browser discovery](browser-workspace.md#exploring-gaps-in-large-projects).

A deterministic [first-query retrieval baseline](retrieval-baseline.md) now records
desired-handle discovery, exact use, omissions, context sizes and cumulative attempts
over 1,487–5,987 saved records. Intentional lexical/field/scan misses, distractor-only
completion and oversized evidence remain measured failures, not a reason to raise budgets.
This establishes a regression baseline, not semantic quality or a new milestone exit.
An [offline candidate comparison](retrieval-evaluation.md) adds a museum-domain evaluation
set and finds both field/window coverage gains and ranking/sampling regressions. No policy
is promoted to production, no model allowance is increased and no live quality is qualified.
The [prefix-preserving merge experiment](retrieval-merge.md) isolates field-aware gains
without density ranking and verifies actual service/checkpoint, legacy receipt and stale
loaded-evidence recovery. It remains opt-in for tests; candidate rollout, paging and live
quality are not qualified and do not establish another milestone exit.
A subsequent [default-off browser pilot](retrieval-browser-pilot.md) adds manual opt-in,
policy/omission visibility and deterministic API/browser switch-back checks. This supersedes
test-only access, not the unchanged budgets or release limits. New ticketing relevance cases
are review-ready, **not independently reviewed**; broader rollout remains gated on real sign-off.

Dependencies: M2 and M1 research recommendation; M3 required for full client verification.
Covers RW-009–010 and RW-013–014.

Work:

- M4.1 Implement bounded search/fetch research with source capture and question links.
- M4.2 Add applicable coverage templates and scenario-driven decision discovery.
- M4.3 Add conflict detection and acceptance-scenario gap review.
- M4.4 Add release scope selection, readiness findings, and explicit human baseline review.
- M4.5 Propagate revision changes to affected assessments and dependent records.
- M4.6 Expose findings, sources, unresolved decisions, and review actions in both clients.

Exit checks:

- Research findings reference retrieved sources and distinguish recommendation from fact.
- A failed retrieval remains incomplete and produces no invented source evidence.
- Seeded contradictory answers and missing critical behavior produce specific findings.
- Relevant changes make prior readiness assessments require review.
- Deferred or delegated choices retain scope and remain visible in the baseline.

## M5 — Implementation plans and portable handoffs

Workspace foundation (DEC-016, RW-023–024) implemented ahead of full planning:
per-project folder bindings, automatic requirements/progress artifacts, conflict/retry
and interruption recovery, browser/CLI controls, and manual requirement-linked build
tracking. DEC-021 adds stable per-feature definitions, shared evidence, unchanged-file
publication, versioned layout migration, and on-demand combined terminal specifications.
Deterministic storage/API and browser flows are verified; see
[project-workspaces.md](project-workspaces.md). This provides local outputs and
destination handling, but does not complete baseline-bound phase packages or M5 exit
criteria. Integrated OpenCode execution remains M6.

Dependencies: M4. Covers RW-015–016. Completes initial release functionality.

Work:

- M5.1 Generate requirement-linked phases and work packages with explicit dependencies.
- M5.2 Validate coverage, references, technical-task rationales, and dependency cycles.
- M5.3 Export revision-bound Markdown/JSON packages with a manifest and per-phase context.
- M5.4 Add export destination/collision handling to both clients.
- M5.5 Evaluate three contrasting ideas and build one small application in a fresh OpenCode session.
- M5.6 Record builder clarifications, guesses, acceptance outcomes, user effort, and available usage.

Exit checks:

- Every in-scope requirement maps to work and has acceptance scenarios where applicable.
- Exported packages identify their baseline and do not require the original chat.
- A relevant decision change marks affected plans for review.
- Exports contain no provider credentials and do not silently replace existing files.
- Publish the end-to-end evaluation, including failures and remaining gaps, before
  assessing initial release readiness.

## M6 — Integrated build pilot (follow-on)

DEC-023 authorizes this pilot ahead of M5 portable packages. The Implementation tab,
assessment/planning, separate execution/delivery state, isolated local OpenCode adapter,
explicit resume, sequential verification/commits and four GitHub strategies are
implemented. Tests use real temporary local Git repositories with injected model/
GitHub responses; browser checks cover settings/actions/themes/responsiveness. Live
coding permission enforcement/in-flight interrupted recovery, GitHub delivery, merge variants and
installer dependency management remain unqualified. M6 and M5/readiness exit criteria
are not complete. A bounded live ChatGPT sandbox check passed file creation and
same-session continuation after an owned runtime restart. See
[implementation-workspace.md](implementation-workspace.md).

Dependencies: M5 and an explicit target-workspace/execution design.

Work:

- M6.1 Launch an OpenCode coding session for one selected work package and workspace.
- M6.2 Stream build progress, cancellation, permission requests, and clarification questions.
- M6.3 Route requirement clarifications through discovery and identify stale build context.
- M6.4 Record verification commands/results against acceptance scenarios.
- M6.5 Distinguish planned, running, implemented, verified, failed, and interrupted work.

Exit checks:

- Complete one phase from the application and inspect its recorded verification evidence.
- A builder question can revise the specification and produce a revised work package.
- Model-reported completion alone does not mark a phase verified.

## M7 — Existing-project discovery and feature planning (follow-on)

Status: initialization and manual rescan implemented under DEC-018; broader change
planning/handoffs remain planned. DEC-018 brings the first slice forward from DEC-014.
The milestone number identifies
the backlog item; M6 integrated execution is not a dependency.

Dependencies: full change planning depends on M4 review/baselines and M5 portable
handoffs. Initialization reuses current requirement review independently. Covers
RW-021–022. Read-only capture and manual rescans are implemented; automatic watching
remains later work. M7.1–3 have a fixed-budget, fixture-verified implementation; M7.4
reuses existing review and explicitly started gap discovery. Selection controls,
real-project quality evaluation, and M7.5–6 change planning/handoffs remain incomplete.
DEC-019 additionally implements explicit existing-project entry with local identity
preview, provenance/manual-edit retention, Godot text capture and source excerpts,
incomplete-scan retry/discovery gating, and unrelated-question retirement/replacement.
Preview/capture were checked read-only against Rust Grind Galaxy without inference or
project mutation. Live reconstruction and generated-question quality remain unqualified.

Work:

- M7.1 Define folder selection, evidence retention, snapshot identity, file exclusions,
  and bounded inspection/context budgets, including non-Git and dirty working trees.
- M7.2 Capture documentation, source, tests, and configuration with file-linked evidence,
  an inspected/omitted manifest, and durable cancellable analysis jobs.
- M7.3 Propose goals, actors, epics, workflows, rules, integrations, and constraints;
  distinguish observed behavior, documented/tested intent, and inferred requirements.
- M7.4 Add human review and targeted questions for ambiguity, conflicting artifacts,
  incomplete workflows, and behavior the user wants to retain or change.
- M7.5 Discover one new feature against the reviewed baseline, identify affected areas,
  and produce change and preservation acceptance scenarios.
- M7.6 Export a change-focused handoff tied to the specification and source snapshot;
  evaluate it with a fresh coding session.

Exit checks:

- Import a small existing application, review its reconstructed requirements, specify
  one new feature, and export a handoff identifying affected behavior and preservation
  scenarios. Record builder clarifications and acceptance outcomes.
- Findings resolve to captured file evidence even after local source files change;
  exclusions and analysis limits remain visible.
- Conflicting documentation/code and missing intent produce reviewable questions;
  inferred behavior does not silently become confirmed intent or completeness credit.
- Capture leaves source files unchanged and does not run project scripts; connected
  workspace artifacts continue publishing definitions as usual.
- Malformed references, stale revisions, failure, cancellation, and restart preserve
  saved human decisions and never partially apply or automatically repeat analysis.
- The handoff clearly identifies its one-time source snapshot and unresolved impact
  assumptions; it does not imply synchronization with the current working tree.

## Immediate next work package

Try real ideas in the browser, calibrate the epic/coverage/context loop, and refine
requirement editing and material-change review. Then implement deeper scenario and
conflict review and an explicit release baseline before planning/handoff work.
Continue tracking the outstanding M1 checks in [runtime-spike.md](runtime-spike.md).
