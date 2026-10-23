# Data migrations and upgrade compatibility

## Upgrade contract

Application upgrades preserve saved decisions, IDs, histories, assessments, command
output and delivery evidence. Compatible format or workflow changes must not require
resetting data or repeating model calls. Genuinely changed decisions, code snapshots,
models or assessment semantics still require fresh evidence. A migration never
creates missing provenance or certifies that old verification commands ran again.

Assess migration impact for every persisted-data change, including fingerprints and
freshness rules. Record the plan here **with the code change**, before release:

1. Source and target formats, affected records and the reason for the change.
2. Exact transformations and the evidence establishing compatibility. Distinguish
   compatible representation changes from semantic changes requiring reassessment.
3. Preservation of original evidence, IDs, timestamps and history; backup strategy.
4. Transaction/retry behavior, concurrency and active-worker handling, unsupported
   future formats and recovery after failure.
5. Upgrade fixtures/checks actually run and remaining qualification gaps.

## Legacy-order staging optimization and blocker metadata (2026-10-22)

Source/target: SQLite schema 5 and existing format-1 planning receipts/progress.
There is no SQL migration or rewrite of project/job history, completed model stages,
assessment identities or stored contexts. Root input digest `resolved-prefix-v1`,
root/subtree keys, intermediate context keys and all model/checkpoint fingerprints
remain unchanged: this is an exact-computation optimization, not a policy change.
Existing compatible CPU receipts are reused rather than forcing completed planning
or model work to repeat. Downgrading to older strict parsers after new additive
metadata has been saved is not qualified.

The existing staged target-only 54,000-character gate is evaluated before computing
the full-area seed catalog. The gate, compaction choices, exact blocker message,
partition seed order and 16-batch ceiling are unchanged; this only avoids catalog
work on a path that already must fail under the original staged contract. No size
inequality is inferred from raw text lengths or from a different evidence superset.

Legacy context closure uses an indexed priority worklist with logical sweep/record
positions. It reproduces the old question/requirement/source scan's insertion order,
edge filters, cycles, missing references and ignored supersession edges, while
visiting each reachable record once. The current-spec graph policy remains separate.
Staged rendering/compaction may be reused only for identical task flags/targets and
exact closed evidence membership in one immutable snapshot. Each caller's included-ID
order is restored. The invocation-local cache is capped at 64 entries / 8 MiB of
serialized values and never becomes a persisted evidence authority or exported cache.

Format-1 receipt tasks optionally add `blocker` with a fixed cause enum and known
numeric size/budget. New format-1 diagnostic progress optionally adds `blockerSummary`,
`closureRenderAttempts` and `reusedClosures`. Causes distinguish staged target size,
indivisible seed size, context limit, staged batch ceiling, retained evidence blockers
and spent attempts. Older cached blockers without structured cause stay `unknown`;
the app does not parse arbitrary old prose, invent sizes or rebuild compatible work
solely to populate telemetry. Unknown sizes remain null. Parent-saved metrics retain
the examined-prefix summaries on timeout/cancellation; no evidence text, IDs, paths
or arbitrary diagnostic prose is added to exports.

Tests compare exact legacy insertion order on 80 shuffled cyclic/filtered fixtures,
wire contexts against the old scan, linear record visits on a 1,000-record reverse
chain, original staged target/seed blockers, and unchanged successful partition/wire/
batch evidence keys against a frozen pre-optimization staging implementation. They
also cover reduced target preparations, repeated-render avoidance, interrupted-job
summary export/privacy, and reuse of older receipts with unknown causes. Existing
schema-4/5 rollback/reopen and staged model-check recovery tests remain applicable.
See [current staging behavior and verification](discovery-efficiency.md#staging-cost-optimization-and-blocker-causes-2026-10-22).

Verification: 60 pretests and 635 main tests passed, including a final pretest rerun
after strengthening the seed-cause check. Type checking, UI build, desktop emit,
compiled-JavaScript worker/blocker smoke and focused workflow browser checks passed.
The broad browser suite was not rerun for this slice; its preceding **Approve
resolution** failure remains unqualified. Full Electron packaging and actual
throughput on the supplied project remain unqualified. No personal database or
live provider inference was used; synthetic fixtures establish structural savings
and exact-output compatibility, not an end-to-end speedup claim for that project.

## Intermediate preparation checkpoints and phase diagnostics (2026-10-22)

Source: SQLite schema 4, including existing format-1 root-group receipts. Target:
schema 5, ordered transactional migration `intermediate-local-contexts-v1`, adding
`epic_planning_contexts` only. Existing receipt bytes, project/revision/job payloads,
assessments, completed stages and spent attempts are preserved. No reset, model
replay or backup rewrite is needed. Startup does not run inference. Migration failure
rolls back the new table, migration history and `user_version` together; reopening
retries safely. Older app versions reject schema 5 rather than downgrade it.

The existing complete-input digest `resolved-prefix-v1` and original root-group keys
remain unchanged because scheduling, exact wire contexts, model/checkpoint identities
and freshness semantics are unchanged. Completed recursive subtrees now share the
receipt table under a separate `subtree-v1` key domain. Only fully resolved
reviewed/waiting/blocked subtrees are saved; an interrupted parent or pending subtree
cannot become a skip receipt. Counts retain their original report basis. Existing
root receipts keep working without redoing their completed local computation.

Successful exact context computations and complete `ContextBudgetError` outcomes may
be checkpointed under `epic-context-computation-v1` keys containing revision, review
identity, guardrail seed order, final-response flag and explicit-load IDs. These keys
are additionally bound to the complete project/history/submission/scope digest.
Changed inputs cannot reuse contexts. Cached contexts are copied before use and
their live review identity alias is restored; staged batches retain their original
partition, finalized identity and exact evidence basis. This is computational reuse,
not new model-review evidence or a larger call allowance. Later independent output,
revision and publication checks remain in force.

The new table holds at most 128 entries / 16 MiB of serialized payload per project,
for one input generation, retaining the recently computed tail. Byte accounting is
stored separately so eviction does not repeatedly decode context bodies. Writes use
an expected-revision guard and commit atomically with eviction. Oversized entries
are not persisted; computation continues. Unknown future envelope formats reject
validated reads/writes without replacing saved rows. Context bodies can contain exact
private requirement/evidence text: they stay in local SQLite and are never included
in portable projections, workspace artifacts or metadata-only diagnostics. Eviction
or a cache miss only causes local recomputation, never deletion of original evidence.

Format-1 progress gains optional `examinedStates`, `activity`, `activityMs`,
`preparedContexts` and `reusedContexts`. The fixed allowlisted numeric fields leave
older measurements readable and absent values unknown. Worker elapsed-time buckets
are exclusive sampled wall time, not pure CPU time or a complete parent-side planning
total; an interrupted current operation can be only partially measured. Prepared
context counts denote checkpointable computations, not proof of disk persistence or
model acceptance. Group counters now include completed subtrees as well as roots.

Tests exercise schema-4 rollback/retry, original root receipt preservation, repeated
reopen, stale writes, bounded eviction, oversized entries, future formats, partial-root
interruption with retained siblings, exact context/overflow reconstruction, phase/state
diagnostic privacy and lower preparation counts on retry. See
[current behavior and verification](discovery-efficiency.md#intermediate-preparation-reuse-and-explainable-progress-2026-10-22).

Verification: all 57 pretests and 633 main tests passed. Type checking, UI build,
desktop TypeScript emit, compiled-JavaScript worker startup/receipt/state smoke and
focused workflow browser checks passed. The focused runner initially exposed the
evicted-log outcome-banner regression; it passes with typed-report recognition and
a bounded 30-second wait for its deliberately expensive no-inference fixture.
The broad browser command still stops at the missing **Approve resolution** assertion
in `src/web/browser-check.ts:1350`; its portable/specification runners did not execute.
No personal database or live provider calls were used. Full packaged Electron and
the supplied project's actual throughput remain unqualified.

## Exact-input local planning continuation (2026-10-22)

Source: SQLite schema 3. Target: schema 4, ordered migration
`exact-input-local-planning-receipts-v1`, adding `epic_planning_receipts` only.
The startup transaction records migration 4 and advances `user_version` atomically.
No project/job/revision/assessment payloads, stable IDs, evidence, completed calls,
model-stage fingerprints or optimistic-concurrency counters are rewritten. The
derived table starts empty; prior timeouts have no retroactively invented receipts.
Schema 4 is not supported by older app versions.

Completed local scheduling of a root workflow/boundary group can save format-1
receipts for its reviewed/waiting/blocked tasks and report counts. Pending tasks,
partially split groups and exceptions cannot establish a skip receipt. A SHA-256
key binds reuse to the complete serialized project, ordered workflow-job history,
submission list, feature scope and explicit planner algorithm `resolved-prefix-v1`.
Even a same-revision content edit or changed attempt invalidates reuse. This key is
separate from semantic/model-stage identities. Future context/scheduling/freshness
changes must bump the algorithm version, not reinterpret old CPU receipts.

The parent persists each completed group's receipt in an immediate transaction with
an expected-revision guard. Stop, deadline, process interruption and reopening retain
previously committed groups. An explicit retry can skip their context reconstruction;
startup still makes no automatic model calls. The currently incomplete group must
restart, and all pending work prepares fresh exact contexts. These are local CPU
checkpoints, not proof of model review or completed requirements. They are not included
in portable projections, workspace artifacts or diagnostic exports. Only optional
numeric `resolvedGroups`/`reusedGroups` counters enter format-1 diagnostic progress.

Storage keeps one exact-input generation per project, bounded to 2,000 groups/4 MiB;
changed-input cache replacement is transactional and deletes derived receipts only.
At the cap, planning continues without further persistence. Unsupported future
receipt formats reject reads/writes without replacement. A failed SQL migration rolls
back its table/version/history together and is safe to retry. Original evidence needs
no backup rewrite because it is untouched. Snapshot-local approval parsing, decision
projections and lookup indexes are shared only during immutable planning; protected
submission views copy mutable maps. No persisted context encoding or evidence policy
changes result from these indexes.

Upgrade/recovery tests cover a schema-3 fixture, rollback after table creation,
successful retry, repeated reopen, unchanged revision/job bytes, and future receipt
preservation. Planning tests cover cancellation after saved groups, another deadline,
SQLite reopen, exact pending task/report identity, fewer preparations, zero-preparation
all-resolved reuse and changed-input invalidation. See
[local planning continuation](discovery-efficiency.md#exact-input-local-planning-continuation-2026-10-22)
for current verification and limits.

Verification: the full main suite passed all 633 tests; the final pretest rerun
passed all 53, including upgrade/rollback/reopen and zero-context reuse checks.
Type checking, UI build, desktop emit, compiled-JavaScript worker smoke and focused
workflow browser verification passed. No live model calls or personal database
were used. Exact-project performance and full Electron packaging remain unqualified;
the broader browser suite was not rerun for this follow-up.

## Incremental workflow preparation and local progress (2026-10-22)

Source: existing format-1 epic-review reports and optional format-1 discovery metrics.
Additive target: reports may include `planningPartial: true`; format-1 metrics may
include optional format-1 `planningProgress` with fixed phase enums and numeric counts.
Diagnostic exports label prefix backlog counts with `scope: examined-prefix`; absence
retains the earlier saved-scope interpretation. Recording-state adapter-time totals
now export null, not an invented completed-run zero. This initial worker-isolation
slice did not change SQLite/project/portable schemas, revision counters, context
policies or semantic evidence fingerprints; the later schema-4 CPU checkpoint
addition is described above.

No legacy payload is rewritten or old plan/call identity recomputed at startup.
Initial workflow planning now stops after the first eligible package and runs in an
owned CPU worker with parent cancellation and a two-minute deadline. Equivalent saved
no-policy/headroom/staged profiles, completed results, spent attempts and overlapping
split children are still reconstructed before new grouping. Precomputed staged batches
retain the same exact evidence basis and finalized review identity on every batch;
they do not grant a new request or change the original partition. Full synchronous
catalog planning remains available for deterministic inspection/compatibility checks.

Progress is an optional local diagnostic field, saved through the existing transactional
measurement-only update, not a specification revision or a completed-check receipt.
Its absence stays unknown. Half-second pulses update elapsed/last phase without
pretending another package or model call completed. On interruption, existing lease
recovery retains partial measurements and old evidence; there is no automatic worker
restart/inference. Local preparation may repeat on explicit retry because these
checkpoints are not a persistent computation cursor. Worker caches are invocation-local.

The worker cannot write storage or access providers. On-demand historical snapshots
come from the immutable revision reader in the parent; current revision and cancellation
are checked before inference. Parent timers do not rely on a blocked planning worker's
event loop. The five-minute discovery bound and six-minute lease are unchanged; no
blanket lease extension masks a stalled planner. Cancellation/deadline cleanup terminates
only the owned CPU worker. Unsupported future progress/report fields reject normal
validated reads without overwriting saved data. No ordered SQL migration, backup
rewrite, reset or repeat model call is needed for this additive optimization. Downgrade
support for new report/metric metadata is not promised.

Tests cover identical first-package identity/evidence versus full planning, partial
counts, parent responsiveness, cancellation during exact context preparation, bounded
worker deadline and cleanup, fresh work after cancellation, stale human changes,
durable pre-model progress, API startup/cancel responsiveness, staged exact-basis
reconstruction and SQLite reopen without model replay. Existing legacy/full-policy
recovery checks remain applicable. No personal database or supplied diagnostics were
committed as fixtures. See [preparation behavior and limits](discovery-efficiency.md#responsive-incremental-preparation-2026-10-22).

Verification: `npm test` passed all 49 pretests and 633 main tests. Type checking,
UI build, desktop TypeScript emit, a compiled-JavaScript planning-worker smoke check,
and the focused epic-workflow browser check passed. The broader browser command
stopped at the missing **Approve resolution** assertion in `src/web/browser-check.ts:1347`;
its subsequent portable/specification runners did not execute. Full packaged Electron
execution and the user's exact interrupted project remain unqualified. No live
provider calls or personal database were used.

## Browser Resume mode correction (2026-10-22)

No persisted schema, payload, context-policy, fingerprint, SQLite/portable version
or revision-counter change. The new authenticated same-origin browser endpoint
`POST /api/projects/:id/resume-discovery` validates the current revision and bounded
question target, then routes using current server-side input state. It accepts no
legacy retrieval-policy/mode override. Its `processOnly` queue option is ephemeral,
not saved project state.

Unfinished non-archived/non-resolved input uses finite isolated follow-up, preserving
existing scope/conflict/overlap recovery. Empty selected queues stop rather than
falling through to unrequested legacy discovery. Otherwise explicit browser Resume
uses workflow discovery, as the Design button already did. Startup alone never
starts work. Legacy terminal/API discovery and explicit saved-job continuation
retain their existing contracts.

The workflow planner still reconstructs compatible saved no-policy/headroom/staged
contexts and spent allowances first. This correction does not rewrite old jobs,
adopt legacy lens checks as workflow evidence, transfer/reset spent attempts, change
human constraints or force completed calls to replay. No data transformation,
backfill or SQL migration/backup transaction is needed. Existing dated evidence and
future-format rejection remain unchanged. Unsupported oversized exact evidence can
still block, independently of routing.

Tests cover resuming after a legacy context blocker without modifying its ledger,
finite saved-response processing, empty/out-of-scope input, authentication/origin/
revision validation, and paused staged work across SQLite reopen: the six original
receipts remain unchanged and only two remaining calls run. The focused browser
runner now exercises the actual queue Resume button after reload, rather than
using Explore next gaps as a substitute for Resume.

Verification: Windows Node 22.23.3 type check, UI build, full `npm test` (43 pretests /
633 main tests), and focused workflow browser check passed. The broad browser command
still stops at the existing **Approve resolution** assertion (`browser-check.ts:1347`),
so its later portable/specification runners did not execute. An initial focused run
hit an index-page 404 while the broad command rebuilt the shared UI output; a separate
rerun after the build passed, including the actual staged Resume-button path. No live
model calls, user database changes, or imported diagnostic-file fixtures were used.

## Local discovery measurements and explicit diagnostic export (2026-10-22)

Source: jobs without diagnostic measurements. Additive target: optional format-1
`Job.discoveryMetrics`, a strict bounded metadata envelope (initial planning/context,
workflow matching counters and up to six adapter-attempt durations/context summaries).
No SQLite/project/portable version or optimistic revision changes. Measurements are
outside context data/manifests, semantic hashes and assessment/continuation identities.
The local selected-context traversal property is ephemeral; only safe numeric summaries
are saved. Diagnostics are excluded explicitly from portable continuation.

No startup backfill or legacy-job rewrite: absence remains unknown, not invented zero
timings or a reason to repeat model calls. New jobs checkpoint format-1 metadata
before requests, on return/failure and at terminal completion using transactional
updates of only the measurement field. Those writes do not create project revisions,
activity or workspace dirtiness, and cannot overwrite concurrent terminal job state.
Request entries describe adapter attempts, not proof of network/provider acceptance.
After process death, retained `recording` state and null unfinished durations remain
partial even if existing lease recovery marks the job interrupted. No automatic calls
or timing reconstruction run on reopen. Finalized measurements cannot be rewritten.

No source evidence is transformed, so no backup rewrite or ordered SQL migration is
needed. Future/malformed metric envelopes reject job/export reads without overwriting
stored payloads. Existing compatible completed work, checkpoints and spent attempts
retain their original identities. Downgrades may ignore the optional local field;
measurements are never required to recover work.

Export is explicit, authenticated, same-origin and read-only: one to twenty distinct
owned discovery jobs, SQL metadata projection, fixed safe section keys, report-local
IDs and a 256,000-byte output cap. It excludes arbitrary diagnostic prose and original
text/paths/identifiers rather than applying heuristic redaction. Missing historical
measurements are null. Counts/durations can still disclose scale; UI/report warn users
to review before sharing. See [diagnostic fields and limitations](discovery-efficiency.md#export-a-representative-discovery-run).

Upgrade/recovery tests cover older jobs, repeated SQLite reopen, interrupted in-flight
checkpoints and real expired-lease recovery, future-format rejection without writes,
unchanged evidence/revisions, actual per-invocation requests across staged resume,
no-call reuse, exact-load growth and portable exclusion. Privacy/API checks cover
free text/arbitrary section keys, ownership, authentication, origin, duplicate IDs
and selection bounds. Browser checks cover selection, download/privacy and export
failure without starting discovery.

Verified on Windows Node 22.23.3: full `npm test` (38 pretests / 633 main tests),
final focused diagnostics checks, type check, UI build and focused workflow and
specification browser checks. The full browser command remains blocked at the
previously documented missing **Approve resolution** assertion (`browser-check.ts:1347`);
the separate portable browser runner remains blocked by the duplicate **Open shared
checkpoint** selector (`portable-browser-check.ts:37`). An initial diagnostics-panel
Stop-button visibility regression was fixed by collapsing diagnostics below active
controls and rerunning the broad check past that assertion. No live model calls.

## Graph-backed current-specification contexts (2026-10-22)

Source formats: no-policy, `headroom-v1` and `staged-guardrails-v1` epic-review format 1.
Additive target: epic-review format 1 also accepts `contextPolicy: current-spec-v1`.
No SQLite/project/portable version, optimistic revision, saved evidence, assessment
or `gap-evidence-v1` fingerprint semantics change. The graph is a derived local index,
never a new persisted source of authority. Existing lossless encodings and explicit
generated-metadata omission legends are reused.

New/changed non-staged workflow work compares current-spec metadata projection before
the existing headroom/staging/splitting path. Reconstruct compatible completed,
partial, exhausted and unpublished-final work under its saved policy first; do not
relabel old calls or repeat them merely to change context representation. Legacy
working-set closure order is retained for exact raw-wire checkpoint reconstruction.
Normalized legacy gap identities use indexed closure with the same evidence set.
The new policy's actual projected context participates in the existing exact basis.
Staged batches retain their original policy and mandatory evidence semantics.

No existing payload or history is rewritten at startup, so there is no SQL migration,
backup rewrite or interruption transaction to recover. Repeated startup is read-only
with respect to this optimization; ordinary publication still uses existing leases
and revision transactions. Unsupported future policy names reject reads without
overwriting saved records. Downgrade compatibility for new-policy jobs is not promised.
Original human evidence, IDs and dated completed work remain intact. This is not a
license to delete history, infer missing supersession or certify stale checks current.

Tests cover current/legacy closure equivalence, cycles/missing links, no shared-file
fan-out, exact retained human evidence, generated-background reduction, ambiguous
answer retention, unchanged input objects, and previous headroom completed/exhausted/
unpublished-final jobs across repeated SQLite reopen and no-replay recovery. Existing
legacy/staged upgrade and future-format rejection tests remain applicable. See
[discovery efficiency](discovery-efficiency.md) for measurement and remaining scope.

Verified on Windows Node 22.23.3: 28 pretests / 632 main tests, final five-test graph
suite including a pre-graph identity oracle, type check, UI build, synthetic benchmark
and focused workflow browser check. No model calls or user database inspection.
Ranked search and narrower semantic invalidation are not implemented by this change;
new-policy portable cross-machine continuation is not separately qualified.

## Oversized workflow context recovery (2026-10-22)

### Staged shared-decision review

Source formats: no-policy epic-review format 1 and `headroom-v1` with retrieval-work
format 1. Additive target format: epic-review format 1 with explicit
`contextPolicy: staged-guardrails-v1` and `guardrailBatches` (1–16 arrays of exact
record IDs); retrieval-work format 1 with optional **format-1 `epicStages`** containing
the complete exact-plan hash, batch count, phase/cursor, drafts, ordered successful
response receipts and per-stage spent attempts. Reports optionally add
`stagedProgress`. No SQLite schema, project format or concurrency revision changes.

Only new/changed above-target work adopts the staged policy. Reconstruct matching
saved profiles and preserve compatible completed/partial/exhausted work first,
including legacy splits. Never relabel an earlier single-context review as a staged
check or reset an attempted stage. No existing payload is rewritten, so no data
reset, migration inference, backup rewrite or SQL transaction is required at startup.
Unknown future policy/checkpoint formats reject reads without overwriting evidence;
downgrade compatibility for staged jobs is not promised.

The stage plan binds all exact batch bases, not just the currently displayed batch.
Every successful response stays in the checkpoint history; draft selection is
reconstructed locally and checked independently in `finishJob` before atomic
publication. Attempts are persisted before inference and reset for the next stage
only alongside the completed receipt. Interrupted/malformed/cancelled responses
do not earn a receipt. Six-request package pauses and final-publication failures
resume explicitly; completed responses do not replay. A genuinely changed guardrail
invalidates the affected plan; dated previous output remains stored and is not
manufactured into current evidence. Ordinary expected-revision/live-lease guards
still apply. Publication scope explicitly records the union of separately reviewed
exact evidence; it is not an expanded single-request context.

Stage base contexts cap at 54k and actual requests at 72k, reserving a 12k draft pool
plus instruction headroom. No human text/provenance is sliced. An indivisible exact
closure or excessive batch count still blocks; semantic model judgments and arbitrary
cross-batch relationships are not claimed as fully verified. Research is unsupported
and explicitly rejected rather than silently disabled. More model calls are possible:
up to sixteen discovery plus sixteen validation stages, three attempts per stage,
six requests per package invocation, with no startup inference or automatic refill.

Upgrade/recovery tests cover repeated SQLite reopen, future checkpoint rejection
without writes, complete legacy-policy reuse, preserved spent attempts, six-request
pause/resume, late veto before publication, unpublished-final recovery, direct storage
rejection of unchecked drafts, changed evidence and cancellation. Verification
results are recorded in the workflow review document.

Implemented verification: type checking, 28 pretests / 626 main tests, UI build,
focused staged/epic browser, and separate portable/specification browser checks passed
on Windows Node 22.23.3. The full browser command still fails its existing resolution
approval assertion at `src/web/browser-check.ts:1347`. No user data or live model calls
were used. New staged clone/pull continuation remains separately unqualified; existing
portable tests do not prove that flow. No completed saved work was deliberately
invalidated to apply this optimization.

### Proactive headroom policy and saved-work preservation

New epic contexts add optional `epicReview.contextPolicy: headroom-v1` and optional
format-1 `epicContextBudget` diagnostics. New reports may add an optional
`contextBudget` summary. Project/SQLite/portable schemas, epic-review format 1,
retrieval-work format 1 and optimistic revisions remain unchanged. Legacy absence
means the original reconstructible policy, not a retroactively invented headroom
policy. Read validation rejects unknown future policies/budget formats without
overwriting their payloads. Downgrade support for the new policy is not claimed.

The 72k target includes the app's context envelope; 96k stays the hard ceiling.
Optimization runs before splitting, with generated-metadata compaction and bounded
exact phrase sharing using the existing lossless shared-text wire representation.
Expanded phrase evidence has the same existing evidence basis. Policy text or
actually loaded evidence may change for new work; its new profile and resulting
exact basis remain explicit, not relabelled as a legacy call.

Before applying new grouping/encoding, reconstruct saved profiles at current exact
evidence and compare package identities, extra loaded records and final/checkpoint
bases. Preserve matching parent packages, previously split children and overlapping
boundary children. Completed outputs and exhausted allowances are retained even
when they exceed the new soft target. Genuinely changed inputs reopen normally;
unrelated edits do not reset completed calls. Cached candidates are local planning
only, not new persisted provenance. No existing source, job, report, snapshot or
assessment is rewritten, so no payload migration or backup transaction is needed.

New writes retain ordinary leases/revision guards. Publication failure after a final
checkpoint can recover under the saved profile without inference. Startup remains
paused. Mandatory evidence that cannot fit 72k is explicitly above target; an
irreducible 95,197-character fixture demonstrates that guaranteed headroom for all
shared human constraints remains a staged-review/scoping limitation, not a passing
optimization claim.

Upgrade tests curate older schema-1 snapshots and no-policy jobs, exercise repeated
reopen, above-target completion reuse, spent-attempt retention, overlapping boundary
children, unpublished-final recovery and future-format rejection without writes.
Growth tests retain new answers/notes and explicit file loads; unsupported oversized
loads still fail before the additional inference. Type checking, `npm test` (28
pretests / 618 main tests), latest 127 context/retrieval/epic tests, UI build and
focused epic browser checks passed on Windows Node 22.23.3. Portable and specification
browser checks passed separately. The broader browser command stopped at the existing
resolution-approval visibility assertion (`src/web/browser-check.ts:1347`), so a full
browser pass is not claimed. No live model calls or user database inspection were
performed. The genuine above-target mandatory-evidence case remains an explicitly
documented limitation, not a forced migration or reason to reset data.

### Near-cap generated-instruction fallback

After the existing exact, deferred-file and lossless snapshot attempts, an oversized
minimum epic package can compact only app-authored policy/encoding explanations.
The combined workflow instruction replaces the redundant legacy single-lens prompt;
known policy fields use concise equivalent rules. A long generated advisory summary
may be replaced with an explicit omission notice. Requirement/scenario text, question
wording/options, human sources/addenda, provenance and mandatory scope remain exact.
This is not recursive shortening of arbitrary `text`/`explanation` fields and does
not raise the 96,000-character limit. The complete workflow envelope is checked too.

Project/SQLite/portable schemas, stage/checkpoint formats and source payloads remain
unchanged. Earlier context forms are tried first, so previously fitting contexts and
their saved identities still reuse without model calls. The shorter policies are
part of the existing conservative exact-evidence basis for newly enabled contexts;
older successful evidence is not relabelled or migrated. Locally size-blocked work
can be reconsidered on explicit retry; spent attempts, jobs and original snapshots
remain intact. Startup never starts inference. Final-checkpoint publication failure
and repeated reopen retain the new representation and recover without replay.

Near-limit fixtures cover both an otherwise fitting 95,808-character working set
that overflows when the workflow envelope is added, and a 97,093-character working
set already over the hard cap. Instruction compaction produces complete requests
of 94,218 and 95,503 characters respectively, while a larger
80-requirement fixture remains explicitly blocked without data loss. Actual user
project fit and live model behavior remain unverified.
Verification: type checking, `npm test` (28 pretests / 608 main tests), latest 117
focused context/retrieval/epic tests and a final near-cap regression passed on Windows
Node 22.23.3. Recovery coverage now exercises the new instruction fallback across
final-checkpoint publication failure and repeated reopening without replay.
UI production build and focused epic browser checks also passed (the existing
>500 kB bundle warning remains). No live model calls were made.

### Distributed approval-history fallback

If splitting and static-file deferral still cannot fit a minimum workflow package,
the builder additionally tries format-1 `reviewSnapshotEncoding` in the request
only. Canonical approval/rejection source strings can reference an exact loaded
requirement's matching statement/scenarios, plus the original decision and exact
addendum. Canonical parsing checks the entire envelope and acceptance serialization;
ambiguous/unknown prose and mismatching historical wording remain original strings.
No human text is summarized, omitted or inferred; original sources are unchanged.

Project/SQLite/portable formats, epic-review/retrieval formats, package membership
and attempt ceilings stay unchanged. Exact evidence hashing expands snapshot
references back to byte-identical strings and excludes only the encoding legend,
so the existing `gap-stage-evidence-v1` identity is preserved. Older fitting contexts
are tried unchanged first. Compatible stages/finals remain reusable, and publication
still uses current revisions/leases. An unsupported encoding format or missing target
fails closed. No startup inference, payload migration, history rewrite or allowance
reset occurs; a previously local size blocker is reconsidered only on explicit retry.

The synthetic distributed fixture retains all 65 requirements, 65 answered questions
and all human sources, reducing the minimum review request from a previously blocked
133,387-character working set to 90,977 characters including workflow instructions.
This is a deterministic fixture result, not a measurement of the user's database.
Tests verify exact round-trip, unchanged evidence hashes, addenda/older rejections,
ambiguous and mismatched history, unsupported encoding rejection, and final-checkpoint
recovery/repeated reopen without replay. Live provider comprehension and the user's
actual saved project remain unverified.
Verification for this fallback: type checking, `npm test` (28 pretests / 607 main
tests), latest 116 focused context/retrieval/epic tests, UI build, focused epic browser
check and whitespace check passed on Windows Node 22.23.3. The broader browser
failure recorded below was not requalified by this backend-only follow-up.

Diagnostic-bound correction: app-generated blocker messages are now explicitly
shortened (with a visible marker) to the existing 1,200-character report-reason
limit before validation. This affects diagnostic prose only, never exact evidence,
fingerprints or stored decisions. The previous overflow failed report publication;
it did not publish an invalid report or apply proposals. Failed job history remains
unchanged, and explicit retry rebuilds the report without resetting saved model
attempts. No schema widening, migration or data reset is needed. Type checking,
48 focused tests and the epic browser check passed, including 20 overlong blockers
and one-copy display of a failed diagnostic. The full suite was not rerun at that
point; the later distributed-approval fallback run above includes this correction.

Source and target remain project/SQLite formats unchanged, epic-review format 1 and
retrieval-work format 1. There is no persisted summary field or schema migration.
Compact requirement previews are derived navigation only, excluded from the existing
exact-evidence basis just like other record-index labels. No saved source, requirement,
assessment, review, checkpoint, spent allowance or original model output is rewritten.

Existing exact-context planning and splitting are attempted first, preserving the
package identities and evidence bases of previously usable/successful reviews. Only
irreducibly oversized packages gain a fallback using the existing deferred-workspace
evidence representation. Their exact human constraints remain pinned; explicitly
requested extra records stay exact. Previously local size blockers had no successful
review or inference checkpoint and can become eligible on explicit retry without
resetting model attempts. Existing model-produced blockers/attempt exhaustion remain
subject to exact evidence matching; no blanket blocker reset is introduced.

Startup performs no inference. Explicit retry reconstructs current exact context;
publication still uses revision/lease checks. Compatible completed reviews and saved
loads/finals retain the existing recovery path. Oversized human evidence still blocks
with more detailed diagnostics; it is not silently reclassified or summarized.
Verification: type checking, `npm test` (28 pretests / 603 main tests), and the
latest 41/41 epic tests passed on Windows Node 22.23.3. Upgrade coverage includes
an older local no-call size-blocker report, exact snapshot/job preservation through
repeated reopen, explicit fallback recovery, and subsequent completed-review reuse.
The focused epic browser check passed including all-blocked diagnostics/mobile;
portable and specification browser checks passed separately. The full browser command
stopped at the resolution approval visibility assertion in `src/web/browser-check.ts`
(line 1293), so a full browser pass is not claimed. No live model calls or user
database inspection were performed; applicability to the user's particular large
shared evidence remains to be checked by an explicit retry.

## Bounded implementation-planning candidates (2026-10-22)

Source and target remain execution schema 1 / planning format 1, with unchanged
SQLite/project/portable formats, freshness checks and config fingerprints. Planning
no longer repeats an unbounded full-project behavior index in each request. Exact
mandatory target evidence and existing dependency guardrails are unchanged. Optional
exact candidates fit within the existing context budget; omitted scope is explicit
and saved as an ordinary unresolved package question. Approval already requires
human resolution notes for questions. Dependencies on omitted behavior are rejected.
This is bounded candidate analysis, not a claim of exhaustive prerequisite discovery.

No saved plans, approvals, assessments, original model evidence or execution sessions
are rewritten. Old approved plans remain current under their original checks.
Explicit retry of a failed/interrupted plan reuses compatible completed packages
unchanged and applies the bounded builder only to unfinished targets. Failed attempts
remain in planning history. Startup does not repeat inference; existing revision,
binding, cancellation, lease and CAS checks still govern publication. No migration
or schema bump is necessary. Mandatory-only overflow remains a blocker and now
reports section sizes rather than suggesting that splitting always solves it.

Verification: type checking, focused planning tests and full `npm test` passed
(28 pretests and 600 main tests) using Node 22.23.3 for SQLite tests. Coverage includes
exact candidate retention, mandatory overflow without inference, persisted omission
questions, rejection of unseen prerequisites, compatible package retry/reopen and
portable partial-plan continuation. `git diff --check` passed. No live model calls
or user database edits were performed. The reported 633,285-character saved prompt
has not been reproduced; excessive mandatory evidence may still block that project.

## Larger mandatory-only allowance for saved follow-up (2026-10-22)

Source and target remain SQLite 3, unchanged project/portable formats and existing
context manifests. A single saved response can now use a final 144,000-character
mandatory-evidence allowance after the previous 48,000/96,000 planning/compaction
passes. Both queue preflight and service planning opt in. Optional reconciliation
candidates remain bounded by the old allowance, and expanded packages do not receive
optional related-record hints. Advisory/help, gap exploration, general discovery and
ordinary focused checks do not opt in. This supersedes the previous change's retained
96,000-character cap for this specific workflow, not its evidence-preservation rules.

No persisted records, fingerprints, semantic assessments or completed checks are
rewritten or invalidated. Older needs-attention submissions retain their applied input
and retry explicitly using the new planner; reopening does not call a model. Existing
lease, expected-revision, cancellation and publication checks are unchanged. Over-limit
input still saves a preflight blocker without inference. Failed/provider jobs retain
their original evidence; the allowance is not a guarantee of model capacity.

Verification on Node 22.23.3: type check, 75 focused tests and full `npm test` passed
(28 pretests, 598 main tests). The new disk-backed upgrade test preserves a legacy
96,000-character blocker across reopen, then verifies one explicit saved-response
retry, exact human sources/question options, no optional refill and no duplicate input.
Existing queue tests now exercise retained blockers above 144,000 characters. A
read-only check of all four actual blocked submissions at revision 1935 reproduced
their previous sizes and confirmed preflight succeeds at 118,706, 103,292, 115,617 and
102,472 characters against the new cap. No project data was edited or inference run.

UI build passed. The browser suite passed its updated oversized-response/addendum
blocker/reload/retry flow, then failed later at `src/web/browser-check.ts:1293`, waiting
for a requirement heading in a collapsed epic. That unrelated browser flow, and later
scripts skipped by the chained command, are not reported as passing.

## Background approval projection for saved follow-up (2026-10-22)

Source and target remain SQLite 3, existing project/portable formats and context
manifest decisionProjection format 1. Isolated follow-up now uses the same verified
current-decision projection as gap exploration, only for background records. Target
requirements and explicitly requested evidence keep their original approval history.
Exact current wording/scenarios, human addenda and ambiguous provenance are retained.
No sources, links, revisions, assessments, fingerprints or completed jobs are rewritten;
there is no schema migration or startup inference. Old needs-attention submissions
use the updated planner on explicit retry, preserving their already-applied responses.
The mandatory input cap and existing revision/lease/publication checks are unchanged.
Oversized human evidence can still block, without manufacturing a current decision.

Verification: type check, 102 focused context/retrieval/specification/approval tests,
and full `npm test` passed (28 pretests, 597 main tests) using the existing Node
22.23.3 installation. The new regression covers oversized superseded background
approvals, repeated planning, unchanged original records, protected target/supporting
history and blocking for human addenda, unknown prose, branched or mismatched evidence.
Existing queue restart/retry tests also passed. The initial default-Node-20 test
attempt was blocked by the installed SQLite native module's Node-22 ABI; no modules
were rebuilt. No live provider calls or user database edits were performed. The
reported project's exact context has not been reproduced against its saved data.

## Local completion of plain approvals (2026-10-22)

Source and target remain SQLite 3 and the existing project, submission and portable
formats. No startup rewrite, schema bump or fingerprint change is needed. A newly
submitted approval with a whitespace-only/empty note runs the existing transactional
review checks and records the original input, confirmation source and applied revision,
then completes without a model job. Automatic AI processing may remain paused.
Notes, rejection and change requests retain their existing follow-up behavior.

Older queued approvals still pass current safety checks before application. Older
applied `saved` plain approvals without a job or overlap receipt can complete locally
on explicit resume, including recovery after interruption between application and
completion. Application is not repeated. Reopening alone does not convert saved work
or run inference; completed results, failed model-job evidence and interrupted overlap
receipts remain unchanged and use their existing explicit retry/continuation paths.
Original evidence, history, semantic assessments and completed checks are retained.

Upgrade/recovery coverage is in `src/service/local-approval.test.ts`: queued and
already-applied legacy submissions, repeated reopen, request replay, active-worker
exclusion and retained failed-job retry. No user database reset or model call is required.

Verification (Windows, Node 22.23.3): all 101 focused approval/change-request/recovery,
decision-availability and context tests passed; type checking passed. The broader
`npm test` run passed its 28 pretests and 594/595 main tests before the final scoped
approval test was added. Its remaining failure is the static Review UI expectation
at `src/core/refinement.test.ts:383` (`Approve resolution` is absent in collapsed
epic markup); that test does not use the changed discovery queue. UI work already
in progress was left untouched. No live-provider or real-project latency benchmark
was run; these checks establish avoided model calls, not a fixed timing guarantee.

## Continuous specification (DEC-030)

Source and target remain SQLite 3, portable manifest 3 and existing project/feature
artifact versions. This is an additive forward read path, not a database rewrite:
requirements may now contain optional `authority` format 1 (`answer-derived`, exact
source IDs, explanation and publication revision); analysis/job results may contain
optional `specificationUpdates` format 1. Both envelopes reject unsupported formats.
Project parsing preserves authority; portable import checks its source links and
revision rather than manufacturing missing provenance. Markdown exports explicitly
distinguish answer-derived wording from separate human approval.

Missing envelopes mean legacy behavior. Reopening never adopts old proposals,
changes old accepted/rejected decisions, or repeats model work. Saved results,
checkpoints, assessment identities and review/content fingerprints keep their existing
algorithms. Authority itself is not added to old fingerprints: it describes how
wording was recorded, not a different behavioral specification. Actual wording/source
changes use existing freshness rules; valid unchanged assessment/delivery evidence is
not invalidated solely by this compatible workflow addition. Older binaries are not
qualified for editing projects containing the new metadata (they may strip unknown
fields); retain this version or newer when sharing these projects.

New updates, authority and job output commit in the existing publication transaction
with a live lease and expected revision. Failures roll back the entire publication;
original inputs remain available for explicit resume. No separate version bump or
startup migration/calls are required. Human approval sources are never synthesized or
superseded by automatic updates, and original wording/IDs remain in revision history.
Refinement and explicit review preserve their original evidence semantics.

Upgrade tests in `src/service/specification.test.ts` use older saved proposals and
approvals, interrupted input, repeated SQLite reopen, explicit retry and portable
round-trip preservation. Future authority formats fail closed. Verification results
are recorded in [continuous specification](continuous-specification.md#compatibility-and-verification):
type check, all 613 deterministic tests and all eight browser checks passed on Windows
Node 22.23.3, including repeated reopen/retry and portable preservation. The production
build, both CLI help commands and diff check passed. Live semantic fidelity remains
unqualified; no live provider calls or user database rewrites were performed.

## Evidence-blocked epic outcomes and independent continuation (2026-10-22)

Source and target remain SQLite 3, epic-review/retrieval format 1 and unchanged
project/portable formats. A new valid `reviewBlocked` response is saved atomically
as a completed job with its existing `epicReviewReport` blocker and no `result`
or retrieval final. Completion records finished work, **not** a reviewed package.
The transaction requires a live lease, matching expected revision, package blocker
and matching spent-attempt count; it makes no specification revision. Invalid
output/provider failures retain failure semantics. Targeted runs continue independent
packages after valid evidence blockers without extra retries or relaxed run bounds.

No persisted-data rewrite or schema migration is necessary. The planner recognizes
both old failed blockers and new completed-without-result blockers, preserves their
specific reasons, checkpoints, original IDs/history and spent attempts, and skips
unchanged packages. No automatic inference, blocker reset or reassessment is granted.
The uncertainty-versus-factual-evidence clarification is runtime prompt text only:
package construction, exact context data, evidence/check fingerprints and compatible
saved finals remain unchanged. Existing genuinely stale evidence is not made current.
Older failed jobs are not relabelled; downgrade behavior for the new outcome semantics
is not qualified.

Upgrade tests reproduce the previous failed-blocker payload, retain a new blocker
after an exact load plus a completed check, reopen SQLite twice and verify no replay
or rewrites. Tests also cover grounded unknown-startup questions, linked versus
path-mentioned script evidence, independent continuation, all-blocked termination,
provider/malformed failures, cancellation, stale revisions and expired leases.
Live model question quality and the reported project's actual scan/link state remain
unverified; no user database inspection or live calls are required by these checks.
Verification: type check, full 584-test suite, latest 38/38 epic tests, production
UI build and epic browser regression passed on Windows Node 22.23.3. The final
targeted run includes an additional ten-package-ceiling check. The browser assertion
was updated after its first run to expect the final run outcome rather than the
intermediate blocker; saved blocker details remain explicitly asserted.

## Compact Design discovery and review pauses (2026-10-22)

Source and target SQLite, project, portable, assessment/checkpoint and job formats
are unchanged. The single Design button now explicitly chooses existing epic mode;
it does not convert legacy checks, reset spent attempts or invalidate compatible
workflow results. Existing per-project `reqwizit-question-target` browser preferences
retain their key, bounds and meaning under the **Questions ready** label.

Review now prevents predictable unsafe submissions while live workers or related
unfinished input block a decision, instead of inviting queued approvals. This changes
UI availability only: original submissions, notes, decision bases, histories and
transactional storage/queue semantics remain untouched. No forward data migration,
startup inference or reassessment is needed. Existing saved queued reviews remain
recoverable under their original checks. Failed/cancelled/completed jobs and expired
leases do not independently leave a live-worker UI lock; other blockers still apply.
Deterministic render tests cover these states and read-only notes; browser coverage
checks a blocked click creates no submission, retained notes and an explicit later
decision. Concurrent unrelated publication remains future work.

## Epic question continuation / waiting isolation (2026-10-22)

Source and target remain the existing epic-review format 1 and unchanged SQLite,
project and portable formats. This is a planner correction, not a saved-data
rewrite: unresolved questions no longer participate in requirement/note grouping
or boundary pairing; they have waiting-only singleton packages and remain exact
supporting evidence for linked targets. Recompute scheduling on explicit review.
No startup inference or reset is required, and existing question IDs/answers,
source evidence, jobs, checkpoints, spent attempts and histories are retained.

Package IDs and exact-evidence keys keep their existing algorithms. Compatible
requirement/note packages retain their memberships and completed checks. Former
mixed packages containing unresolved questions were waiting, not completed review
work; they are not relabelled as checked. Saved original package records remain in
history. Human approval semantics/fingerprints are unchanged. For discovery only,
an explicitly other-workflow question's shared-source citation does not block
independent review; source-only/global uncertainty, direct links, answer provenance
and saved human input remain conservative blockers. Previously dated evidence is
never made current by changing this scheduling rule.

Tests cover stable independent workflow/boundary identities after three new
grounded questions, separate approval/global-question gates, ten-question
continuation with overshoot, and repeated SQLite reopen preserving prior completed
checks, pending questions and original jobs without replay. A deterministic browser
fixture exercises 24 requirements in one epic and four sequential three-question
results, retaining twelve questions with a target of ten. Live-provider behavior
has not been requalified by these fixture checks.

Verification on Windows Node 22.23.3: full deterministic suite **572 passed**;
final targeted epic/backlog suite **42 passed**; type check, UI build, epic-review
browser regression (including shared-source citations), and diff check passed.

## Configurable gap question targets (2026-10-21)

SQLite/project/portable schema versions, check fingerprints and evidence identities
are unchanged. Targeted gap jobs add optional `context.questionTarget` scheduling
metadata; legacy jobs without it keep their original five-pending publication policy.
The browser remembers each project's target in a separate localStorage key (default
5, integer 1–50); this is a local UI preference, not a shared specification decision.
No saved records need rewriting, no forward data transformation is required, and
existing completed checks, request allowances, IDs, evidence and histories remain
valid. Changing the target does not trigger reassessment or reset model-call budgets.

Publication permits final-package overshoot only for explicitly targeted jobs;
ordinary no-new-question follow-up also tolerates already-saved larger backlogs.
Each package retains the existing expected-revision transaction/checkpoints. Stopping,
failure or restart preserves earlier packages, without automatically restarting
inference. Existing legacy-reopen/checkpoint tests remain applicable; targeted queue
tests cover successive publication, overshoot, already-exceeded targets, empty work,
failure/cancellation and ordinary follow-up with more than five pending questions.

Verification: Windows Node 22.23.3 type checking, deterministic tests, UI build,
main/portable browser checks and the epic-review browser check passed. Browser
coverage includes per-project target persistence, multi-package exhaustion, saved
stage reuse, outcome explanations and mobile layout. Live model usefulness/cost
and long-running live scan behavior have not been qualified; no provider inference
was used for these checks.
Two full runs passed 568 tests before the additional API-boundary test was added.
The final 569-test run passed 568, with a Windows `EPERM` creating the unrelated
credential transaction lock directory; both credential tests passed on isolated
rerun. The new question-target API test passed in that full run.

## Definition-only word help (2026-10-21)

The prior question-local fix still allowed vocabulary clicks to pull in more than
48k of exact project/dependency evidence. New UI clicks use the additive `define`
help action with `word: { phrase, text }`, instead of encoding vocabulary help in a
generic `follow-up` message. New `word-help-v1` manifests explicitly describe a
partial question representation: exact enclosing wording plus the selected display
field in the request, not a review of full question/evidence records. No evidence
is truncated or rewritten; this request is only authorized to explain terminology,
not recommend product choices. Other help actions keep their guarded context.

SQLite, portable formats, assessment semantics and freshness identities are unchanged.
Old requests/manifests/responses remain valid and unmodified; the UI recognizes
legacy word-help message prefixes as well as structured definitions. There is no
startup transformation, automatic retry, data reset or model-call replay. A failed
old explanation remains historical; a new click explicitly requests a definition.
Completed new definition jobs round-trip through the same durable job storage.
No queue or lease/revision/cancellation policy changes are made.

Regression fixtures reproduce more than 73k of mandatory guardrails while discovery
holds a live job: broader advice blocks with no inference, but definition-only help
completes without modifying human state, the live job or the failed attempt. Two
reopens preserve exact jobs and revisions without replay. Additional checks cover
large option fields and linked files, prior advice omission, exact display-field
validation and malformed definition payloads. Live provider qualification is not
established by these fixtures.

Verification: `npm run check`, all 571 deterministic tests (566 main-suite and
five worker lifecycle checks), `npm run test:browser` (including the UI production
build and portable-browser checks), and `git diff --check` passed with Node
22.23.3 for SQLite-backed checks. No live model calls were made.

## Question-local advisory help context (2026-10-21)

New help jobs use a `question-help-v1` context manifest instead of the generic
`epics-v3`/`tasks-v*` working-set manifests. SQLite, portable formats, help request/
response schemas and assessment/checkpoint identities are unchanged. This is a
new-request selection policy, not a reinterpretation of completed evidence; no
forward payload transformation, reset or startup model call is needed. Historical
manifests, failed jobs, guidance, IDs and revision provenance remain unchanged.
New requests reuse the ordinary completed-help history window, including legacy
responses, without automatically retrying failed jobs. Existing transactional job
publication, revision validation, cancellation and lease recovery remain in place.

Unlike the former advisory fallback, current feature notes and dependency human
guardrails are explicitly pinned alongside target evidence. Unrelated generated
records are no longer added simply because they fit a discovery budget. Truly
oversized mandatory evidence still blocks before inference; this does not mark
previous valid help stale or require users to repeat completed calls.

Upgrade tests construct legacy completed/failed help manifests, reopen twice,
verify exact original jobs and human revisions, then explicitly request new help
using the retained guidance. Scope/budget tests cover concurrent discovery,
forward-only shared-file links, moved source ownership, request reservation and
history omission counts. Live model qualification is not established by fixtures.

Verification: `npm run check`, all 569 deterministic tests (564 main-suite plus
five desktop worker lifecycle tests), and `git diff --check` passed. Tests ran
with the existing Node 22.23.3 runtime because the default Node 20 executable is
incompatible with the installed SQLite native module. No dependencies were rebuilt,
no live model calls were made, and browser automation was not repeated for this
service-only change.

## Desktop backend isolation and continuation comparison cache

SQLite schema 3, execution schema 1 and all portable formats are unchanged. Desktop
startup now opens the same store and protected provider service in an owned worker
thread; no records are transferred to a replacement database. Shutdown still waits
for service cancellation and store publication. Interrupted work retains the existing
lease/recovery and explicit-resume rules; worker failure never starts replacement
model calls automatically. No forward data transformation or startup replay is needed.

Continuation export caches only the current snapshot's serialized fields and array
items for the lifetime of one call. Historical records are still loaded/validated;
selection, exact delta encoding, object hashes/order, original evidence, assessment
identities and checkpoint reuse remain unchanged. No persistent cache or freshness
key is introduced. Existing transactional publication, pending hashes and conflict
checks remain in place; cleanup is awaited rather than forcibly terminating writes.

Verification (2026-10-21, Node 22.23.3): portable tests compare exact delta/object JSON
bytes with the previous encoder and restore historical arrays/scalars/evidence;
existing clone/adoption, interrupted scan/planning and assessment reuse checks passed.
All 565 deterministic tests passed (560 engine/UI/API plus five worker lifecycle
checks). Independently staged real Electron startup/relaunch/
shutdown checks passed without user-data writes or model calls. Installer upgrade
and a real process-crash-during-publication check were not repeated.

## Git-assisted assessment navigation

SQLite schema 3/execution schema 1 and portable formats are unchanged. Fresh assessment
windows now prioritize current captured files using exact feature IDs from bounded Git
history and net changes since the existing scope-specific assessment `head`. These are
ephemeral navigation hints only, not new evidence or reuse boundaries. No saved records,
timestamps, provenance, assessment identities/fingerprints or concurrency counters change.
Existing compatible results are reused before consulting history; no startup migration,
data reset or repeated model call is required. Missing old commits/history fall back
without manufacturing a baseline. Cancellation and current-source validation remain intact.
No new caches are persisted, so reopen/retry reconstructs hints from current Git state.

Verification (2026-10-21): type checking, 32 targeted storage/implementation tests and
all 559 deterministic tests passed on Node 22.23.3, including real Git history,
exact IDs, revert/net changes, dirty/untracked
files, missing commits, cancellation, reviewed boundaries, and existing SQLite reopen,
legacy enrichment, reuse and delivery checks. No live inference or speed benchmark run.

## Assessment context packing and isolated blockers

Saved formats remain SQLite schema 3/execution schema 1; no data transformation or
startup replay is needed. Assessment now also uses the existing lossless record-table
wire encoding for decisions, guardrails, supporting requirements, questions/options
and research when text/ID sharing alone exceeds the cap. This changes representation
only: exact values/order, missing-vs-null fields, expanded IDs and current file bytes
remain unchanged. The 48,000-character cap, context policy, assessment semantic identity
and relevant-input fingerprints are unchanged, preserving compatible completed work.

Assessment context-size failures now populate the existing per-requirement `contexts`
map with their over-budget manifest and retain the first legacy `contextBlock`. Older
runs without these entries remain readable without inventing per-target diagnostics.
Each blocker is checkpointed normally; blocked targets never enter `completedIDs` or
overwrite earlier findings/delivery evidence. Other requirements and the independent
main phase can continue; affected phases finish blocked. Cancellation/non-context
failures still stop, retaining prior checkpoints. Coding remains stop-on-blocker.
Publication/session details remain local and are omitted from portable continuation
as before. Explicit incremental retry reuses compatible completed results after reopen;
no schema or concurrency-version migration is required.

Verification (2026-10-21): all 557 deterministic tests passed on Node 22.23.3,
including existing migration fixtures and the new multi-blocker checkpoint/reopen
test. An additional 18 context/storage/migration checks passed after strengthening
the non-mutation assertions. Type checking, desktop compilation, production UI build
and main browser checks passed. The separate portable browser check remains blocked
by an ambiguous `Open shared checkpoint` selector. No live inference was performed.

## Desktop branding and integrated Windows title bar (presentation only)

The Q/checkmark assets and native Windows overlay change no persisted formats or
freshness rules. Existing appearance preferences supply accent/contrast colors
unchanged; no new settings keys, schema versions or data transformations. Saved
decisions, IDs, history, assessments and completed evidence remain untouched.
Staged and packaged desktop checks reopen an existing Node-created store and verify
saved-project continuity and shutdown without model calls.

## Application menu and recent workspaces (presentation/local preference only)

No SQLite, portable-state, artifact, assessment, fingerprint or job format changes.
All existing saved projects remain available in the new menu, without repeating
model calls or changing revisions. The additive `reqwizit-recent-workspaces`
localStorage key stores up to 100 distinct project IDs in selection order; absent,
malformed or non-array values start empty, and non-string entries are ignored.
Untracked projects retain the existing newest-created order. Unknown IDs are never
rendered as projects. This preference is not exported or used as decision evidence;
it needs no transactional data migration. Failed preference writes retain in-session
ordering and cannot overwrite project data. Existing appearance settings are reused
unchanged for the accent-colored header. Browser checks exercise malformed old
preferences, initial saved-project access, selection order and reload.

## Definition assessment clarity (presentation only)

No source/target format change or forward migration is needed. SQLite, portable
state, workspace artifacts, assessment revisions/checks, evidence and freshness
rules remain unchanged. The progress view partitions saved findings into current,
outdated and unassessed areas without rewriting them or invoking inference. Existing
overall score calculation is preserved; no saved work is invalidated by this display
change. Tests exercise older revision assessments, mixed freshness, unknown areas,
missing evidence and read-only rendering. Relevant-input freshness and explicit
whole-area reassessment actions are not implemented by this change.

## Portable projects and workspace-folder rename (DEC-029)

Workspace manifest **1/2 → 3**; feature/project/progress JSON remains format **2**.
New `state.json`, `execution.json`, and `continuation.json` each have independent
format **1** envelopes. SQLite remains schema **3**, with an additive, initially empty
`portable_import_backups` table; execution schema and assessment identities are unchanged.
No original database revisions, jobs, evidence, assessments or completed calls are
deleted, recomputed or invalidated simply to adopt this representation.

`.requirement-wizard/` is renamed to `.reqwizit/` only after the existing artifact
hash/journal checks succeed. A same-parent directory rename preserves bytes and unrelated
files and is recoverable on reopen; existing publication journals still apply at the
new path. Both folders existing is a conflict, never an automatic selection/merge.
Active discovery/scan/implementation leases defer migration/publication until worker release. Do not
restart a real long-running check solely to migrate the folder. Unavailable/edited
folders retain local state and report a conflict/unavailability. New portable files use
the normal intended-hash journal and manifest-last publication, including retry after
interruption. Folder-local `.gitattributes` disables text conversion to preserve hashes
and exact human evidence through Windows Git checkout.

Portability is a continuation projection, not an export of the activity archive.
Current sources/decisions and necessary supersession links remain intact. Execution
keeps semantic findings, exact capture/context/model/footprint identities, manual
invalidation requests, latest impact evidence per scope, planning packages and coding
commit/PR/delivery evidence. Process/session/worktree details and progress transcripts
are omitted. Original revisions used by retained discovery/checkpoint receipts are
exact array-prefix/suffix deltas with content-hashed shared records against current state, decoded one snapshot at a time
to avoid materializing a full revision archive in memory. Completed ordinary
interpretation/help jobs and activity events are not imported. Local database-history
compaction and further source pruning are separate future work. Completed refinement
checks whose target fingerprints cannot pass the existing reuse predicate are omitted;
their current approved/dismissed proposals and supporting source evidence remain intact.
Retained completed refinement checks use a marked `portableReceipt: 1` ledger with
their original outcome/model/keys, not their runtime navigation indexes. Historical
snapshots retain the original schema-valid payload even when an older release retained
duplicate/dangling references; they are never substituted for the validated current
project graph. Legacy context reconstruction must still prove its original wire hash.

Import/adoption is explicit, hash-checked and transactional. It rejects future envelopes,
malformed records/references, path traversal/links, inconsistent revisions and divergent
local state. Size bounds are 64 MiB/artifact and 256 MiB/set. The selected account route
and folder binding are local; old model IDs remain inference provenance. Pending
discovery work is imported interrupted, automatic processing is paused, and source-scan
bindings are explicitly mapped to the new workspace. Planning bindings are remapped;
coding runs retain a foreign binding and cannot silently reuse absent local worktrees.
Opening never runs model calls, repository commands or verification scripts.

Before adopting a changed shared checkpoint into an existing local project, original
current project/execution payloads and overwritten job/submission records are retained
in `portable_import_backups` in the same transaction. Prior revisions and other jobs/
submissions remain in place. Idempotent open creates no backup or revision. A failed
import rolls back everything, including backups. Recovery can inspect the backup table
offline; there is not yet a restore UI. A normal consistent SQLite backup remains
recommended before upgrading real data. Legacy manifest 1/2 exports cannot supply the
working state they omitted: upgrade/sync from their originating database first.

Excluded publication-directory omissions normalize to the legacy marker for full-capture
identity; scoped footprints ignore both folder names. This preserves previous equivalent
assessment identities across the rename without manufacturing inspected code. Other
byte/scope/decision/model changes retain existing conservative invalidation rules.

Initial checks: typecheck and the dedicated portable storage suite passed, including
an actual Git commit/clone into a fresh database: one completed assessment was reused
and only two unfinished requirements invoked the deterministic adapter. Changed code
then required fresh assessments. Dedicated browser checks passed for open, retained
evidence, paused queue, reload, shared-checkpoint acknowledgement and 390px layout.
Broader checks and remaining gaps are recorded in project-workspaces.md. No live model
calls, user database writes or RustGrindGalaxy folder migration were performed.

A subsequent read-only RustGrindGalaxy projection validated 390 retained original
revision-evidence snapshots and all 276 saved workspace assessments with exact data
and freshness parity. A naive array-delta representation exceeded the string-size
bound; content-hashed shared records and exclusion of provably obsolete target checks
reduced the portable set to 51,862,803 bytes. See project-workspaces.md for counts,
timing and remaining large-project/live qualification limits. Historical duplicate
references exposed by this check remain original evidence, not silently repaired data.
Final verification: Node 22.23.3 typecheck, all 553 deterministic tests, standard and
portable browser checks/UI build, terminal help commands and whitespace checks passed.

## Assessment responsiveness

SQLite **3 → 3**, execution schema **1 → 1**, assessment identity/fingerprint
formats unchanged. This is a query/render optimization, not a data migration.
Existing saved jobs, assessments, activity entries, workspace outputs, dates and
delivery evidence are not rewritten on startup or invalidated. No model calls
are replayed. Full history remains accessible through existing history APIs;
workspace polling selects its existing last-20 ordinary-job window in SQL before
decoding payloads, with advisory help history retained.

Execution saves retain immediate transactional CAS, worker/discovery exclusions
and atomic activity publication. Already-indexed activity IDs are checked inside
the same write transaction before historical revision resolution, matching the
existing insert-if-absent behavior. A failed write is retriable without advancing
the caller's version; first/new outcomes still resolve original revision evidence.
The browser's calculation projection is memory-only and never persisted. It retains
capture/impact inputs and does not certify freshness from revision/version alone.
Existing version/future-format rejection remains in place on full record reads.

Regression coverage includes SQL-only checkpoint guards/stale rejection, skipped
historical resolution, last-20/help ordering and old-job preservation across reopen,
same-version worker projections and calculation parity/invalidation. Existing
transactional migration/backfill and repeated-reopen tests remain applicable.
Type checking, all 540 deterministic tests, the UI build and full browser checks
passed on Node 22.23.3; no user database, saved evidence or live model connection
was used for verification.

## Epic workflow review

Area-boundary correction (2026-10-21): SQLite **3 → 3**, review/checkpoint format
**1 → 1**; no identity/fingerprint changes or startup rewrite. Response schemas now
restrict proposal epic IDs to detailed areas, with independent pre-checkpoint validation.
On explicit retry only, an older saved final that assigns proposals outside those areas
is omitted from the new job's cloned work before requesting a corrected response.
The original failed job/output, evidence, load stages and cumulative attempts are
preserved; the three-attempt ceiling is not reset. No valid completed checks/finals
are invalidated, no proposal is reassigned, and startup never calls the model.
Existing lease/revision-checked checkpoints and atomic publication remain in force.
An on-disk older invalid-final fixture verifies repeated reopen, original-payload
preservation and successful corrected retry; valid final recovery remains covered.
Type check and all 535 deterministic tests passed on Node 22.23.3; no live calls.

SQLite **3 → 3**; additive, separately versioned format-1 `context.epicReview` and
`epicReviewReport` job envelopes. Existing retrieval checkpoint format **1 → 1** is reused
for at most one exact-load stage, three cumulative attempts and a validated final response;
legacy continuation receipts/allowances are not accepted for epic review. No startup
rewrite, migration sweep, inference, data reset or implementation-assessment invalidation.
Old projects/jobs, evidence IDs, completed checks, history and workspace outputs are not
rewritten. Old per-record/lens checks are not equivalent to combined package reviews and
remain available under the old action; no old check is silently promoted or discarded.

New identities bind package kind, epic membership and exact current evidence/guardrails.
Changed grouping or genuinely changed evidence creates new review work with old evidence
retained. Unrelated revision increments alone do not invalidate compatible packages.
Saved additionally loaded records receive independent exact-freshness checks, including
outside the base package. Failed-attempt reuse can reconstruct its original revision to
avoid either stale facts or an allowance reset. New planning reads only epic-review job
history rather than parsing large legacy navigation outputs.

Checkpoint writes remain leased and expected-revision checked. Completed loads are replayed
locally, not through the model; final responses are validated and saved before atomic
publication. A publication interruption can reuse a compatible final without inference.
No-call idle reports never advance the specification. Future/malformed new envelopes reject
reads without overwriting saved payloads; old missing envelopes retain legacy semantics.
Forward compatibility does not authorize downgrading an app to a version unaware of these
new review semantics.

Upgrade tests use an on-disk older project/job set, verify unchanged old jobs, saved-load/final
preservation, repeated reopen and publication-failure recovery without repeated calls, and
reject a future review format. See [epic workflow review](epic-workflow-review.md) for checks
actually run and remaining live semantic/performance qualification. No user database or
live provider was used.

Verification: Windows Node 22.23.3 typecheck, 533 deterministic tests, latest 21 epic
tests (including cross-revision publication recovery), all browser suites, UI build,
both CLI help commands and whitespace/link checks passed. Browser failures and their
corrections are retained in the linked verification record. No live model qualification
is claimed.

## Review update warning instead of acknowledgement

Presentation/workflow only; persisted formats, fingerprints and decision-context rules
are unchanged. New Review decisions use the currently displayed revision rather than
the unsent draft's initial comparison revision. The original draft/note is kept for
comparison, with an update warning above the decision buttons. Existing submissions,
conflicts and saved evidence are not rewritten or automatically retried. No startup
migration, reassessment or model call is required; submission-time stale checks remain.

## Exhausted gap-task scheduling and blocker reporting

SQLite **3 → 3**, gap report **1 → 1** with optional `requestBlocked` and bounded
`exhaustedTasks` fields. No schema conversion, startup sweep, evidence-key change,
allowance reset, inference replay or assessment invalidation. Existing saved projects,
jobs, checkpoint/final responses and historical reports remain byte-for-byte unchanged on
reopen. New reports include request-limit blockers within the existing `blocked` total,
not `checked`; `requestBlocked` is a subgroup and its list is capped at 20. Old reports
without these fields retain their original meaning and counts.

The read-only backlog projection now recognizes failed/cancelled/interrupted/stale gap
jobs with a valid one-time continuation receipt, six spent attempts and no saved final
response. For the same target/lens/current evidence key and model/connection, the task is
blocked rather than pending. A later compatible completed check wins; valid saved final
responses remain available for publication recovery. Three-attempt tasks retain explicit
continuation eligibility. Unknown/malformed allowance and receipt formats reject reads
without overwriting saved payloads; diagnostics alone never establish exhaustion.

Storage reads only allowance/model metadata, not growing navigation bodies or saved
output, for scheduling. On the next explicit Explore/Resume action, another pending task
may run under its own allowance; the exhausted task receives no calls or new grant. If
only blocked/waiting work remains, the no-call report creates no specification revision.
Unrelated revision/summary changes do not reset the blocker. A genuinely changed
evidence/scope key or different model/connection is distinct work, with original attempts
and evidence retained. No user must reset data or edit decisions just to upgrade.

Upgrade tests cover legacy six-attempt payloads and repeated reopening without rewriting
them, parity between full-job and compact scheduling metadata, blocked-not-checked counts,
next-task routing, no-call all-blocked scopes, saved-final exclusion, model/evidence changes
and rejection of future allowance/receipt formats. Browser checks exercise the matching
request-limit label and target/lens list, next-task routing, retained history, reload and
mobile layout. No live provider calls or user-data edits are required for these checks.
Verification on Node 22.23.3: typecheck, all 511 deterministic tests, standard browser
checks, the navigation browser check and whitespace checks passed. A read-only plan of
Rust Grind Galaxy revision 1694 reported one request-limit blocker and selected another
check; it did not infer or write project data. Existing large-bundle warnings remain
non-blocking. Older builds with strict report readers do not support the new optional
blocker fields; reopen newly saved reports with the updated app rather than downgrading.

## Explicit navigation for saved IDs in quoted explanations

SQLite **3 → 3**, retrieval envelope **1 → 1**, evidence-basis compatibility
**gap-stage-evidence-v1 → gap-stage-evidence-v1**. There is no startup conversion, data
reset, model replay, specification revision or allowance reset. Before a new gap request,
an optional `quotedRecordNavigation` index promotes at most 32 exact whole IDs in quoted
context text into explicit handles, restricted to existing omitted saved records and spare
context space. It never adds detailed evidence, authorizes citations, resolves human intent
or follows a path/URL. Freeform strings alone remain invalid retrieval handles.

This index is navigation-only, like search results and ordinary record indexes, and is
excluded from the existing evidence-basis calculation. Exact quoted text and all detailed
records remain in that calculation. Older compatible stage/final receipts retain their
original keys/revisions/sessions and reuse checks; original wire-hash verification for
legacy receipts without a basis is unchanged. No saved receipts are rewritten on startup.
Failure diagnostics now distinguish canonical handles that were already loaded, not
offered or duplicated, and unavailable request items without echoing unknown model text.
Future envelope rejection and existing context/attempt bounds remain unchanged.

Tests cover exact and substring references, unknown IDs, the 32-handle/spare-space limits,
unchanged evidence identity, unseen-citation rejection and exact loading through the real
service. A read-only reconstruction of Rust Grind Galaxy's failed request at revision 1694
accepted its seven requested IDs after two quoted handles were offered: 55,020 / 96,000
characters, with unchanged evidence identity. This was validation only, not a new model
call or completed discovery; its six spent attempts remain six and the task remains
incomplete. Original project data and job/session evidence were not modified.
Verification on Node 22.23.3: typecheck, all 508 deterministic tests, the navigation
browser check and diff whitespace checks passed. Live discovery was not retried.

## Explicit one-time gap continuation allowance

SQLite **3 → 3**; retrieval envelope **1 → 1** with an optional strict
`continuation: {format: 1, sourceJobID, fromStage}` receipt. Existing jobs remain byte-for-byte
unchanged on reopen; no startup inference, schema conversion, assessment invalidation or
workspace rewrite is needed. Legacy jobs without a receipt retain the three-attempt,
two-navigation-stage limits. Only the explicit revision-checked continuation action grants
up to three more attempts once, raising lifetime maxima to six attempts/five stages. Gap
report `modelCalls` accepts up to six; it is a diagnostic count, not evidence of readiness.

New jobs copy compatible checkpointed work and retain original evidence bases, revisions,
sessions and cumulative attempts. The receipt records the exhausted source job and first
unfinished stage. Extended prompt limits start there; replayed older stages keep their
original input identity. Original source jobs, human input and specification histories are
not rewritten. A pre-upgrade failed final navigation request that was never checkpointed
is not invented from a diagnostic; continuation may need a new request for that unfinished
step. Original final responses still use the existing publication-reuse path, not a grant.

The owned-worker lease excludes concurrent discovery. The receipt is checkpointed before
any newly allowed inference; failure/cancellation and reopening retain both grant and spent
attempts. A durable task-identity lookup rejects a second grant even after a successful
continuation. Stale revisions, changed task evidence, different models/connections,
cross-project IDs and obsolete attempts reject rather than reset work. Unknown receipt
formats and extended counts without a receipt reject without replacing saved bytes.
Older app versions do not support newly granted extended envelopes; use the updated app
to reopen them rather than downgrading. No destructive migration needs a separate backup.

Upgrade tests cover legacy exhausted jobs, repeated reopen, original payload preservation,
compatible stage reuse, explicit grant, failure/retry accounting and six-call exhaustion.
API/browser checks cover authentication, origin/revision/ownership/active-worker checks,
confirmation/cancel, saved receipt visibility, reload and mobile layout. Live provider
continuation remains unqualified; no user database was modified during development.
Verification on Node 22.23.3: typecheck, all 505 deterministic tests, standard browser
checks and the extended navigation browser check passed. UI builds retain the existing
non-blocking large-chunk warning. Diff whitespace checks passed.

The continuation action is also rendered next to the diagnostic inside Processing &
queue. This UI-only recovery placement changes no persisted formats, identities or grant
rules. Ordinary Resume is hidden there for exhausted-only work; queued/saved responses
keep their separate Resume control. The navigation browser check exercises granting
from inside the modal rather than reaching a control behind it.

## Gap retrieval shared-file scope correction

SQLite **3 → 3**; no schema/payload conversion, fingerprint-version change, startup
replay, or assessment invalidation. A gap lookup now loads an explicitly requested
workspace source without using that source as a submission trigger for every requirement
citing the same file. Exact task requirements, prior-stage evidence and human guardrails
retain their existing inclusion rules. Queued submission follow-up is unchanged.

Previously failed expansions retain their original manifests and diagnostics. Explicit
retry rebuilds from the original target and checkpointed stage evidence, not the failed
expansion's diagnostic included-ID list. Compatible navigation stages retain their
original IDs, revisions, sessions and cumulative attempts; unrelated completed work is
not replayed. Existing evidence-basis checks still reject genuinely changed evidence.
No destructive conversion or separate backup is needed; future-format rejection remains
unchanged. Tests cover shared-file isolation, explicit requirement loading, human
guardrails, unchanged submissions, repeated SQLite reopening and saved-stage recovery
without replaying navigation. A read-only reconstruction of Rust Grind Galaxy revision
1693 reduced its failing expansion from 102,595 to 51,582 characters, retaining all
previous-stage evidence and the requested file; no live inference or user-data write
was performed.

## Requirement-level attention cleanup

SQLite **3 → 3**. No payload conversion, startup sweep, revision/fingerprint change,
assessment invalidation or model replay. A read-only forward compatibility projection
now recognizes later applied approval/rejection submissions with matching retained
confirmation/rejection source provenance as replacements for earlier unapplied failed
decision conflicts, including opposite choices and nonempty notes. A valid saved review
fingerprint and durable ordering/timestamps remain required. Missing provenance is not
manufactured. Original bytes, notes and diagnostics remain intact; old notes are not
applied or treated as change requests. Change requests and pending overlap work stay
actionable. The later submission's own processing is never hidden.

Resolution describes historical failed attempts, not current requirement approval. It
does not revert when wording/status/feature archival or source supersession changes
later. Those changes retain their existing current-review safety checks and can require
a new decision, without resurrecting old failed submissions. Older databases benefit
on read/reopen; no user-data reset or repeated inference is necessary.

Explicit requirement-level dismissal uses existing `superseded` + `archivedAt` fields.
Dismissal and Undo each validate the expected project revision, exact bounded batch,
project/requirement ownership and eligibility in one immediate transaction. A changed
member rejects the whole batch. Undo checks each original archive timestamp and never
restores applied decisions, queued work or pending overlap processing. Original input,
IDs, diagnostic and submitted timestamp are unchanged. Retrying dismissal/Undo after a
lost response or reopening is idempotent; UI Undo is available until dialog close.
Queue pause/leases are unchanged; restoring an attempt does not automatically retry it.
No destructive conversion needs a separate backup. Existing future-envelope rejection
continues unchanged.

Upgrade coverage includes saved opposite decisions with exact notes across repeated
SQLite reopen and no startup inference/payload rewrite, transactional batch rejection,
repeated dismissal/Undo, timestamp mismatch, real pending-input protection and
authenticated bounded API requests. See [browser verification](browser-workspace.md#find-and-resolve-processing-problems)
for executed checks and the remaining non-blocking UI bundle warning.

## Focused issue recovery and attempt archiving

SQLite **3 → 3**; no startup sweep, revision/fingerprint change, inference replay,
assessment invalidation or workspace-artifact migration. Grouping and current-blocker
display are read-only projections over existing submissions, including legacy attempts.
The original completed-review reconciliation was subsequently broadened by
[requirement-level attention cleanup](#requirement-level-attention-cleanup).

Explicit archiving transitions a `needs-attention`, unapplied conflicting review to the
existing `superseded` state, adding only optional ISO `archivedAt` metadata. Older rows
without this field retain their meaning. Original IDs, human input, notes, timestamps,
decision basis and diagnostic remain unchanged; project sources, revisions and saved
activity evidence are not rewritten. The original row retains its evidence, so no
destructive transformation or separate backup is needed. Old activity entries continue
to describe their historical failure and can open the current item/history.

The expected-project-revision check, eligibility check and update run in one immediate
SQLite transaction. Repeating an archive request after a lost response/reopen returns
the original archived row/timestamp. Stale requests, cross-project IDs, applied reviews,
nonconflicting failures and pending overlap follow-up reject without changing records.
Conflicting unapplied attempts are not worker-owned processing tasks; archiving them
does not release leases, alter queue pauses, clear linked questions, or authorize retry.
Existing stored-envelope validation continues to reject unsupported future formats.

Upgrade tests use saved attempts without `archivedAt`, preserve exact original fields,
check rejected writes, repeated startup/idempotent retry and retain genuine pending-input
blockers. API tests cover token/origin checks, strict bounds and cross-project isolation.

## Narrower decision blockers and scoped answer evidence

SQLite **3 → 3**; no startup payload sweep, revision rewrite, data reset or inference
replay. New queued answers optionally retain server-captured `answerScope` **format 1**
(`questionID`, unique `requirementIDs`, at most eight). Applying them saves the same
scope on the original answer/delegation/deferral source in the same transaction.
Source kind, question ownership and scope must agree. Client submission bodies cannot
provide this internal metadata. Old submissions/sources without it remain conservative;
missing applied-source provenance does not qualify as scoped. New corrections to older
broad sources are not silently narrowed. Requirement IDs and exact human text are intact.

New review/proposal evidence strings use `human-review-basis-v2`; new pair identities use
`resolution-evidence-v2`; individual check hashes use `refinement-task-v2:<sha256>`.
The decision-basis envelope remains **format 1**, separate from these key-policy versions
and project optimistic revisions. Requirement fingerprints, assessment/execution formats,
workspace layout and original completed results do not change. New bases additionally
capture linked-question feature/evidence routing. Genuinely relevant input still stales
the affected work; unrelated scoped input no longer does so merely by sharing a feature.

Forward compatibility is implemented through read-only adapters, not replacement keys:

- Version-1 review and pair keys retain their captured fields. Compatibility projection
  ignores only structurally independent targeted evidence using retained immutable source
  metadata; unscoped/unknown evidence, explicit supporting sources, shared relationships,
  dependencies, wider addenda and pinned trigger/correction lineage remain relevant.
  Missing historic fields are not invented. Original keys and diagnostics stay saved.
- Legacy individual SHA-256 checks are first verified against their original immutable
  `expectedRevision` snapshot, then compared using scoped identities. Unchanged legacy
  hashes also remain usable directly. Unknown hash policies/missing unverifiable evidence
  are never certified current. No completed paid call is automatically repeated on startup.
- Older jobs/proposals/submissions are not rewritten or automatically applied. A retained
  conflicted review still needs explicit resubmission even if a narrower blocker clears.
- Unsupported future answer-scope formats fail validation without overwriting payloads.
  Unknown key policies fail closed for reuse. Downgrading to builds unaware of scoped
  answer evidence/new keys is unsupported once new work has been saved.

Scope is checked again before queued answer application. Follow-up publication rejects
out-of-scope changes atomically; failures/cancellation retain the applied evidence for
explicit retry. Existing leases, expected revisions, shared/dependency guards and global
live-worker exclusion remain in force. This is not per-feature concurrent publication.

Verification (2026-10-21, Node 22.23.3): all **491 deterministic tests** and full
browser checks passed. Upgrade cases cover unchanged evidence across repeated reopening,
legacy review/proposal/pair/check reuse, genuinely shared evidence invalidation, changed
queued scope, missing applied-source proof, future formats without overwrite, and atomic
publication failures/cancellation with explicit retry. After the final scope-capture
optimization, type checking and all **31 decision-availability tests** passed again.
No live model calls were made; live scoped generation remains unqualified.

## Targeted requirement change requests

SQLite **3 → 3**; existing payloads have no conversion or startup rewrite. New review
submissions add the intent `action: "changes-requested"`, with required nonblank `note`,
the existing exact target snapshot and version-1 relevant-evidence basis. Applying this
input adds a source of existing kind `note`, with optional `changeRequest: true` and
`requirementID`; it does not create confirmation/rejection evidence or supersede a prior
approval. Human text, IDs, revisions and job/submission provenance remain intact.
Unapproved revisions use existing version-1 pending changes; approved replacements use
existing refinement records and explicit human approval. No new table/schema counter,
assessment format, workspace layout or fingerprint version is needed.

Old approval/rejection notes and existing generic notes are **not** inferred to be change
requests. For records without the new marker, decision-basis contents, freshness and
completed work remain unchanged. New requested feedback is genuinely new human evidence
and can invalidate relevant review/proposal bases under the existing safety rules; that
is not an upgrade-triggered reset. Explicit request intent is distinguished in UI/history.

Queued application and result publication use existing transactional expected-revision,
evidence, pending-input and worker guards. Applying a request saves feedback atomically
without deciding the requirement. Invalid/cancelled follow-up retains that applied source
for explicit retry, never automatically repeats inference on reopening, and cannot
partially approve/reject or publish unrelated edits. Restart recovery preserves older
queued reviews and new requests. Unsupported future review actions are rejected on
saved-submission read/write without rewriting their payloads. Downgrading to a build
that predates change requests is unsupported once this new intent has been saved.

Compatibility verification (2026-10-21): all **479 deterministic tests** passed on
Node 22.23.3. The change-request suite covers old decision/evidence preservation,
repeated SQLite reopen with unchanged saved requests and no startup inference,
interrupted/cancelled follow-up and explicit retry without duplicate note sources,
live-snapshot queue ownership, stale reviewed evidence, malformed/out-of-target result
rollback, and unsupported future-action payload preservation. The existing legacy-review,
assessment and transactional migration suites also passed. No data repair/reset or
live model calls were performed; live generation for the new intent remains unqualified.

## Inline Review clarifications and readiness

SQLite **3 → 3**, project/submission JSON, workspace artifacts, schema versions,
decision-context/fingerprint semantics, saved assessments and completed work are unchanged.
Readiness counts, inline answer editors and previous-displayed-requirement comparisons
are presentation/routing changes only. Comparisons and unsent drafts are transient React
state, not new persisted evidence. Inline answers use the existing durable submission
format and validation; processing retains the existing queue/lease/revision safeguards.
Old saved answers and reviews remain readable without reset, migration, startup rewrite
or model replay. Original diagnostics and human evidence are not rewritten. Explicit
acknowledgement/resubmission is still required when relevant information changes.
Compatibility verification (2026-10-21): all **466 deterministic tests** passed on
Node 22.23.3, including an exact version-1 decision-basis assertion, saved-review
reopening/legacy provenance checks and the existing transactional migration suite.
No upgrade transformation is needed; the evidence selector is shared with display
without changing the basis contents or format.

## Item-local processing recovery

Item-local processing-error/recovery presentation also leaves persisted formats,
versions, fingerprints and decision gates unchanged. Existing saved failed reviews
and answers are read directly; no migration, reset, replay or startup rewrite is
required. Original diagnostics/history remain saved. Recovery and follow-up retries
require explicit user actions and never manufacture clarification answers.

## Design and Review typing isolation

Only transient React draft storage/rendering changes. Source and target SQLite,
JSON, workspace artifacts, saved submissions, fingerprint/context-key rules and
schema versions are unchanged. No migration, startup rewrite, data reset or model
replay is needed. Review submission still records the original draft's review
basis and requires explicit confirmation when its requirement/context changes.

## Requirement rejection with unresolved clarifications

Ordinary rejection now bypasses only the unanswered/deferred/delegated clarification
gate; approval and pending-input/evidence/worker checks are unchanged. SQLite **3 → 3**,
project/submission JSON and workspace formats, decision-basis keys, assessment semantics
and fingerprints are unchanged. No migration, reset, rewrite or model replay is needed.
Existing blocked rejections retain their exact note, decision, provenance and diagnostic;
read-only recovery offers a new explicit review, never automatic application. Questions
are not answered or retired merely by rejecting. Original histories and completed work
remain intact; no partially applied upgrade exists to recover.
Review follow-up now prioritizes explicitly linked questions within the same four-candidate
and context-budget limits. This changes new-call navigation only, not saved evidence,
freshness keys or completed-check reuse. Upgrade coverage reopens an older blocked
rejection twice with exact project/submission/job preservation, then explicitly resubmits
without rewriting the original attempt or replaying a model call.
Verification: all **460** deterministic tests passed on Node 22.23.3, including
direct/queued rejection, approval guards, replacement follow-up and reopen recovery.
UI build passed with the existing chunk-size warning. The browser suite stopped at
`src/web/browser-check.ts`'s queue-status assertion: expected **Saved gap checks reused**,
received **Ready when you are**; full browser verification remains incomplete. No live
model calls or user-data repair were performed.

## Discovery alias validation

Discovery now preflights response-local aliases and collapses only identical new-epic
declarations. Saved SQLite/JSON/workspace formats, versions, fingerprints, completed-check
reuse and assessment semantics are unchanged. No forward transformation, reset, startup
rewrite or automatic model replay is required. Existing IDs, human evidence, histories
and saved submissions remain intact. A failed round requires explicit resume; ambiguous
references are rejected rather than guessed or silently renamed. Existing scan-checkpoint
normalization remains unchanged. Type check and all 453 deterministic tests passed on
Node 22, including scan-checkpoint legacy reuse and corrected-response retry.

## Project progress presentation

Separate answer/local-code summaries and explicit missing/outdated definition labels
are derived at read time from existing project/execution records. Source/target
SQLite, JSON and workspace formats, versions, fingerprints, assessment freshness
and the overall calculation are unchanged. No migration, reset, rewrite or model
replay is needed; saved evidence and completed work remain intact across restart.
Deterministic progress checks cover old/missing assessments, answer states, scope
exclusions and read-only derivation. No new persisted format needs an upgrade fixture.
Verification: Node 22 type check, all 451 deterministic tests, UI build and full
Playwright browser checks passed, including local/main separation and mobile layout.

## Refinement run progress

Refinement stage/count/status telemetry is an additive browser snapshot section and
in-memory queue state only. SQLite, project JSON, workspace artifacts, schema versions,
fingerprints and saved-check reuse are unchanged. No forward transformation or model
replay is required; original decisions, histories and completed checks remain intact.
Server restart discards telemetry, not saved work, and does not resume inference.
Deterministic tests cover completed-check reuse and partial failure/stop/block counts;
there is no new persisted format requiring an upgrade fixture.
Verification: type check, all 296 deterministic tests (including existing upgrade/reopen
fixtures), UI build and Playwright browser checks passed.

## Workspace list paging

Design, Review and Implementation paging changes presentation only. Source and target
SQLite/JSON/workspace formats, schema versions, optimistic-concurrency counters,
assessment semantics and fingerprints are identical. Page size/position and retained
editing drafts remain in-memory UI state; this change writes no navigation fields to
project records or settings. Existing decisions, stable IDs, history, assessments and
delivery evidence remain untouched. No data migration, backup transformation, reset,
automatic model call or reassessment is needed. Restarting uses the normal saved state
and default navigation; no partially applied data upgrade exists to recover.

Verification: paging rendering checks preserve the entire input project/evidence and
only mount bounded rows. The full 291-test deterministic suite, including existing
SQLite reopening and forward-migration checks, passed. No new saved-data format exists
for a separate upgrade fixture.

## Version boundaries

- SQLite `PRAGMA user_version`: database schema, currently **3**.
- Execution payload `schemaVersion`: JSON representation, currently **1**. Missing
  means the shipped legacy format, **0**.
- Execution `version`: optimistic-concurrency counter, independent of schema version.
- Assessment `compatibility`: evidence/acceptance semantics, currently
  `assessment-evidence-v1`. Change it only when prior findings are semantically
  incompatible, or add an explicit reviewed compatibility migration.
- Decision identity `decisions-v1`: relevant saved requirement/decision inputs.
  Object keys are canonicalized; array order is preserved and path sets are sorted.
  Prompt instruction prose (`evidencePolicy`), the skill document and context-budget
  policy are excluded. Required decisions and acceptance scenarios remain included.
  Changes to the input projection itself still need a compatibility review/migration.

Skills and context policies remain recorded as original provenance and govern new
requests. A compatible assessment is not invalidated solely by those labels changing.
Its actual model, requirement, relevant decisions and latest captured code must still
match. Delivery decision identity is independent of assessment workflow prose.

## Implemented migration ledger

### Default-off browser retrieval pilot (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**,
execution **1 → 1**, workspace **2 → 2**. Adds optional retrieval-work `requestedPolicy`
(`prefix` / `prefix-aux-v1`) and an authenticated manual analyze request field. Project
records, workspace artifacts, schema versions, assessments/check identities and budgets
are unchanged. UI opt-in is in-memory/tab-local, default off, reset on reload/project change;
no persisted preference or local-storage migration. Queued submissions/Refine/scans/terminal
do not inherit it. Explicit manual default requests may also store `requestedPolicy:"prefix"`.

No forward data transformation, startup rewrite, reassessment, reset or automatic model
call is needed. Older jobs keep absent request provenance absent; new requests do not copy
that field from prior jobs. Original saved stages retain their exact policies/receipts and
attempt counts across switching back; no rerunning searches to replace misses. Legacy
receipts and compatible checks/approvals/history/implementation assessments remain valid.
The optional request marker is independent of the original saved-stage policy and of
optimistic revision counters. Downgrading to older binaries lacking the additive fields
is not qualified; unsupported future selections reject reads without overwriting payloads.

Tests use disposable stores, preserve old missing-field payloads through repeated reopen,
resume legacy misses without replay under explicit pilot selection, and repeatedly reject
future request-policy values while preserving raw jobs/projects. API/browser checks exercise
opt-in, switch-back reuse and exact-loading boundaries. Independent relevance review remains
pending; [review packet](retrieval-pilot-review.md) is not a completed sign-off. See
[pilot scope and verification](retrieval-browser-pilot.md).
Verification: type checking and all **450** deterministic tests passed on portable Node
22.23.3. The focused pilot browser/UI build also passed without retries. Original saved
input, approvals, legacy receipts and current assessment checks remain covered by the full
baseline/merge suites; independent human relevance review is still not completed.
Final UI production build and all five serial browser scenarios passed without retries,
including the default-off pilot. The existing bundle-size warning remains; live/provider
quality and independent relevance review are not established by these fixture checks.

### Prefix-preserving auxiliary merge evaluation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**,
execution **1 → 1**, workspace **2 → 2**. New search results can carry an optional separately
versioned `policy: {format:1,id:"prefix-aux-v1",...bounded counts}` with explicit experimental
limitation text. This is an opt-in service dependency for evaluation; all browser/terminal
construction retains original prefix search. No user setting or automatic policy switch exists.
New candidate results offer no cursor; existing witnessed legacy cursors retain old snapshot
search semantics. Unknown policy versions and policy/page/limitation mismatches are rejected.

Existing payloads retain their exact representation: no migration, startup rewrite, reset,
reassessment or model replay. Original receipts (including no-page/no-basis legacy receipts)
are reused as issued; policy change does not invent better results or missing provenance.
Navigation does not establish citation authority; changed loaded/human evidence still blocks
final reuse. No gap/assessment identity or request/context budget changes. Existing completed
checks, approvals, history and current implementation assessments remain valid. No partial
upgrade exists to recover. Old binaries are not qualified for new experimental receipts;
new policy receipts are created only in disposable opt-in test databases, not user projects.

Recovery tests preserve raw older receipts across repeated reopening, adopt missing evidence
bases only from immutable verified inputs, reuse committed candidate search/final calls without
replay, reject relevant changed evidence, retain cumulative attempts, and repeatedly reject
future policy payloads without overwriting data. See [algorithm, results and verification](retrieval-merge.md).
Verification: type checking and all **446** deterministic tests passed on portable Node
22.23.3. The initial incorrect loaded-area recovery assumption and its corrected safety
test are recorded in the report, not represented as a passing run. Original baseline and
earlier comparison files remain unchanged; no user database was opened or upgraded.
UI production build, all four serial default-policy browser checks via `test:browser:all`,
both CLI help entry points and diff checking passed. No browser retries were used; the
existing bundle-size warning remains. Candidate UI rollout is still unverified and disabled.

### Bounded retrieval candidate evaluation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. Adds only test-only retrieval policies, a second-domain catalog and comparative
measurements. No candidate is wired into production search, service, prompts or checkpoint
storage. The original baseline corpus/queries/tests are unchanged. No ranking, cursor,
search-receipt schema, compatibility/freshness identity or model/context budget changes
for saved projects; approvals, history, completed gap checks and implementation assessments
remain valid. No data transformation, startup rewrite, reassessment or replay is required;
there is no partial migration to recover. Disposable fixture stores are the only databases
opened by the evaluation.

Experimental results are not saved as production search receipts and invent no cursor or
model-call provenance. Tests exercise production exact loading and citation checks locally;
the unchanged baseline retains end-to-end service/checkpoint and upgrade checks. Promoting
a candidate later requires separate versioned search/cursor compatibility and recovery tests.
See [candidate measurements, regressions and limits](retrieval-evaluation.md).
Verification: type checking and all **434** deterministic tests passed on portable Node
22.23.3, including the original baseline and existing migration/reopen tests. Production
search/service and the original baseline corpus/test files have no diff.
UI build, all four serial browser checks via `test:browser:all`, both CLI help entry points
and diff checking also passed. No browser retries; the existing bundle-size warning remains.

### Deterministic first-query retrieval baseline (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. This adds test-only synthetic catalogs, measurement/assertions and an npm test
entry point; no production planner, search, ranking, prompt, budget, payload, schema,
assessment semantics or freshness identity changes. No forward conversion, backup rewrite,
reset, reassessment or automatic model replay is required. Existing approvals, exact human
constraints, history, stable IDs, completed checks and implementation assessments remain valid.
There is no partially applied production migration to recover. Test imports only touch their
own newly created disposable SQLite databases; no user database is opened or upgraded.

Large-catalog checks preserve original revisions/jobs and a current fingerprinted implementation
assessment, reuse a committed search after reopen and an unrelated revision, and retain
attempt limits/navigation citation rejection across repeated reopening. Existing upgrade
tests continue covering older formats and recovery; no new persisted representation requires
a separate upgrade transform. See [baseline design, measured misses and verification](retrieval-baseline.md).
Verification: type checking and all **431** deterministic tests passed, including existing
forward-migration/legacy-reopen cases. Initial ABI and fixture-assertion failures are retained
in the baseline verification record; they are not represented as passing retrieval runs.
UI build and the full serial `test:browser:all` command passed without retries on this change;
the existing bundle-size warning remains. Both CLI help entry points and diff checking passed.

### Browser startup readiness and verification isolation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. This changes browser readiness presentation and fixture verification only.
The new project-list-loaded flag is in-memory component state; no database tables,
project/job JSON, local-storage keys, workspace artifacts, provenance, freshness rules,
gap checks or assessment fingerprints change. Existing IDs, history, human approvals,
completed calls and implementation assessments remain valid. No forward data conversion,
startup rewrite, reassessment or model replay is required. Refresh simply rebuilds the
readiness flag; interruption cannot leave a partially migrated payload.

Before this fix a slow/failed sidebar-list request could hide the Design tab even after
the selected project's authenticated snapshot had loaded. The empty initial array no
longer establishes that there are no saved projects. A successful known-empty list and
absence of a selected project establish the welcome state; an explicit New project action
still works. Snapshot/current-revision/permission checks are untouched. Controlled browser
response ordering reproduced the old failure and verifies snapshot-first/list-first,
overtaking polls, stale selection responses, failed lists, cold loads and confirmed emptiness
without inference or mutations to original saved snapshots. The earlier uninstrumented
navigation timeout's exact historical cause remains unknown.

Tooltip test setup now establishes an actual pointer leave/enter after Escape and taps
the current locator instead of cached coordinates. A trial hover retains visibility,
stability and hit-target checking before an intentionally aria-disabled explanation is
tapped; its disabled-state, visible explanation and zero-execution assertions remain.
Focused browser coverage reproduces no-enter-after-Escape, a deterministic layout shift,
blur-timer cancellation and keyboard/touch dismissal. No production tooltip behavior,
permissions or guard logic changes; no test-level retry or timeout increase masks failures.
`test:browser:all` builds once before running the four browser scenarios in sequence;
failure diagnostics are bounded and redact messages, URLs and sensitive HTTP material.

Node **22.23.3 win-x64** verification uses the official portable archive (published
SHA-256 `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`), an isolated
repository snapshot and a clean `npm ci` with independent Node-22-native dependencies.
The checkout's Node installation, dependencies and user project database are untouched.
Electron binary download was skipped; desktop packaging and exact Node 22.12.0 are not
qualified by this check. Type checking, all **417 deterministic tests**, and terminal/spike
`--help` passed. The initial Node 22 full browser run failed at the touch-tooltip assertion;
an intermediate locator-tap revision failed its intended enabled check. These failures are
retained as verification history, not relabeled as passing.

Final verification passed on Node 22.23.3: type check, all **417 deterministic tests**,
UI production build, and `test:browser:all` (controlled reliability, full workspace,
focused exact retrieval and saved navigation), plus terminal/spike `--help`. The focused
reliability check also passed under the checkout's unchanged Node 20.11 installation.
The serial browser command succeeded after the targeted test changes; earlier failed runs
remain recorded above. This qualifies the tested version/workflows, not every timing
interleaving, exact minimum Node version or live-provider behavior.
The existing bundle-size warning and eight moderate clean-install audit findings remain;
dependencies were not changed. No live model calls, user-database writes, repository
commits or pushes were performed. First-query retrieval quality and live-provider
qualification remain separate follow-on work; this does not change discovery budgets
or establish specification completeness.

### Snapshot-bound saved-search continuations (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**
with optional `page` **format 1**, execution **1 → 1**, workspace **2 → 2**. Search
requests optionally accept a witnessed opaque `cursor`. No DDL, startup conversion,
project mutation, data reset, assessment invalidation, approval replay or automatic model
call is required. Original IDs, human evidence, history, approvals, completed gap checks,
implementation assessments and delivered evidence are unchanged. Older nonpaged receipts
remain valid and byte-preserved; retries do not invent cursors, change original results or
repeat completed calls merely because paging became available. Old versions cannot read
new paging fields; do not downgrade an active worker.

New optional page receipts bind project, immutable source revision, task/loaded-record
scope key, literal query, result limit and scan position. They record the input cursor,
record/text offsets, deferred-text flag and optional next position/cursor. Positions are
not model-controlled offsets: a continuation must match a previously saved stage's offered
cursor, query, limit and scope, and its position hash must verify. A continuation reads
the original revision in its original saved record order, not today's changed navigation.
Missing original snapshots, unknown/stale cursors, incompatible scope or malformed/future
page envelopes reject without replacing saved receipts or silently starting a fresh search.
Fresh queries without cursors remain available against the current snapshot.

Search remains advisory navigation and stays excluded from `gap-stage-evidence-v1`.
Original page receipts and hashes are retained on compatible retries; exact loading uses
current saved evidence and changed authoritative content still blocks later call reuse.
No legacy evidence-basis or gap-check fingerprint changes. Missing legacy bases continue
to require original wire-hash verification; optional page metadata is not synthesized
during adoption. Existing revision/lease/cancellation/permission safeguards remain in force.

Each page has the existing eight-result, 5,000-record and 1,000,000-text-character limits.
Continuation first advances past omitted matches/unexamined records, then to later
4,096-character text windows (at most sixteen local windows). Previously offered handles
are skipped. Deferred earlier text remains eligible after result pagination; at the total
character boundary, whole windows are deferred rather than losing a partially scanned
tail. This can examine slightly fewer records in a new first page than the older prefix-
only planner, without rewriting its original results. Matching across window boundaries
is not guaranteed. Omission counts and explicit local bounds remain visible; absent next
cursors do not certify exhaustive search or specification completeness.

Search/refinement/paging/loading **share the unchanged two-navigation-stage and three-
attempt budget**, including failures and retries across revisions. No-call startup/reload
and compatible completed-call reuse remain intact. Search → page → load cannot also
analyze under this cap; it blocks without publishing proposals or consuming a gap check.
Paging does not allow navigation-only handles to authorize citations, decisions or changes.

Added deterministic coverage includes stable original-snapshot ordering across reordered
navigation, refined queries, result/record-cap/text-cap/suffix continuations, whole-window
boundary preservation, earlier deferred suffixes, local text-window exhaustion, unknown/
stale/query/limit/scope/position failures, unavailable snapshots, disk reopening/no-call
startup, cross-revision paging, cumulative budget exhaustion, and legacy nonpaged receipts
with and without evidence bases. Malformed/future page envelopes reject reads without
replacing payloads. Cancelled, stale and expired-lease workers cannot checkpoint returned
continuations. Existing authoritative-evidence-change and approval/assessment/history
regressions continue to pass. The expanded in-memory browser scenario checks continuation
availability/positions, original snapshot provenance, explicit retry, exact human
constraints, shared-budget blockers, reload, original history and mobile width.

Verification: type check, all **417 deterministic tests**, UI build, focused exact-retrieval
browser check and full browser suite passed. The expanded navigation browser check first
timed out waiting for Design after reload; failure diagnostics were added and an independent
rerun passed. This reload timing issue is not claimed fixed. The separate known full-suite
tooltip flake did not reproduce and was not modified; the large-JavaScript-chunk warning
remains. Available Node is **20.11**; Node 22.12+ verification remains outstanding. No live
model calls, user-project database writes, repository commits or pushes were performed.
Live semantic quality/entailment and adversarial live permission qualification remain open.

### Bounded saved-evidence navigation queries (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**,
workspace **2 → 2**. This is an additive response/checkpoint extension, not a change to
project evidence, gap-check semantics or assessment freshness. No DDL, startup rewrite,
backfill, data reset, approval replay or reassessment is required. Original sources,
stable IDs, revisions, approvals, completed gap checks and implementation assessments
retain their identities. Existing pre-search completed stages/finals remain reusable;
the old context wire representation is unchanged when no search has occurred.

Navigation stage `request` now accepts either the existing strict `retrieveEvidence`
envelope or strict `searchEvidence: {format:1,query,limit}`. A search stage requires its
original `searchResult` **format 1**, with matching query, bounded handles/labels, scanned
record count and explicit omitted-match/unexamined/prefix-limited counts. A load stage
cannot carry that search receipt. Unsupported future result formats, missing receipts,
mismatched queries and over-limit results reject reads without replacing saved payloads.
Older app versions cannot interpret new search stages; do not downgrade an active worker.

Search examines only omitted saved records available for exact loading: requirement
statements, question/source text and research findings, plus record/epic IDs. Queries
are bounded to 160 characters/twelve literal terms, returned handles to eight, text
prefixes to 4,096 characters, examined records to 5,000 and examined text to 1,000,000
characters. Counts describe those prefixes, not an exhaustive or semantic search.
There is no persisted external index, filesystem/network access or new permission.

The context's new `savedEvidenceSearch` field is explicitly advisory and is excluded
from `gap-stage-evidence-v1`, alongside existing navigation indexes. This preserves
the exact old basis for old contexts; it does not exclude any formerly authoritative
field. Search results do not enter `includedIDs`, citation allowlists or decision/change
authority. A returned handle must still exist and be loaded with exact evidence and its
mandatory human constraints before use. Old completed gap checks are not reopened solely
because search is now available; completion never promised exhaustive evidence review.

Search and exact loading share the existing two committed navigation stages, three
cumulative request attempts and 96,000-character hard context cap. Existing transactional
lease/revision checks reserve attempts before inference and save search receipts before
expansion. Failed or over-budget follow-up retains the receipt and does not reset budgets.
Explicit retry reuses the original search result without rerunning its query, even after
unrelated revisions or changed navigation labels. Original job/hash/session/revision
provenance stays intact; new exact loading reads current saved records. Changed loaded
authoritative evidence blocks reuse of later stages/finals; original results are retained,
not replayed or treated as current. Publication keeps all existing current-revision,
reference, approval, question-budget and live-lease checks. Startup never resumes inference.
Legacy missing-basis adoption still verifies immutable original contexts and wire hashes.

Deterministic tests cover undisplayed handles, search → exact load → analysis, navigation-
only citation/change rejection, literal matching, query/result/scan/text/context limits,
disk reopening, startup no-call recovery, committed-search interruption, final-publication
failure, compatible cross-revision reuse, original receipts under changed labels, changed
loaded evidence, cumulative retry exhaustion, cancellation, stale revisions, expired leases
and malformed/future receipts. Existing legacy adoption and assessment/approval/history
regressions remain passing. The new focused browser check uses an in-memory database and
verifies undisplayed-handle navigation, explicit retry, exact human constraints, shared
budgets, omissions/blockers, original history, reload without inference and mobile width.

Verification: `npm run check`, all **410 deterministic tests**, UI production build,
focused saved-navigation and retrieval browser checks, and the full `npm run test:browser`
suite passed. The known full-suite tooltip timing flake was not reproduced or fixed;
the large-JavaScript-chunk warning remains. Checks used available Node **20.11**, not the
recommended 22.12+ baseline. No live model calls, user project database writes, repository
commits or pushes were performed by this task. Live-provider search quality, semantic
entailment and adversarial live permission behavior remain unqualified. Prefix/order
bounds can miss relevant records; budget exhaustion requires meaningful scope/evidence
changes, not repeated clicks. Structural validation cannot prove model prose ignored
all advisory labels; it prevents those handles from authorizing citations or changes.

### Evidence-equivalent cross-revision retrieval retry (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**,
workspace **2 → 2**. This adds optional independently versioned evidence-basis/reuse
envelopes, without rewriting projects, original jobs, human sources, approvals, history,
completed gap checks, assessment fingerprints, delivery evidence or workspace artifacts.
No DDL, reset, startup backfill, backup conversion or automatic model replay is required.

New navigation/final checkpoints retain the existing exact `contextKey` and add optional
`evidenceBasis: { format: 1, compatibility: "gap-stage-evidence-v1", key }`. Final responses
also record their actual input `revision`. The basis expands app-owned lossless text,
identifier and record-table encodings and canonicalizes object keys. It excludes only
root revision, explicitly advisory previous interpretation, record index, related hints,
navigation epic map and submission-scope omitted-record count. All remaining displayed
fields, exact human constraints, included record IDs, task identity/lens and selected
epic scope remain binding. Relevant dependencies/rescans are also bound by the unchanged
gap task identity. Navigation never becomes citation authority.

Explicit retry selects the latest saved failed/cancelled/interrupted/stale checkpoint
matching project, scope, task evidence key/lens, provider/model/account and research
permission at or before today's revision. No recent-project cutoff can hide an older
matching checkpoint. Each saved stage/final must match the new exact authoritative basis
before reuse; unrelated revision/navigation churn does not cause replay. Previously
validated navigation handles remain witnessed if later unrelated additions displace their
index entries. Records must still exist and be loaded before they can authorize citations.

Legacy work without bases is upgraded lazily **in the new retry job only**: reconstruct
the identified task and completed stages from the original immutable project revision,
verify every legacy exact wire hash and request, then derive the equivalent basis. The
verified original snapshot also establishes a missing legacy final-input revision; no
unknown dates, sessions or model provenance are fabricated. Unverifiable original contexts
block explicitly without overwriting evidence or replaying completed calls. Reopen performs
no inference or format rewrite; future basis/reuse formats reject reads without replacement.

New optional `retrievalWork.reuse` format **1** records source job/source revision, current
target revision, verified navigation-stage count and final-response reuse. Stage revisions,
wire hashes, session IDs, original output and original jobs remain intact, including mixed-
revision stage chains. The receipt describes checkpoint reuse, not a new model call at the
target revision. Cumulative attempts still enforce the same three-request bound. Source
revision in a reuse receipt names its immediate saved-job snapshot; the actual call's
revision remains on its stage/final record.

Receipts/checkpoints use existing immediate transactions with live-lease and current-job
expected-revision checks. A concurrent edit still stales the worker; explicit retry is
required even when the edit is unrelated. Saved final responses undergo current reference,
human authority, pending-question-budget and publication checks. Failure rolls back
publication and never consumes a gap check. Changed retrieved constraints retain previous
responses and block reuse rather than guessing or silently replaying them. Existing
approvals, implementation assessments and completed work retain their identities.

Deterministic upgrade/recovery checks cover repeated disk reopen with byte-preserved
legacy jobs, lazy adoption of navigation/final responses, unchanged original provenance,
unrelated revisions, displaced navigation hints, exact human-text preservation, lossless
representation equivalence, changed target/retrieved human constraints, model/account and
research isolation, unverifiable/future envelopes, current question quotas and an edit
during replay. The focused browser scenario now inserts unrelated revisions between
failure and retry and checks no-call replay, displayed provenance, reload and mobile width.
Verification: `npm run check`, all **402 deterministic tests**, UI production build,
`npm run test:browser:retrieval`, the full `npm run test:browser` suite and diff whitespace
checks passed. The focused browser scenario verifies cross-revision reuse provenance;
the full suite also retained its existing same-revision retrieval, approvals, history and
mobile checks. The previously observed tooltip timing flake was not reproduced on this
run and has not been fixed here. The existing large-JavaScript-chunk warning remains.
Checks used available Node **20.11**; Node 22.12+ and live-provider semantic/permission
qualification remain outstanding. No live model calls, user database writes, repository
commits or pushes were performed.

### Bounded multi-stage gap evidence retrieval (2026-10-20)

Historical same-revision policy; cross-revision retry above extends it without invalidating
its original checkpoints or completed work.

Source/target SQLite **3 → 3**, execution **1 → 1**, workspace **2 → 2**.
No project/source/submission/assessment transformation, DDL, startup backfill, backup
rewrite, approval replay or reassessment is required. Original IDs, human addenda,
history, completed gap checks, assessment fingerprints and delivered evidence remain
unchanged. `gap-evidence-v1` continues to identify bounded exploration opportunities,
not proof that all linked workspace motivation was reviewed. Old completed checks stay
compatible; uncompleted size-block receipts from `current-decisions-v1` are reconsidered
under `staged-evidence-v1`, because exact static motivation can now be requested later.
Old blocker receipts remain historical evidence, not rewritten completion claims.

Optional job `context.gapRetrieval` enables the new response alternative. Optional job
`retrievalWork` has its own **format 1**, separate from revision/CAS: research permission,
zero-to-three cumulative request attempts, zero-to-two committed navigation stages,
optional origin job, and optional final response. Each stage records immutable input
revision, exact context SHA-256, included IDs, strict request and optional runtime
session ID. Final responses retain their exact context hash and validated analysis;
normal publication independently validates references, approval authority and freshness.
`gapReport.modelCalls` now accepts 0–3; staged counts include attempts inherited from
explicit retries, not measured provider inference/token usage. Browser snapshots omit
saved final output while exposing stage/attempt progress.

Checkpoint writes are immediate transactions checking live running status, lease and
expected project revision. A failed write rolls back without discarding earlier stages.
Explicit retry creates a new attempt job and preserves the original; it reuses compatible
committed stages/final responses only against matching snapshot/model/research permission
and exact reconstructed input hashes. It never automatically repeats model calls on
startup or steals a live lease. Recovery selects the latest matching snapshot/task/lens/
permission checkpoint before loading its bounded payload, not a recent-project cutoff; no
cross-revision rebase or invented historical provenance occurs. Unsupported future
retrieval formats reject reads without replacing payloads. An uncheckpointed response
lost in a crash is not claimed as saved; another explicit attempt remains bounded.

Human constraints are retained in every stage; cumulative detailed evidence must fit
96,000 characters. Saved records only are retrievable, with eight requested displayed
IDs per stage. Retrieved facts are observations, never human preferences. Successful
publication alone consumes a gap check. Stage/request/context failures retain original
evidence and blockers, without changing approvals, coverage or implementation state.

Upgrade/recovery fixtures start from older saved projects/jobs without retrieval fields,
reopen twice, preserve exact snapshots/approvals and original failed jobs, and retry
without repeating a completed navigation request. Additional deterministic cases cover
oversized static closures, exact human addenda, unseen/duplicate/unknown/mixed requests,
unseen citations, stale/cancelled workers, cumulative evidence/request bounds, final
checkpoint publication failure, expired-lease/CAS rollback, permission changes,
over-budget expansion retry without replay, compacted navigation handles and future-format
refusal. Verification: type checking, all **391 deterministic tests**, UI production build
and the focused `npm run test:browser:retrieval` Playwright check passed. It covers stage
failure/explicit retry, reload without inference, exact record preservation and mobile
progress. The full browser suite passed twice including retrieval; its latest run stopped
at the existing unrelated tooltip timing assertion (`browser-check.ts`, implementation
settings), before reaching retrieval. That flake remains unresolved. The build retains its
large-JavaScript-chunk warning. Checks used available Node **20.11**, not the recommended
22.12+ baseline. No live model calls, user database writes, repository commits or pushes
were performed; semantic retrieval quality and live permission behavior remain unqualified.

### Current-decision projection and durable gap backlog (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
Project/submission JSON schemas, human evidence, revision counters, requirement and
assessment fingerprints, delivery evidence and workspace artifacts are unchanged.
There is no DDL migration or startup backfill. The deterministic backlog catalog is
derived from current project records; existing SQLite jobs are its durable ledger.
Additive optional job fields are independently versioned:

- `context.decisionProjection` format **1** lists omitted review IDs, retained exact
  note IDs and projected current generated receipts. It records a new request's view,
  not a transformation of saved sources. Unknown prose and older human addenda stay
  exact. Only explicit same-owner supersession and exact current decision/proposal
  matches allow historical omission or generated-receipt projection. Current approval
  facts preserve stable source/proposal IDs; omitted embedded history is not evidence.
- `context.gapExploration.check` format **1**, compatibility **gap-evidence-v1**,
  records the lens and relevant evidence hash independently of revision/UI metadata.
  Behavior, failure/recovery and acceptance checks are distinct tasks, not readiness
  or implementation assessments. Fingerprint changes retain earlier dated job evidence.
- `gapReport` format **1** stores input-scope counts, local blocker receipts and
  verified legacy-reuse receipts (each referencing the original completed job), plus
  zero/one adapter request attempts. It does not claim actual provider inference/token
  usage. No-call waiting/idle/blocked outcomes never manufacture completed model checks.

Forward compatibility is handled lazily on explicit exploration: an older bounded
`{ targetRecordID }` job can supply its behavior check only from its immutable input
snapshot, with equal evidence identity and a manifest containing today's required IDs.
The new report retains that original source-job ID; original payloads are untouched.
Broader unmarked jobs do not establish per-task completion. Equivalent representation
changes cannot force model replay. Genuinely changed relevant evidence creates a new
task identity while old outputs remain available. Conservative feature/dependency human
input changes and rescans can reopen checks; unrelated revisions/feature edits do not.
Existing implementation assessments and completed work are never invalidated by this
discovery policy. Initial interpretation remains broad; later general gap passes preserve
global interpretation/coverage rather than replacing them from a partial task.

Successful result publication and check completion share the existing SQLite transaction.
Malformed, failed, cancelled, expired or stale workers cannot consume a check. Planned
reports may remain as original attempt evidence after failure; they are not completion.
Saved blocker receipts prevent repeated over-budget preflight from starving later work
and are reconsidered on changed evidence/planner policy. Reopen performs no inference;
recovery requires explicit retry and preserves live leases. Job reads reject unsupported
future check/report/projection formats without rewriting them. No backup conversion,
data reset, approval replay or reassessment is required.

Upgrade checks seed older projects/jobs, preserve exact evidence and old job payloads,
reopen repeatedly, adopt a compatible legacy check using its original snapshot, and
exercise failures and future envelopes. A 1,000-requirement fixture keeps one request
bounded and preserves compatible checks when new proposals are added. Read-only planning
against Rust Grind Galaxy revision **1623** recognized **165** superseded snapshots and
**229** verified generated receipts across the saved project; the selected request was
**58,592 / 96,000 characters**, including exact retained human notes and selected feature
purposes, with **56** detailed
records. No user-database writes or live model calls were performed. Actual semantic gap
quality, adaptive multi-stage retrieval and larger real-world scaling remain unqualified.

Verification: type checking, all **383 deterministic tests**, UI production build and
Playwright browser checks passed, including three explicit gap lenses followed by
no-call reuse, evidence preservation, reload and mobile layout. One concurrent browser
attempt timed out in an existing tooltip check before the new scenario; isolated reruns
passed. The build retains its large-JavaScript-chunk warning. Checks used available Node
20.11; the development baseline remains Node 22.12+. No live model calls were made.

### Bounded next-gap exploration (2026-10-20)

Historical initial fallback, superseded by the task-sized/backlog policy above. Its
47,336-character observation preceded the stricter preservation of older human addenda.

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
New discovery jobs may add optional `context.gapExploration: { targetRecordID }`.
Existing job readers accept additive context metadata; absent means no recorded
bounded-gap selection, not missing work to backfill. The same original stable ID
also remains in `taskRecordIDs` and the exact included/omitted manifest. Successful
gap jobs alone influence future target rotation, not evidence freshness or reuse.

Project/submission JSON, schemas, optimistic revisions, requirement fingerprints,
assessment semantics, completed checks, delivery evidence and workspace artifacts
are unchanged. No forward rewrite, backup conversion, reset, reassessment, startup
inference or replay of completed work is necessary. Failed historical broad jobs
retain their original diagnostic and manifest; explicit retry plans fresh context.
Interrupted/failed/cancelled/stale attempts do not consume the target rotation.
There is no partially applied migration to recover. Existing transactional job
publication and expected-revision validation remain authoritative.

Upgrade tests seed legacy-shaped projects/jobs without the new marker, repeatedly
reopen SQLite and explore through the queue, preserving exact human evidence,
requirements, interpretation and old jobs while persisting successful rotation.
Read-only planning against Rust Grind Galaxy revision 1623 reduced the failing
562,745-character broad request to a 47,336-character task within 48,000; no user
data writes or live inference were needed. Live gap-question quality remains unverified.
Verification: type checking, all **370 deterministic tests** (including the new
bounded-exploration and legacy SQLite reopen checks), and whitespace checks passed.

### Resolved historical review attempts (2026-10-20)

Historical policy below; [requirement-level attention cleanup](#requirement-level-attention-cleanup)
subsequently broadened reconciliation to include notes/opposite decisions and prevent
old attempts returning after later edits. Original evidence remains unchanged.

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**;
project, submission and job JSON formats and all fingerprints are unchanged. This is
a computed workflow projection, not a persisted status migration. Original failed
attempts retain their IDs, status, input, timestamps, diagnostics and unapplied state;
later successful reviews retain their original source provenance. Browser review and
queue presentation classify equivalent superseded plain attempts as history. No
revisions, assessments, completed checks or delivery evidence are invalidated.

Classification requires a later completed/applied review with the same story/decision,
current exact requirement wording/scenarios/feature and a real non-superseded human
source. A failed attempt containing any nonblank note is never swept away. Current
status alone, older approvals, unfinished follow-up, changed records or unsupported
fingerprints cannot establish resolution. Later explicit approval of updated wording
can replace an older plain attempt without attributing approval to that failed attempt.

No database rewrite, backup transformation, schema bump, reset or model replay is
required. The projection is recomputed from saved evidence on polls/reload and queue
startup, so interruption has no partial upgrade to recover. Startup avoids creating a
pause solely for resolved attempts, but never clears saved pauses or resumes inference.
Existing raw submission APIs and historical activity remain truthful original records.

Verification: all 367 deterministic tests, type check, UI build and browser checks
passed. The legacy SQLite fixture reopens twice, verifies byte-for-byte submission
payload preservation, derived resolution and no startup inference/pause. Browser checks
verify live transition from three Submitted attempts to resolved history, queue counts,
navigation, reload and mobile width. No user-database writes or live model calls ran.

### Current decision-blocker recovery (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**;
project/submission/job JSON formats and evidence fingerprints are unchanged. Optional
blocking question IDs are computed in memory, not stored as new provenance. Existing
failed-review diagnostics remain byte-for-byte historical evidence; the UI recomputes
current availability rather than rewriting old warnings or applying saved decisions.
Restored review notes are UI drafts only until explicit resubmission. New failure
diagnostics distinguish existing rejection conditions without weakening those guards.

No forward transformation, backup rewrite, data reset, startup inference or replay of
completed checks is needed. Reload/reopen reads the same original records and repeats
only the read-only availability check; there is no partially applied migration to
recover. Legacy-shaped failed-review fixtures cover cleared and current blockers,
changed requirements, exact input preservation and no implicit application. Existing
SQLite upgrade/reopen, rollback and future-format tests remain applicable.
Verification: type check, all 350 deterministic tests (including upgrade/reopen tests),
UI build, browser recovery/navigation checks and whitespace checks passed. No live
model calls or writes to the user's database were performed.

### Completion-linked pending review reconciliation (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
Additive optional representations:

- Analysis/job results: `pendingChanges: { format: 1, changes: [...] }`, at most ten
  typed revise-question/revise-requirement/withdraw-requirement operations, each with
  current batch human source IDs and a bounded reason. Older successful jobs omit it
  and keep their original results. Unsupported future envelopes reject reads without
  rewriting original jobs; malformed live output is rejected before publication.
- Projects: optional `reviewUpdates: { format: 1, items: [...] }`, retaining the latest
  notice per stable record/type with outcome, job, response IDs and publication revision.
  Older notices remain in immutable revision snapshots. These are workflow/provenance
  notices, not human decisions or assessment evidence. No schema default fabricates
  notices for older projects; unsupported future envelopes reject project reads/writes.
- Submissions: optional `appliedRevision` records the **exact** revision that first
  applied their immutable source. New applications write it atomically with that source.
  For older already-applied responses, completion derives the exact insertion boundary
  from retained revisions rather than inventing a baseline or timestamp. Receipts are
  checked against both adjacent source snapshots before use. A missing historical
  boundary produces no invented input-impact claim. No startup backfill is required.
- Answer input: optional `fingerprint` or `reviewedRevision` establishes exact question
  wording/options and previous-answer identity. New browser requests reference the saved
  reviewed revision; storage derives/checks its fingerprint without duplicating large
  question/option text in the bounded HTTP body. Older inputs retain their existing
  question-text/source checks, without manufacturing a historical fingerprint.

Withdrawals reuse existing rejected-requirement/dismissed-proposal storage lifecycles,
with an explicit completion notice distinguishing them from human rejections/dismissals.
Records, IDs, original sources, prior wording, human choices and completed results remain
saved. Never-approved proposals may be withdrawn; approved behavior is not removed by
pendingChanges. Saved/unfinished responses prevent conflicting changes or retirement.
Unsaved drafts are renderer state and remain editable/reviewable when their item changes
or retires. Notice reasons are bounded summaries; original retirement reasons and record
history remain available separately.

No database rewrite, startup sweep, data reset or model replay occurs. Publication,
pending updates, withdrawals, notices and receipts share the existing immediate SQLite
transaction/expected-revision/lease checks. Failure rolls back the entire round and its
notices, preserving human input. Completion can be retried explicitly after failure;
already completed jobs cannot publish twice. Blocked pair results do not withdraw old
work. Optional candidate context cannot starve the original response.

The new project notices are excluded from model context and decision/assessment/cache
identity projections; compatible completed checks and delivered evidence remain valid.
Actual wording, choices, human sources or record eligibility changes still invalidate
the relevant evidence normally. There is no assessment compatibility/version bump.

Upgrade coverage includes old projects without notices, older applied-response shapes
without a revision receipt, two reopens with new notices/jobs intact, original historical
snapshots, unchanged context/assessment identities when only notices differ, and future
project/job envelope rejection without replacement. No additional startup recovery path
or paid reassessment is introduced.

Verification (2026-10-20): `npm run check` and all **343 deterministic tests** passed,
including the compatibility, atomic failure, stale-worker and retained-input cases above.
The UI build and Playwright checks passed, including retained drafts, completion notices
and reload without model replay.
Live-model reconciliation quality has not been qualified.

### Human decision availability and evidence bases (2026-10-20)

Source/target database **3 → 3**, execution **1 → 1**, workspace **2 → 2**. New queued
review submissions and individual wording proposals add optional
`decisionBasis: { format: 1, contextKey }`. The key identifies the exact target,
relevant current human source IDs, linked clarification state, feature/dependency
structure and confirmed dependency guardrails under `human-review-basis-v1`.
Plain independent same-feature approvals and unrelated features are excluded; nonblank
review addenda are conservatively feature-level guardrails. Browser review
inputs add optional `reviewedRevision`; storage derives the basis from that immutable
saved revision, not from a client-provided assertion of current evidence.
New ordinary confirmation/rejection sources also record optional `reviewAddendum`
from the actual submitted human note. AI cleanup/resolution explanations do not acquire
this marker and are not mistaken for wider human change requests. Legacy sources keep
their missing marker; upgrades do not reinterpret historical prose as structured scope.

This is an additive forward-compatible read with **no startup rewrite/backfill**.
Legacy submissions/proposals lacking this provenance retain their existing target
fingerprint rules plus the current pending-input/worker safety checks. Do not manufacture
a historical basis from today's state. New unsupported/malformed basis envelopes reject
reads/saves without replacing original data; schema format is separate from project
revision/CAS. Existing resolution identities, assessment/cache fingerprints and delivered
evidence are unchanged, and completed work is not invalidated just by upgrading.

New pending wording proposals become outdated only when captured relevant evidence
actually differs. A genuinely new context may produce a new proposal for otherwise
unchanged wording; old proposals/checks remain saved. This does not replay inference on
startup. A review that is no longer safe is retained as unapplied `needs-attention` with
`conflict: true` and its exact input/note; only explicit human re-review can replace it.
The enqueue/application checks and writes share SQLite immediate transactions. Failed
writes roll back normally; repeated opening needs no migration recovery or model calls.

Upgrade coverage includes legacy queued reviews without a basis, new bases through two
reopens, unchanged historical snapshots/completed work, and future-format rejection
without payload replacement. Concurrency checks use independent SQLite connections and
exercise both worker-first and human-first ordering. No production-data reset is needed.

Verification: type check, all 321 deterministic tests (including upgrade/reopen and
source/proposal provenance checks), UI build, Playwright browser checks and diff checks
passed on Node 20.11. The new safeguards perform no model calls, and no live provider
or additional Node 22/desktop qualification was attempted.

### Human duplicate removal and targeted proposal refresh (2026-10-20)

Source/target formats remain SQLite **3 → 3**, execution payload **1 → 1**, workspace
format **2 → 2**. No startup transformation, new schema field, fingerprint change,
backup rewrite, model replay or reassessment is introduced by upgrading. Existing
proposals, completed checks, assessments and delivery evidence keep their semantics.

An explicit duplicate-removal decision uses the existing rejected requirement,
rejection source (superseding prior confirmation where present), review note and
revision-history representation. The survivor ID is recorded in that evidence/note;
it is not a new structured relationship field. Original sources/IDs/history are not
rewritten. Only assessments citing the removed requirement are invalidated, as for
other requirement decisions; unrelated evidence and execution history remain saved.
Existing readers can read the result without migration. No cleanup runs on upgrade.

Targeted refresh uses existing single-target/pair job envelopes. On successful
non-blocked publication, stale proposals for that exact target/pair become dismissed
in the same SQLite transaction. Failure, cancellation, stale output, validation errors
and blocked outcomes do not retire the old proposal. Interrupted work is recovered by
existing lease rules and requires explicit retry; startup never repeats model calls.
Revisions remain the concurrency counter, not a migration version. Existing future-
format rejection and transaction recovery remain unchanged.

Coverage includes older saved project shapes with existing resolution proposals,
direct removal followed by two reopens and historical-revision reads, and successful/
blocked/failed/cancelled/stale refreshes. There is no new persisted format to transform.
Verification: type check, all 307 deterministic tests, UI build, Playwright browser
checks and diff whitespace check passed in the available Node 20.11 environment.
No live model calls or new Node 22/desktop qualification were performed.

### Processing refresh transport and rendering (2026-10-20)

Source/target: SQLite **3 → 3**, execution payload **1 → 1**, workspace format **2 → 2**.
No persisted transformation, backup or reassessment is needed. The optional authenticated
`X-Reqwizit-Snapshot` request/response header carries bounded SHA-256 content tokens for
top-level snapshot sections; only changed sections appear in the response body. These
are transient transport identities, unrelated to stored decision/assessment fingerprints.
Clients without this header retain full-response compatibility. Browser reloads begin
with an empty token set and receive all sections, including after a server restart.

Independent job, workspace, queue and projected interrupted-worker changes are hashed
from current content on every poll, not inferred from revision/version counters.
Only immutable revision payloads and their deterministic coverage reuse serialization.
Each client merges against its request baseline; stale/aborted/wrong-project responses
cannot overwrite newer accepted work. Rendering caches and lazy/paged queue history do
not alter saved submissions, input, IDs, assessments, provenance or outcomes. All
original history remains accessible through pagination. No startup model work is added.

Verification: all **288 deterministic tests** passed, including request-baseline
merging, same-counter worker changes, removed sections, malformed/oversized tokens,
legacy full responses, independent workspace/queue/job updates, project switching,
cancellation and out-of-order/stale refreshes. Existing storage migration/reopening
tests also passed; no saved-data upgrade path is introduced by this change.

### Targeted post-response resolution receipts v1 (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**. Add optional
`Submission.overlapFollowup` (`format: 1`) with discovery job identity, affected IDs,
trigger sources, candidate count and up to three pair checkpoints. Pair manifests add
optional `includeUnapproved`/`triggerSourceIDs`; resolution proposals add optional
`resolutionTriggerSourceIDs`. Existing project snapshots, approvals, IDs, original
evidence, history, assessment/delivery state and workspace formats remain unchanged.
This is an additive forward-compatible reader/workflow change, not a bulk rewrite;
there is no schema-version increment, backfill, backup transformation or startup inference.
Legacy completed submissions lacking receipts remain completed and are not reprocessed.

The receipt commits atomically with successful discovery; failure rolls both back.
Pair calls run afterward and save checkpoints with a discovery/job compare-and-swap
guard so a late worker cannot replace a newer checkpoint. Startup preserves live
leases; interrupted pending receipts pause for explicit resume. Completed pair results
published before a crash are recovered without repeating their model call. A failed,
cancelled, stale or oversized-context check keeps discovery, human input and the
original review response; retry resumes only unfinished eligible work. Unsupported
future receipt formats reject reads without replacing stored payloads.

`resolution-evidence-v1` identities remain byte-equivalent when trigger sources are
already represented. Compatible completed approved-pair checks/proposals are reused;
new explicitly pinned evidence outside the old pair scope extends the identity and
corrections stale that new evidence, without manufacturing provenance for older work.
No assessment semantic version or freshness migration is needed.

Verified: `npm run check`, all 284 `npm test` tests, and `npm run test:browser`
(ordinary answer/review resolution without Refine, unchanged originals before approval,
failure/resume and count summaries). Upgrade tests include repeated disk reopen after
discovery publication, completed-pair crash recovery, legacy completed submissions/check
reuse, cross-connection checkpoint CAS and future-format payload preservation. No live
model calls were made; semantic resolution quality remains unqualified.

### Single Refine entry point (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**, project/execution
payloads and workspace artifacts unchanged. Remove the separate session-only approved
audit UI and its redundant action. Refine retains the internal approved-pair candidate
scan, checkpointed model checks, pending/dismissed proposals and human approval flow.
No saved audit state existed to migrate; all saved evidence, approval status, history,
fingerprints and completed checks remain unchanged. This is presentation/navigation
cleanup, not a semantic invalidation or an instruction to repeat model calls.

The earlier approved-audit UI entry below records historical behavior; it is no longer
an available user action. Browser checks now enter resolution directly through Refine
and assert that the redundant section is absent. Core large-pair, cancellation and
upgrade-preservation checks remain in place for internal candidate planning.

### Resolution citation contract alignment (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**; no serialization,
workspace, fingerprint, freshness or assessment compatibility change. The existing
source-only/current-evidence policy is shared between resolution prompts, basis-specific
schema enums and publication validation. Clarification question evidence IDs retain
their separate record-reference rules. This fixes unconstrained proposal citation
strings/ambiguous instructions and replaces the generic eligible-evidence failure with
a field/index/ID-specific reason; invalid references are never mapped or replaced.

There is no persisted-data transformation or startup inference. Original failures remain
historical failures; existing valid proposals, approvals, IDs and completed pair/individual
checks remain reusable. Explicit Refine retry handles the failed pair without resetting
data or replaying unchanged completed work. Regression checks cover valid source-only
citations, requirement/question/research IDs, duplicate/superseded/deferred/delegated and
outside-context sources, human-vs-workspace basis, prompt/validator agreement, empty
allowlists, atomic rejection and explicit retry. Existing reopen/upgrade checks remain
applicable; no new format recovery path is needed.

### Reviewable requirement resolutions v1 (2026-10-20)

Source/target: SQLite **3 → 3**, execution JSON **1 → 1**, existing project/refinement
records preserved. Add an optional `resolution` envelope (`format: 1`) to new refinement
proposals, with the second requirement ID, explicit consolidation/coordinated-revision
action, cited evidence and basis. Saved resolutions also require the second original
snapshot and a `resolutionContextKey`. Missing optional resolution fields on legacy
refinements mean ordinary cleanup, with unchanged semantics; no data backfill, new
approval, repeated individual cleanup/model call, reassessment or reset is required.
Unsupported future resolution formats and incomplete new provenance are rejected on
project load without rewriting evidence. Saved job readers also reject future resolution
formats rather than reusing them as completed checks.

New job manifests optionally contain `refinementPair`, and new pair results contain
`resolutionCheck` (`format: 1`, proposal/question/distinct/blocked). Existing completed
single-requirement checks retain their original fingerprint/context identity. Pair
checks use independent `resolution-evidence-v1` identity: exact requirement review
snapshots, immutable source IDs for linked/current applicable human evidence, active
area/dependency structure, and linked clarification statuses/answer IDs. Human sources
are append-only: corrections retain old evidence and get new IDs/supersedes links.
Workflow prose and app versions are not evidence changes. No identity/provenance is
invented for older checks; a new pair task is not a replay of an old individual check.
Unchanged completed/dismissed pair checks survive reopen; blocked/failed checks remain
explicitly retryable. Unanswered/deferred/delegated clarifications suppress re-asking.

Proposal publication uses existing revision/lease transactions and validates both exact
task IDs, full supporting context and current eligible citations. A workspace observation
cannot be cited as a human decision. Approval is a single existing CAS transaction:
check both original snapshots/current human context and pending input, add human approval
sources, then apply both changes or neither. Consolidation rejects (never deletes) the
redundant record and unions evidence on the survivor. Coordinated correction retains
both IDs and adds evidence/approval to each. Original proposals, snapshots, sources and
history remain inspectable. Changed behavior invalidates applicable coverage and existing
implementation/delivery freshness through the normal requirement/decision fingerprints;
untouched completed work is not globally invalidated. Workspace artifact formats stay
unchanged. Failure/cancellation never grants approval or repeats model calls at startup.

Upgrade checks exercise legacy ordinary proposals alongside new resolution proposals,
repeated SQLite reopening, approval after reopening, preservation of originals/history,
future formats and missing provenance. Deterministic checks also cover stale/atomic
rejection, malformed/missing/out-of-task evidence, pending reviews, cancellation/context
failure, completed-task reuse after failure, clarification follow-up and the 20-call bound.
Live model resolution quality remains unverified; fixtures do not establish semantic
correctness or subscription compatibility.

### Approved-requirement wording audit (2026-10-20)

Source/target: SQLite **3 → 3**, project/execution JSON and workspace artifacts
unchanged. The explicit bulk audit derives read-only candidate pairs from an in-memory
project snapshot. Results are session-only, revision-labelled, and not new saved
assessments, approvals, findings or freshness evidence. Revision changes show a stale
snapshot warning; reload/project switching clears the report. No startup rewrite,
migration transaction, model call, reset, reassessment or invalidation of valid completed
work is required. Cancellation/failure affects only the local check.

Legacy approved records participate without modification, including equivalent wording
with different IDs/scenarios. Existing upgrade/reopen tests now exercise the audit and
verify unchanged original snapshots/history and approvals. New tests cover eligible
active-feature scope, pair uniqueness, bounded output, cancellation, no-match results
and complete 500-requirement pair evaluation. Browser checks verify all-feature scope,
paging, lazy comparison details, unchanged state/history/jobs, stale results, reload,
mobile width and cancellation/retry. Similarity remains advisory, not semantic proof.

### Discovery wording-similarity safeguards (2026-10-20)

Source/target: SQLite **3 → 3**, project/execution JSON unchanged. New rounds use
Unicode NFC/case/whitespace/terminal-question-and-sentence-punctuation normalization
for duplicate wording checks. Internal punctuation, operators, numbers and negation
remain significant. Scans use the same key when skipping already-existing wording.
These checks apply only to new output; saved duplicates, approved wording, original
evidence, IDs, revisions, assessments, fingerprints and delivery records are not rewritten
or invalidated. No upgrade model calls or reassessment are required.

Related-record hints are optional bounded navigation context, recorded through existing
job manifest character counts/indexed IDs. They do not authorize evidence citations.
New question citations are checked against detailed context for concept projects as
well as scanned projects; saved question evidence is preserved, not revalidated or
invalidated on upgrade.
New round similarity notices use existing `roundChanges` strings. Review comparisons
are computed read-only from current records, including legacy records, without new
persisted state or a migration/startup transaction. Existing stale-result and atomic
publication checks remain authoritative. Failed discovery preserves saved input.

Checks: repeated SQLite reopening preserves original snapshots/history and approvals;
bounded-context, exact-duplicate atomicity, opposite-rule warnings and read-only review
tests pass. Similarity is lexical and advisory, not semantic reconciliation; saved
records are never automatically merged or rejected.

### Implementation planning v1 (2026-10-19)

Source/target: SQLite **3 → 3**, execution payload **1 → 1**. Add optional `planning`
and `planningHistory` envelopes with independent `format: 1`, and optional
`config.implementationOrder`. Missing fields mean the existing manual-planning workflow;
no data rewrite, model call, new approval requirement or evidence invalidation occurs on
upgrade. Startup validation rejects unsupported future planning formats, including
history, without replacing saved payloads.

Proposal checkpoints preserve original requirement IDs, evidence references, steps,
verification guidance, session IDs, model, specification revision, workspace binding,
settings identity and creation time. Approval records selected hard edges, notes and
approval time while retaining original proposals. Replacement/retry retains old plans.
Interrupted retries reuse completed packages only against the exact same planning
inputs; no missing provenance is invented. Approved dependencies use existing semantic
freshness rules; changed prerequisites can genuinely invalidate affected assessment
context. Ordering alone does not change assessment identity or delivered evidence.
Planning settings identity canonicalizes object keys and prerequisite/path sets; equivalent
serialization does not require repeating proposal calls. Execution order remains ordered.

Writes use existing transactional execution CAS/worker leases. Review also checks the
current specification revision and workspace binding; crashes leave checkpoints for
explicit retry and never automatically repeat model calls. Existing code/delivery runs
must be archived before a replacement plan. No workspace artifact format changes.
Deterministic checks exercise legacy migration preservation, unsupported planning
formats, failed/interrupted checkpoint retry, approved-plan repeated reopen, stale/CAS
rejection and browser review. Live planning output quality remains unqualified.

### Discovery glossary cleanup and validation diagnostics (2026-10-19)

Source/target formats unchanged: SQLite **3 → 3**, existing project/job JSON and
workspace formats unchanged. New discovery results may omit schema-malformed
individual concept annotations before strict analysis validation; valid annotations
and all substantive proposal fields remain validated normally. Existing phrase-reference
cleanup still applies. Omission counts use the existing revision `roundChanges`
strings; blocking failures use the existing job `diagnostic` string with bounded field
paths and expected-shape details, without model values.

No forward data transformation is needed. Existing snapshots, completed/failed jobs,
evidence, stable IDs, assessments, fingerprints and worker leases are untouched.
Reopening does not replay old failures or repeat model calls. Old failed rounds remain
failed and require explicit follow-up; this change does not reconstruct missing results
or certify them as applied. New result publication retains the existing revision/lease
checks and atomic transaction. Regression coverage exercises old completed work and
history preservation across repeated reopen, durable cleanup reporting, and atomic
rejection of substantive errors alongside malformed annotations.

Verification (2026-10-19): `npm run check`, all **235 tests** under `npm test`,
and scoped `git diff --check` passed. Read-only replay of the original failed
Rust Grind Galaxy response through the new parser omitted its single dummy entry,
retained its valid annotation, question and requirement, and passed schema validation.
This did not publish that response or make a live model call.

### Project activity index v1 (2026-10-19)

Source/target: SQLite **2 → 3** (older supported databases run migration 2 first).
Execution schema **1 → 1**, assessment semantics and freshness fingerprints unchanged.
Migration 3 adds `project_activity`, an indexed projection keyed by project/event ID
with an independent monotonic recording sequence. Original revision snapshots, human
input, jobs, submissions, execution payloads/CAS and workspace artifacts are untouched.
No reassessment or model call is needed.

- Backfill compares consecutive saved project snapshots by stable record ID, retaining
  before/after descriptions and feature names. It also projects saved stopped jobs,
  needs-attention submissions and retained assessment/implementation outcomes. Dates
  absent from historical revisions are left absent; known run start dates remain start
  dates. Revision entries are backfilled in revision order, then retained outcomes;
  cross-source historical chronology is not inferred.
- Linked job/run snapshots supply historical item and feature names. Missing linked
  snapshots fall back to retained IDs rather than substituting current wording. Old
  needs-attention submissions without a recorded context revision remain explicitly
  unlinked; the current specification revision is not substituted as their original
  event revision.
- Reads are bounded to adjacent snapshots, without holding an active SQLite cursor
  during writes. Index creation, backfill, migration ledger and `user_version` commit
  atomically under the ordered migration transaction. Failure rolls back the derived
  table and version; reopening retries against unchanged source evidence. Original
  evidence is its own rebuild source, so no additional source-payload backup is needed.
- New activity and its source changes commit in the same transaction. Event IDs make
  repeated saved outcomes idempotent; historical projections are not overwritten with
  today's feature names. New revision/job/submission entries carry their actual recording
  timestamp; backfill never substitutes the upgrade date for missing event provenance.
  Routine worker progress is not indexed. This additive upgrade
  does not expire leases or take ownership of another worker. Unsupported future
  database/payload formats retain the existing refusal-without-overwrite behavior.
- The authenticated read API applies highlight/type/feature/search filters in SQLite
  before its fixed 25-row limit. Anchored pages exclude later recording sequences;
  search treats punctuation literally. The existing revision API stays compatible.

Upgrade coverage includes a 1,000-revision v2 database, malformed-snapshot rollback,
repair/retry, exact preservation and repeated reopen. Existing execution upgrade tests
now also remove the new derived table when constructing pre-upgrade fixtures.
Verification (2026-10-19): `npm run check`, all 233 tests under `npm test`, and
`npm run test:browser` (including the UI build and 1,000-routine-revision activity
exercise) passed. The suite also checks historical labels, duplicate-outcome
preservation, stopped jobs/submissions, literal search, stale-page anchors and API
authentication/input bounds. These ran in the available Node 20.11 environment;
Node 22.12+ remains the development baseline. No live model calls were made.

### Operation coordination and citation diagnostics (2026-10-19)

Database **2 → 2**, execution envelope **1 → 1**, assessment compatibility and all
freshness/content fingerprints unchanged. No schema migration, payload rewrite,
reassessment or model call is required. Existing completed evidence, source IDs,
submission IDs, history and manual pause intent retain their meanings.

- Execution uses the existing lease table for a short project startup reservation
  (`startup:<project id>` resource), upgraded transactionally to the canonical Git
  common directory with the same owner. Other live owners are never displaced.
  Crashed startup reservations expire under the existing execution lease duration.
- Newly pending discovery/help/scan jobs populate the existing `leaseUntil` field
  before the runtime starts. Recovery also recognizes expired pending jobs. Legacy
  pending jobs with `leaseUntil: null` have no live-worker provenance and become
  interrupted during explicit recovery/startup; they are retained and never replayed
  automatically. Completed and live leased jobs remain untouched.
- Existing queued/saved submissions stay in their original formats. Automatic wake-up
  cannot apply them during execution; failed/cancelled workers pause waiting follow-up.
  An expired execution lease pauses automatic follow-up until explicit discovery/scan
  resume acknowledges only the expired reservation. Restart retains explicit resume.
- Evidence eligibility is unchanged; the prompt now shares the validator's allowlist,
  and diagnostics distinguish invalid references. Historical failure messages and
  previously completed work are not rewritten.

Regression coverage includes independent database connections, reopen with a live
owner, legacy null-lease pending recovery and repeated recovery, canonical-repository
contention, durable queued input, advisory help, manual/automatic follow-up preferences
and expired-worker explicit resume. Browser coverage exercises disabled actions with
focus/hover/touch, accessible descriptions, activation suppression and dialog Escape.
These checks passed in the 228-test deterministic suite and the Playwright browser
run on 2026-10-19; type checking and the UI build also passed. No live model calls or
user data resets were used.

### Additive assessment impact metadata v1 (2026-10-19)

Source/target: execution JSON envelope **1 → 1**, database **2 → 2** and assessment
semantics `assessment-evidence-v1` unchanged. This is an optional, independently
versioned cache extension; no existing field is reinterpreted and no startup rewrite
or new required representation is needed. Future footprint versions are rejected by
startup validation without overwriting data. An incompatible future envelope still
requires an ordered registry migration.

- Optional settings: `assessmentScopes`, `sharedAssessmentPaths` and
  `reuseEquivalentScopes`. Absent scopes retain repository-wide checking; absent
  equivalent-scope setting retains separate local/main inference. The browser enables
  equivalent-scope reuse for newly configured projects, without changing saved settings.
- New assessments store footprint version 1: normalized policy identity, captured
  path/hash/excerpt boundaries, an omission inventory digest and a content fingerprint.
  The footprint covers search scope, shared/configuration paths, prerequisite boundaries,
  referenced evidence and all detailed-window evidence. It is not synthesized from old
  citations. Snapshot/omission budgets and unknown evidence retain their existing limits.
  Only the app-owned excluded `.requirement-wizard` publication-directory inventory entry
  is omitted from this digest, since it need not exist in a detached main worktree;
  normative inputs are independently checked. Captured source bytes (including line
  endings), all other omission metadata and excerpt boundaries must still match.
- A compatible older checkpoint can acquire a footprint on an explicit normal check
  only if its exact saved capture fingerprint, requirement, relevant decisions, model
  and workflow match and no newly configured reviewed boundary requires a new search.
  This also permits HEAD-only changes with identical captured content. Original result,
  evidence, dates, commit and specification revision remain unchanged. When exact
  equivalence is unavailable, retain the old result and queue conservative reassessment.
- Per-run optional impact reasons/fingerprints and a `preview` flag describe the
  assessment queue. Preview performs no inference or main verification. Old runs are
  not reconstructed; absent impact metadata keeps the existing conservative fallback.
- Optional manual reassessment requests keep a unique token, date and reason. New
  checkpoints record the token they satisfied; local/main satisfy requests independently.
  Old assessments/delivery records are retained, not deleted or rewritten as missing.
- Opt-in cross-scope reuse requires compatible footprint and normative/model inputs
  matching the target capture. A copied target checkpoint records `semanticOrigin`
  (original scope, commit and capture date) and target snapshot identity; the original
  checkpoint is unchanged. Actual main check output and main delivery remain separate.
- Footprints and manual request tokens stay local to SQLite and are excluded from
  portable progress artifacts. Semantic origin is portable provenance. Workspace
  artifact format remains 2; no saved requirement IDs or human decisions change.

Enrichment/checkpoints use the existing atomic execution save, CAS and worker lease.
Interruption before saving leaves the old checkpoint intact; a saved checkpoint is
reusable on retry. Startup itself neither enriches nor repeats model calls. Reopening
validates optional footprint formats and retains histories and counters unchanged.
Existing migration transaction rollback and future-format rejection also cover malformed
or future footprint metadata. No data reset is needed.

Verification (2026-10-19): type checking, all **224 deterministic tests**, the UI build
and Playwright browser checks passed. Fixtures cover exact legacy enrichment,
preserved provenance across repeated startup, scoped additions/deletions/shared changes,
manual requests, equivalent local/main reuse with independent verification and divergent
code, failures/cancellation, new files appearing during a frozen capture, and future-format
rollback. Browser checks cover saved feature boundaries, preview requests/reasons,
manual marking, mobile width and a 500-requirement collapsed view. No live model calls
were made. Installer upgrades and the user's particular saved database were not exercised.

### Database 0/1 → 2; execution payload 0 → 1 (2026-10-19)

Implementation: `src/storage/migrations.ts`, called by `ProjectStore` before workspace
upgrades/publication. The base tables are initialized first for a new database.
An ordered registry applies migrations under one immediate SQLite transaction and
records each version/name/time in `migration_history`.

Transforms:

- Add explicit execution schema version, keeping all existing execution fields.
- Convert known legacy `[taskInputs, referencedPaths, fullSkillDocument]` identities
  to `decisions-v1`, using the **saved inputs**, never today's project state. This also
  normalizes legacy object-property ordering without reinterpreting decisions.
- Recognize the exact shipped assessment v1 document using its frozen SHA-256 digest.
  Only results also recording policy `requirement-isolation-v3` and the correct skill
  name/version receive `assessment-evidence-v1` compatibility metadata. Unknown
  documents/workflows and missing identities are retained without inventing metadata.
- Apply identity conversion to aggregate, workspace and main assessments, current
  delivery and delivery history. Save the original identity in
  `legacyContextFingerprint`. Retain original model/skill/policy, evidence, source
  hashes, dates, check output, current/archived coding runs and assessment runs.
- Keep an exact original execution payload and its concurrency version in
  `execution_migration_backups`, keyed by project and migration. These are local
  SQLite payload backups, not standalone full-database backups or portable exports.
- Advance each migrated execution row's concurrency counter once, so an already-open
  client cannot overwrite its new representation. Specification revisions do not change.
- Mark connected workspace artifacts dirty for normal conflict-aware publication.
  Portable artifact format stays at 2; local identities/backups are not exported.

Compatibility and reuse:

- Known equivalent legacy results keep current credit if their actual inputs still
  match. A changed human decision remains stale after migration.
- Older pre-skill policies, unknown skill documents and context projections not
  demonstrably equivalent are **not** automatically certified compatible. Dated
  results remain available. Legacy results without context identity retain their
  prior revision-bound freshness behavior but are not reusable inference checkpoints.
- Main verification commands still run on an explicit main check; an upgrade itself
  does not run commands, infer, fetch Git or resume a worker.

Failure/recovery:

- Live execution leases block the upgrade. Stop the owning worker and reopen; expired
  leases do not block it and are not otherwise modified by migration.
- Invalid JSON, unsupported future payloads or inconsistent row/payload concurrency
  versions stop the transaction. Payload edits, backup rows, migration history and
  database version roll back together. Reopening retries the upgrade safely.
- Repeated startup validates supported payload formats without reapplying migrations,
  duplicating backups or changing counters. Older app builds reject database version 2.
- On failure, keep the database and its WAL/SHM companions intact. Correct the reported
  blocker and retry. Original-payload backups support diagnosis/manual repair; there
  is no automatic downgrade or restore command. Copying only `projects.sqlite` while
  an app is writing is not a consistent external backup procedure.

Verification (2026-10-19): type checking, all 220 deterministic tests, the UI build
and Playwright browser checks passed. Desktop TypeScript compilation also passed.
After freezing the legacy skill test fixture independently of the current workflow,
the four migration tests and the real-local-Git incremental-check/upgrade test passed
again. Tests cover preserved evidence/main credit, repeated startup, stale CAS rejection,
changed decisions remaining stale, unknown/missing provenance, transactional rollback,
live-lease blocking/retry, malformed/future payload rejection and unknown-result reuse
without inference. Installer upgrade behavior and the user's particular saved data
have not been exercised by the deterministic fixtures. No live model calls were made.

## Existing migrations and follow-ups

The workspace artifact 1 → 2 conversion retains its existing publication journal and
external-edit checks; see [project-workspaces.md](project-workspaces.md). Older project
snapshots still use the existing schema-default/read normalization. Provider/settings
migrations retain their existing boundaries. This change does not claim those earlier
paths were retrofitted into the new execution migration registry.

Future database migrations append registry entries. Future execution representations
must add ordered transformations and increment their schema version; do not reinterpret
the CAS counter. Add curated old-data fixtures for each supported upgrade path.
