# Architecture outline

`src/core/epic-collection-baseline.ts` now supplies active exact-prefix collection
reuse for fresh dense-v5 discovery. It independently authenticates a completed
source and compares expanded model-visible read evidence, guidance and drafts.
The first change stops reuse; later reads and all current checks remain mandatory.
Storage authenticates the referenced source again at publication; portable 47
retains and validates ancestry. SQLite 76 adds the reader boundary without rewriting
paid work. This is separate from the read-only semantic impact hypothesis below.
See [compatibility](migrations.md#authenticated-incremental-collection-2026-11-13).

New shared-answer selection has a read-only cost forecast before work starts.
`src/core/answer-integration-cost.ts` measures complete evidence/support packets,
compares individual schedules, labels unknown draft/lookup/repair cost and never
supplies progress or verification authority. Retained work is not repriced.
SQLite 75 preserves the additive diagnostic reason/estimate; portable formats stay
unchanged. `src/core/epic-change-impact.ts` authenticates a prospective incremental
baseline/delta and validates **untrusted hypotheses only**. It is not dispatched or
used for scheduling skips. See [implementation boundaries](migrations.md#new-answer-cost-routing-and-impact-preflight-2026-11-13).

`src/storage/staged-json.ts` streams continuation JSON to a private temporary file
with incremental UTF-8 hashing. The publisher preserves exact portable bytes and
manifest-last/journal/CAS semantics without retaining the whole serialized history.
Conflict hashing is bounded too; exports enforce existing import size limits before
managed writes. SQLite 74 adds only exact-input historical policy-miss CPU caching.
Fresh compact shared-answer schedules measure complete scoped-read packets with
the full draft reserve; old paid arrays replay verbatim. See
[compatibility and limits](migrations.md#bounded-portable-rendering-and-exact-policy-misses-2026-11-13).

Frozen-draft saved-response verification retains original read plans and adds a
separately authenticated exact-evidence packing plan only before any check attempt.
SQLite 73 is a reader boundary; conditional portable 46 carries the new metadata.
Repairs still recheck every original batch. Publication-private structural sharing
uses ordered JSON signatures, a bounded cache and copy-on-write sanitization; it
does not change artifact bytes or delete history. Child phase IPC improves abnormal
exit diagnostics without claiming the reported real-project abort is fixed. See
[preservation and qualification](migrations.md#frozen-draft-verification-and-publication-sharing-2026-11-12).

`src/core/epic-continuation.ts` prepares a single exact, coordinator-owned
scheduler-paused package through the existing planning worker. It bypasses catalog
history/cache loading only for same-revision/model zero-attempt budget checkpoints;
normal stage replay and expected-revision checks remain mandatory. Other input or
failure classes use full planning. Reports remain explicitly partial. Historical
policy probing preserves original selection priority while rendering each
representation once; pending-inventory boolean proof memoization is bounded and
exact-input-bound. See [compatibility and limits](migrations.md#exact-paused-package-continuation-and-useful-question-windows-2026-11-12).

Question collection offers an existing useful batch at a cooperative boundary
instead of waiting for five. Read-only logs label ordinary saved budget checkpoints
as **Progress saved**, retaining original durable job states and paid attempts.
Neither change establishes semantic incremental discovery across changed decisions.

File-backed browser stores publish through the owned
`src/storage/workspace-publication-process.ts` child process (256 MiB old-space cap), leaving SQLite decisions durable
without waiting for portable history/rendering. SQLite 72 introduces a dirty
publication-generation counter separate from specification revisions; lease and
generation checks/CAS prevent clearing newer project or same-revision job changes.
Existing file ownership/journalling remains, and browser shutdown drains the child.
This supersedes worker-thread publication to contain fatal publication allocations.
Planning also streams scheduling hashes, projects diagnostics before decoding and
bounds disposable context/candidate/history caches. The original reported crashing
isolate remains unknown; see [memory mitigation](migrations.md#discovery-allocation-mitigation-and-portable-save-isolation-2026-11-12).
In-memory and standalone terminal publication remains synchronous. See
[upgrade and qualification](migrations.md#approval-responsiveness-refinement-packing-and-citation-correction-2026-11-12).

New refinement schedules use actual encoded-size packing with the existing full
draft reserve; old paid schedules retain their arrays/keys. Staged citation failures
can retain authenticated rejected replies and request bounded corrections using
the same step allowance. Conditional portable 45 preserves this history, never
authorizing an invalid proposal. Broader changed-evidence incremental discovery
still needs an explicit baseline/impact contract and is not implemented here.

SQLite 71 adds lazily backfilled exact-source digests with SQLite-trigger
invalidation and transaction-scoped snapshot resolution. Warm portable publication
avoids reading/hashing unchanged historical payloads, while retaining snapshot
content validation and the full-byte fallback for separate source/cache connections.
Continuation selection deduplicates before sanitization and omits diagnostic
fields before deep-copying. Paid evidence, selection semantics and older artifact
bytes are unchanged; see [upgrade contract](migrations.md#pending-question-visibility-and-warm-publication-2026-11-12).

Dense grouping-v2 pins exact scope-bound pending questions/options alongside linked
question/answer units. Explicit legacy-blocker recovery can activate authenticated
pending evidence during discovery or validation; it remains visible in every
remaining request and its effective hashes are replayed before publication.
Conditional portable 44 preserves this capability; old layouts remain exact.

`src/core/epic-linked-evidence.ts` closes explicit question/answer units for new
dense schedules and authenticates bounded supplementation of existing blocked
validation steps. Replay and dispatch share the same effective evidence hash;
storage validates the supplemented receipts before publication. SQLite 70 and
conditional portable 43 preserve original paid layouts and evidence. Recovery is
explicit, retains the original attempt ceiling and requires a new verdict; see
[migration/recovery contract](migrations.md#linked-questionanswer-discovery-evidence-2026-11-12).

Completed questions-only discovery may reuse exact evidence dependencies separately
from batch layout. `src/core/epic-stage-reuse.ts` authenticates original v4/v5
read/check ledgers against their historical revision and compares the complete
expanded record union plus every displayed guidance field with today's candidate.
Only fully completed published work qualifies; changed evidence and partial work
retain existing checks. Local resolved-prefix keys now use v5 without changing paid
protocols or portable formats. Numeric diagnostics distinguish equivalence proofs
and draft removals; see [compatibility and remaining scope](migrations.md#exact-dependency-equivalent-completed-discovery-2026-11-12).

Historical portable publication uses generation-3 content-addressed exact-string
computation in SQLite 69. A publication-scoped bounded reader authenticates source
revisions and distinct cached records, then shares immutable strings across
historical manifests without reconstructing full project objects. Generation-1/2
computation upgrades lazily; portable formats, selection/freshness rules and paid
protocols remain unchanged. Optional redacted numeric diagnostics distinguish
source hashing, cache reads, inflation, parsing and upgrade work. See
[compatibility and tradeoffs](migrations.md#shared-exact-historical-record-computation-2026-11-12).

Requirement pair decisions now have a small app-owned path separate from AI proposal
review. `src/core/requirement-resolution.ts` validates explicit remove/replace/combine
choices and preserves the two original records in human evidence. The store applies
the decision inside its normal expected-revision transaction and existing pending-work
gates; the loopback API retains authentication/origin checks. The browser's single
comparison form holds a local draft and never synthesizes or applies a merge on open.
`src/ui/review-reason.tsx` projects known state into plain explanations, without
classifying diagnostic prose as a product conflict. Existing SQLite/portable shapes,
paid work and freshness rules are unchanged. See
[compatibility](migrations.md#plain-language-requirement-resolution-2026-11-11).

SQLite 67 / conditional portable 41 adds a new-schedule-only empty-proposal terminal
policy to staged discovery. Replay authenticates every original read and the exact
empty boundary, without synthetic checks or changing old ledgers. Surviving proposals
retain full verification. Continuation encoding reuses per-snapshot serialized items
and a bounded invocation-local exact-string digest memo; output bytes and persisted
snapshot-cache format remain unchanged. Finer numeric publication timings distinguish
selection, snapshot reads and delta work. See
[upgrade and verification boundaries](migrations.md#empty-discovery-completion-and-exact-continuation-computation-2026-11-11).

Individual saved-input planning now measures its existing lossless dispatch encoder
against 96k with the full draft reserve, rather than partitioning raw records at
36k. Saved batch arrays/plan keys and all wire/replay semantics remain unchanged;
only unstarted schedules are packed differently. Incompatible epic-check selection
adds local structural input-change diagnostics against the latest completed package
snapshot, without changing exact matching or semantic freshness. See
[upgrade boundaries](migrations.md#measured-individual-answer-packing-and-input-change-diagnostics-2026-11-11).

SQLite 66 / conditional portable 40 adds v13 layouts for the already-adopted
union verification group budget. New layouts may exceed 64 within the unchanged
256-page cumulative group ceiling; v12 and older paid contexts remain exact. Read,
request, input, repair and storage safeguards are unchanged. See
[compatibility and checks](migrations.md#union-layouts-use-the-already-adopted-group-budget-2026-11-11).

SQLite 65 / conditional portable 39 extends explicit human clarification to an
already-rejected carried-draft repair. Each v2 note binds its exact draft and paid
prefix; unrelated decisions/actions and all usage remain intact. The existing inline
decision/save-and-continue flow is reused, without inventing precedence or weakening
verification. See [compatibility and checks](migrations.md#human-decisions-during-carried-draft-repair-conflicts-2026-11-10).

SQLite 64 / conditional portable 38 adds explicit paid-prefix-bound Play adoption
of the existing whole-group page budget for union verification only. Read steps
retain 64 pages; all reads/checks share the unchanged 256-page group budget, with
unchanged request, repair, storage and input safeguards. No startup adoption or
reuse of old-draft checks is introduced. See [policy and qualification](migrations.md#union-verification-shares-the-existing-group-page-budget-2026-11-10).

SQLite 63 / conditional portable 37 adds v12 joint layouts that may exceed 32 pages
only within the existing cumulative 64-paid/pending-pages-per-step budget. Prior
layout hashes, paid work, input limits and all other work ceilings remain unchanged.
See [migration and full-layout read-only qualification](migrations.md#joint-layouts-within-the-existing-paidpending-step-budget-2026-11-10).

SQLite 62 / conditional portable 36 extends the existing guarded joint-input policy
to new complete oversized rejected-comparison repair packets. Ordinary packing stays
96k; the 200k ceiling still requires fresh whole-prompt/model admission before dispatch.
Paid v1 repair packets, draft identities and usage remain unchanged. See
[compatibility and read-only qualification](migrations.md#guarded-capacity-for-complete-rejected-comparison-repairs-2026-11-10).

SQLite 61 / conditional portable 35 binds initial lossless packing to new shared
answer plans; preflight and dispatch use the same encoder without changing limits.
Portable selection applies the existing core refinement-currentness predicate,
reads only complete identity inputs for legacy checks, and walks required ancestors
without recursive exports. Saved SQLite history and paid protocols remain intact.
See [migration and measured limits](migrations.md#exact-portable-selection-and-initial-lossless-shared-packing-2026-11-10).

SQLite 60 / conditional portable 34 adds append-only human follow-up notes for rejected
initial-read clarifications. Original singleton notes, paid prefixes and all counters
remain intact; explicit `supersedes` ancestry identifies the current note without
choosing a product answer. Only the current note authorizes dispatch/publication.
See [compatibility and checks](migrations.md#follow-up-decisions-after-a-rejected-clarification-2026-11-10).

The initial shared-conflict decision UI now renders directly in requirement review.
Source-choice serialization lives in `src/core/shared-answer-decision.ts`; the browser
does not infer precedence. An additive consent/version-checked API option saves the
existing human evidence before invoking Play, acknowledging durable save separately
from continuation failure. No new persisted format or fingerprint is introduced.
See [compatibility](migrations.md#inline-shared-decisions-and-explicit-continuation-2026-11-10).

SQLite 59 / conditional portable 33 adds explicitly saved human clarification at an
initial shared-answer conflict's immutable receipt-prefix boundary. It is separate
from model replies, pinned with the exact conflicting originals after that boundary,
and published as a stable note source only after full verification. Saving neither
rebases material nor resets usage. See [scope and upgrade](migrations.md#initial-shared-conflict-human-clarification-2026-11-10).

SQLite 58 / conditional portable 32 adds plan-key-bound union verification for new
shared-answer work. Reads keep their batches; one complete-unit paged verification
union checks the frozen draft and all original evidence. Old ledgers replay unchanged.
An integrity-checked compressed local snapshot cache avoids repeatedly normalizing
historical exports without deleting history; owned workflow windows use the existing
workspace-publication deferral. See [migration and limits](migrations.md#union-answer-verification-and-portable-snapshot-cache-2026-11-10).

SQLite 57 / conditional portable 31 preserves the v1 singleton resolution review and
adds append-only v2 reviews for disjoint cited-answer conflicts, with eight total
reviews maximum and unchanged shared usage/failure limits. Historical context hashes,
completed reads/checks, assessments and the original review are not rewritten. See
[distinct resolution reviews](migrations.md#distinct-omitted-resolution-reviews-2026-11-09).

SQLite 56 / conditional portable 30 adds an immutable paid-prefix boundary for one
evidence-only review of omitted reverse-linked human resolution answers. It grants
no original-step credit or draft edits; review must cite exact supplied human answers
before resuming the unfinished stage. All historical packets remain unchanged. See
[recovery and compatibility](migrations.md#omitted-human-resolution-evidence-review-2026-11-09).

SQLite 55 / conditional portable 29 adds paid-prefix `inputCapacity` and evidence-page
v11 for a guarded 200k indivisible-unit exception, retaining 96k normal packing.
The runtime independently admits the complete prompt against fresh selected-model
limits before session creation; evidence characters are never treated as tokens.
Old wire hashes/assessments remain unchanged. See [capacity boundary](migrations.md#guarded-200k-joint-evidence-exception-2026-11-09).

SQLite 54 / conditional portable 28 adds immutable evidence-first lookup inspection
boundaries and replies. Exact prior receipt prefixes/drafts and activation counters
are authenticated; acquisition/planning never advance original coverage. Grouping
preserves every flagged joint set and all counterparts, and all actual comparisons
still use complete bodies/support. Earlier wire formats remain frozen. See
[inspection compatibility](migrations.md#evidence-first-blocked-lookup-inspection-2026-11-09).

SQLite 53 / conditional portable 27 supports lookup-review v2. Exact paid prior
contexts are authenticated before scope clarification; confirmed original-plus-all-
counterparts units remain atomic across relayout/reopen. Prior review v1 and page
formats/hashes are unchanged. See [lookup compatibility](migrations.md#counterpart-preserving-lookup-clarification-2026-11-09).

SQLite 52 / conditional portable 26 adds evidence-page v10. On oversized Play-owned
read/check packets only, opt-in bounded literal phrase pooling can preserve a complete
non-pinned joint set within the unchanged input cap. Old encodings/hashes stay frozen;
no bodies, authority, paid progress or semantic comparisons are removed. See
[joint evidence wire compatibility](migrations.md#lossless-joint-evidence-phrase-pooling-2026-11-08).

SQLite 51 / conditional portable 25 adds prefix-bound lookup-scope clarification for
oversized joint requests whose counterparts are all original pins. A dedicated
JSON-text model turn can confirm separate original-unit retrieval or block; it cannot
edit, approve, claim omitted evidence was read or establish independence. Only actual
confirmation changes that lookup's atomic retrieval constraint. Existing exact evidence
and verification gates remain. See [migration and qualification](migrations.md#oversized-pin-relative-lookup-clarification-2026-11-08).

SQLite 50 / conditional portable 24 adds prefix-bound, Play-owned progress-based
shared-answer correction. Beyond the legacy first two repairs, authenticated feedback
must identify a distinct existing draft target/current human-evidence comparison.
Scoped complete originals, preserved unrelated actions, no-op/version-loop guards,
eight total repairs and unchanged request/page/storage bounds limit recovery. All
verification restarts after correction. See [upgrade and qualification](migrations.md#progress-based-shared-answer-corrections-2026-11-08).

Shared-answer output capacity is now activated at a preserved receipt-prefix boundary
(SQLite 49 / conditional portable 23), independently of exact 96,000-character input
packing. Explicit Play can recover a completed oversized OpenCode reply using a strict
read-only adapter contract, keeping its paid attempt/usage and requiring all checks
again. Pending recovery and hashed receipt provenance retain the original parent, not
native session IDs in portable state. See [output recovery](migrations.md#shared-answer-output-capacity-and-completed-reply-recovery-2026-11-08).

Oversized shared repairs now use versioned contexts derived from their exact rejected
comparison, not an unrelated original background batch. A context pins the complete
draft, every human answer, named catalogue originals and recursive support. Unloaded
draft actions must stay unchanged and all original verification restarts after repair.
SQLite 48 / conditional portable 22 preserve this activation boundary without changing
earlier hashes, attempts or assessment identity. See [repair packing and upgrade](migrations.md#bounded-rejected-comparison-repair-contexts-2026-11-08).

Play processing appends a versioned automation policy at an authenticated shared
receipt boundary; it does not reinterpret historical hashes or reset spent attempts.
The workflow owns technical adoption, cross-feature existing-rule reconciliation
and a run safety ceiling. Shared-work reservations distinguish useful evidence
progress from consecutive failed requests; task limits survive reopen. SQLite 47 /
conditional portable 21 guard this reader capability. Earlier formats retain their
original replay semantics. See [migration](migrations.md#play-owned-specification-processing-2026-11-08).

Rule-scoped shared repair consent is app-owned metadata, not model authority.
The exact preview/revision/CAS grant pins one existing requirement, feature, original
support and paid prefix; storage/publication and portable import require its
retained consent parent. Activation at the original blocker boundary leaves earlier
receipt hashes unchanged. Only the named rule's `revise` may cross feature scope;
all post-repair verification stays mandatory. SQLite 46 / conditional portable 20
guard this capability without rewriting older work. See [compatibility](migrations.md#exact-rule-scoped-shared-repair-permission-2026-11-08).

Read format 9 preserves ordinary maximum-draft headroom but allows a standalone
indivisible unit with an existing whole draft when only speculative growth reserve
prevents packing. Every actual input remains capped at 96,000 characters; later
drafts are independently measured and can still block. SQLite 45 / portable 19 guard
this packing capability without changing older receipt semantics. See
[measured current-draft reads](migrations.md#measured-current-draft-read-units-2026-11-08).

Shared read format 8 derives completed coverage from authenticated paid page/layout
prefixes and packs recursive original-support closures. Explicit joint comparisons
remain atomic, unchanged draft actions survive, and every original check remains
mandatory. New dense v5 question-only schedules measure encoded packets with the
full draft/envelope reserve. Bounded exact-snapshot staged computation bundles are
local scheduling caches, not evidence or model authority. SQLite 44 / portable 18
guard the new reader variants; [migration details](migrations.md#stable-shared-reads-and-exact-staged-planning-2026-11-07).

## Scoped exact-original verification units (2026-11-07)

V7 preserves the complete draft and pinned human answers but schedules frozen-draft
originals across mandatory units instead of pinning every unrelated history on every
page. Each primary unit expands its complete requirement.sourceIDs/source.questionID/
question.sourceID closure before measuring fit. Requested joint units and first
missing-original-blocker reevaluation cohorts remain indivisible. Full original-batch
and draft-original coverage still gates publication; a local verdict certifies only
supplied units against the full draft, not unseen constraints. Legacy formats 1–6
replay unchanged; SQLite 43 and portable 17 guard the new protocol. See
[migration and geometry-only qualification](migrations.md#scoped-original-unit-shared-verification-2026-11-07).

## Compact decoding instructions for exact shared packets (2026-11-07)

V6 retains v5 joint-first scheduling but opts into existing compact explanations in
the lossless text/identifier/record-table encoders. Selection still measures the whole
encoded packet; decoded evidence is unchanged. Formats 1–5 preserve their original
bytes for replay. SQLite 42 and portable 16 guard the new wire reader boundary; see
[migration and measured fit](migrations.md#compact-lossless-shared-page-wire-instructions-2026-11-07).

## Atomic joint-first packing (2026-11-07)

Format 5 packs each pending requested/counterpart joint comparison as one indivisible
first unit, not a global pin on unrelated future pages. A positive first-page verdict
discharges only that unit; the cursor still requires all remaining background pages.
Frozen-draft originals remain global verification pins. Formats 1–4 replay unchanged;
SQLite 41 and portable 15 protect the additive protocol. Existing paid v4 overflow
can append a bounded v5 layout without a new grant or lookup. See [migration](migrations.md#atomic-joint-first-evidence-pages-2026-11-07).

## Original-record closure in shared verification (2026-11-07)

V4 check rendering pins the frozen draft's existing references/changed records and
original requirement sources plus linked question/answer bodies. The planner measures
these whole originals in every packet. Page-local prompts distinguish scheduled
background from detailed current-page constraints; every page/batch still gates
publication. Specific cross-page lookups co-locate requested and named loaded bodies.
An authenticated verification-preparation boundary retains old blocker evidence while
allowing reevaluation with exact originals, never new attempts or approval. SQLite 40
and portable 14 protect these readers; [migration details](migrations.md#evidence-complete-shared-verification-2026-11-07).

## Executed/pending page accounting and shared diagnostic cursor (2026-11-07)

V3 layouts keep the v2 exact data projection but replace the all-history layout-sum
capacity rule with actual successful replies plus proposed pending packets. Per-step,
group, layout-count, packet-count and receipt ceilings stay finite and are distinct
from request attempts and character fit. V1/v2 replay retains its original rules;
v3 plans append at authenticated boundaries without rewriting paid evidence. True
unit-fit and technical-capacity failures have different explanations.

`answerGroupProgress` accepts a compact typed cursor projection as well as the full
ledger. On-demand diagnostic export selects only response-kind booleans, step numbers
and page counts in SQLite, then uses that same cursor instead of treating every
successful page as an original completed step. New request measurements retain
allowlisted step/phase/page metadata; no bodies or identifiers are added to exports.
SQLite 39 and conditional portable format 13 protect the new readers. See
[migration and local preflight](migrations.md#paidpending-page-capacity-and-accurate-shared-progress-2026-11-07).

## Requested-first page protocol and bounded loop recovery (2026-11-07)

Page format 2 prioritizes unresolved requested bodies and adds an exact deferred
inventory to the bounded data. Reconstructed dispatch-only advice excludes already
scheduled IDs from lookup enums; core validation independently enforces it. New
layouts size the actual advice, complete pinned input, linked support and draft
reserve. Format-1 contexts stay unchanged, and v2 activates at an authenticated
receipt boundary, including a same-boundary v1→v2 transition. Prefix hashing is
schema-normalized for v2; legacy replay recognizes only known producer/database
ordering, never changed evidence values.

A separate one-time page-loop grant requires an exhausted unchanged first v1 page,
exact history replay and actual requested-body delivery under the new layout. It
retains attempts 1–4 and permits 5–8 only after explicit metadata-only consent;
starting inference remains a separate Continue action. SQLite 38 and conditional
portable format 12 protect the new readers. See
[compatibility and recovery](migrations.md#requested-first-pages-and-explicit-loop-recovery-2026-11-07).

## Bounded shared lookups and independent answer acknowledgement (2026-11-07)

Shared ledgers may append prefix-authenticated read/check page plans without changing
original material/plan keys, batches or paid receipt bodies. Replay reproduces each
partition at its activation boundary; partial pages cannot complete an original step.
Pinned human input, exact linked support, the full draft and the actual request cap
remain enforced. Successful repair invalidates earlier check-page layouts/results.
New initial schedules use fuller estimated packets with exact reserved-draft fit and
whole-record splitting before freezing their key. SQLite 37 and conditional portable
format 11 protect older readers; see [migration details](migrations.md#bounded-shared-answer-evidence-pages-2026-11-07).

The renderer's snapshot coordinator acknowledges a durable save-first answer reply by updating
only submissions, invalidating older refresh tickets and that section's wire token.
The save does not await polling or reload the project catalogue. Search memoization
is limited to immutable review inputs plus an explicit editable-draft version; it is
not a cache of semantic authority or a change to persisted evidence.

## Original supporting evidence and bounded recovery (2026-11-06)

Shared-answer material/plan identities retain the original projection for compatibility.
Optional versioned source-support metadata authenticates exact original bodies excluded
by background review projection, without promoting historical evidence to authority.
New work sizes batches with linked support; explicit legacy recovery activates after
a preserved receipt prefix, details only affected targets and keeps background packets
bounded. A transaction records one additional four-request allowance without inference
or workflow opt-in; the service continues correction attempts at 5–8, then requires
full original-batch verification. Original reads, blockers and failed spend survive.
SQLite 36 and portable format 10 protect new readers; earlier saved formats remain
valid. See [migration ledger](migrations.md#original-shared-answer-support-and-explicit-recovery-2026-11-06).

## Shared-draft correction and replay (2026-11-06)

Shared-answer format-1 receipts add an explicit repair response/stage. A negative
verification retains its exact receipt and selects a bounded corrective context with
the original pinned answers, failed batch, frozen draft and model feedback. Core
validation applies the original same-feature/exact-source authorization to the complete
repair. A receipt-derived cursor retains reads but resets current verification to the
first batch after each repair. Two accepted repairs and four charged attempts per step
remain durable across service/coordinator recovery and portable replay. Publication
requires full verification of the latest draft; old checks are history, not current
authority. Explicit human-conflict blockers remain terminal. SQLite 35 adds a reader
boundary without rewriting jobs/keys; see [compatibility](migrations.md#bounded-shared-answer-draft-repair-2026-11-06).

## Continuous scheduling windows and diagnostic attribution (2026-11-06)

Explicit continuous grants adopt question collection policy 2, retaining cumulative
spend separately from bounded cooperative work-window counters. Scheduler yields
release/reclaim ownership under the same grant; engine-marked request-budget pauses
or successful time-boundary stage pauses resume without resetting task attempts.
Actual timeouts/errors/Stop/changed inputs retain their existing stop boundaries.
`DiscoveryService`'s internal cooperative-window profile honors staged request counts
and checks active time between accepted steps while keeping a separate actual-request
timeout; ordinary manual/bounded profiles do not inherit it. Old policy-1 consent
and progress remain unchanged until explicit adoption. SQLite 34 protects readers.
Optional numeric bookkeeping/gap measurements and allowlisted selection/worker-stop
reasons improve local attribution without becoming evidence or freshness authority.
Final metrics-write timing is deliberately excluded rather than recursively persisted.
No portable envelope or original task hash changes. See [behavior and limits](coordinated-workflow.md#continuous-work-windows-and-processing-diagnostics-2026-11-06).

## Bounded workflow question collection (2026-11-06)

The coordinator's question collection policy is scheduling metadata, not a new model
protocol. `src/core/workflow.ts` bounds/validates format-1 policy/progress separately
from grant counters, semantic task identities and assessment freshness. The coordinator
loops through existing eligible epic packages toward a soft pending-question target,
without broadening the engine's unanswered-question dependency policy or introducing
area assessments. A separate bounded `DiscoveryService` view of the same owned workflow
makes staged packages honor the collection's actual remaining request/time limits;
every adapter request is charged in the same durable run receipt before dispatch.
Package passes, accepted read/check stages and failed attempts survive Pause/reopen.
After a completed publication only its exact committed snapshot advances the binding;
newer input stops rather than being silently chased. A live time checkpoint conservatively
charges an interrupted process on explicit recovery. SQLite 33 is a reader boundary
only; old jobs, context hashes, assessment identities and portable envelopes are unchanged.
Collection consent/counters are not exported. See [workflow behavior](coordinated-workflow.md#bounded-question-collection-2026-11-06).

## Shared exact answer integration (2026-11-06)

`src/core/answer-group.ts` combines the complete original per-answer evidence sets,
pins every original question/answer, freezes a bounded shared schedule and validates
drafts, exact lookups, per-answer outcomes and immutable check receipts. It keeps old
single-answer protocols unchanged. `src/service/answer-group.ts` owns staged dispatch,
local timings, finite attempts, cancellation and telemetry/research guards. Queue
selection groups only fresh compatible unscoped same-feature answers inside explicit
coordinator consent; retained group work takes precedence and cannot be split into
fresh allowances. Storage retains historical replies before stale detection and replays
the complete ledger before atomic publication through existing specification gates.
SQLite 32 adds a reader boundary, not a table rewrite. Portable format 9 is conditional
on retained shared work and preserves exact record order, original snapshots and
waiting inputs while excluding local accounts, consent and telemetry. Browser views
project counts/stages, not group drafts/receipts. No narrower verification is inferred.

## Save-first answer scheduling and local profiling (2026-11-06)

The coordinator's optional format-1 `inputBatchPolicy` freezes submission eligibility
to its explicit grant's saved IDs and suppresses decision-wait wake-ups. The view
projects pending-response counts; UI saving still uses the durable existing queue,
not a renderer-owned draft batch or alternate approval path. Publication and exact
single-submission identities are unchanged. `DiscoveryMeasurement.submissionLocal`
records allowlisted synchronous phase timings around the staged runner, with no
additional writes per phase; original metrics checkpoints persist them. SQLite 31
protects the additive local readers; portable state excludes both consent and metrics.
This is not yet shared multi-answer execution or narrower semantic verification.
Staged-submission recovery selects its latest matching job directly in SQLite,
preserving original row-order/exclusion semantics without decoding unrelated jobs.

## Bounded change-review continuation (2026-11-04)

`src/core/definition-change-batches.ts` owns the immutable source ledger, frozen exact
batch partition, bounded contexts, stage/context identity and final-joint validation.
It reconstructs the original v2 lookup chain without dispatching oversized bodies.
Storage adopts v3 transactionally only during explicit live continuation, persists
local response/context/date/model/attempt provenance and publishes only a saved joint
verdict. The service retains selected-model/no-research permissions, grants, leases,
per-request cancellation/timeouts and expected revisions. UI reads bounded counts;
it does not infer currentness or contain batching/evidence logic. Database 27 and
portable state 6 add reader-capability gates without rewriting compatible old work.
See [migration/recovery details](migrations.md#bounded-change-review-batches-and-joint-verdict-2026-11-04).

`definition-change-review.ts` adds a separate bounded semantic change-impact task
before full definition refresh under the existing Continue-specification owner/grant.
It compares every complete saved dimension finding with every exact delta and
bounded whole provenance/question-answer records. Matching dated receipts can retain
unaffected findings without modifying their original basis/date; affected or uncertain
areas use the existing evidence review. Storage owns durable charged attempts,
response retention and atomic publication; coverage consumes exact receipt identity,
not citation-graph independence. See [migration 24](migrations.md#dated-definition-change-impact-reviews-2026-11-04).

`definition-baseline.ts` adds an optional exact original-collection envelope for new
staged follow-ups. Storage binds the actual original publication/result, core compares
the full guarded record inventory and schedules changed collection plus complete
current verification, and the existing service/queue publishes only after all checks.
Portable continuation retains compact publisher receipts and original snapshots;
the renderer identifies the retained revision. No SQL migration, frozen v1 key change,
fine-grained independence or verification skip is introduced. See
[durable incremental workflows](workflow-resilience.md).

Unfinished origins use cooperative exact-checkpoint replay and a content-addressed
derived-draft cache, pinned for active workers. New pending collection plans pack
changed/unread records separately from full verification; saved older schedules stay
unchanged. Unpublished source ledgers and their bounded ancestry remain portable.

`workflow-schedule.ts` derives a bounded question-scope dependency schedule for
definition evidence reviews only. Optional local workflow snapshots retain waiting
decision identities; current views recompute labels without writes. Storage supplies
copy-safe compact checkpoint metadata cached with local/cross-connection invalidation.
The existing coordinator owns dispatch/consent and readiness remains unchanged.

Submission, readiness and refinement stage services validate replies against frozen
materials before checkpointing. Their owned storage transactions retain original
computation and stop stale after committing, rather than rolling back accepted
responses on a concurrent revision. Publication still requires current inputs and
complete replay; no new work format or changed-material reconciliation is implied.

Retrieval checkpoints use the same commit-before-stale boundary for accepted
navigation/final responses and staged epic receipts, with original task/policy/plan
binding. Planning saves owned historical packages and exact staged receipts before
current-input checks; only final proposed-plan publication uses revision/workspace
checks. Execution leases and version CAS remain required for historical writes.

New planning target-input receipts bind current supplied evidence/candidates,
instructions/schema/skill and package digests. Explicit replacement planning may
reuse proven-compatible targets across revisions while leaving the original plan
immutable. Changed target inputs still need fresh work; the current replacement
plan, not a stale historical plan, must pass review and approval. Single-context
unrelated-source inventory counts alone are excluded from evidence identity.

Staged planning format 2 adds a bounded, self-contained format-1 source witness and
separate pending-collection/full-verification schedules for additive evidence changes.
Source request replay authenticates retained reads; every current batch still verifies
before a package is exposed. Formats 2/3 alone do not reconcile changed/removed records
or structural/global/target changes. Format 3 extends additive continuation
through a bounded, linear source-work chain (six snapshots / one-megabyte baseline
witness). Accepted collection is accumulated across ancestors; verification still
covers every current batch. Recursive schema descent is depth/cycle guarded, and
source revisions must precede descendants. Witnesses stay out of model context.

Format 4 handles changed/removed evidence under unchanged target/global envelopes
and requirement guardrails. Retained read keys and exact evidence deltas are replayed;
historical retirement entries are distinct from current records. Obsolete prerequisite
proposals stay in the witness, not the active seed. Superseded IDs cannot authorize
current dependencies, and every current batch verifies before explicit human review.
Planning envelope 2 separates pending historical target-source capsules from current
work. Owned startup captures nearest compatible sources before plan replacement;
per-target validation atomically attaches current work and consumes its capsule.
Frozen materials preserve exact partial replay. Portable projection retains capsules
and rebinds their workspace identity on explicit adoption, without the full archive.

Startup observers in `src/core/startup.ts` project actual store/upgrade/validation phases through
the owned desktop worker. Electron creates a sandboxed local splash before backend startup,
then navigates that same window to its owned loopback origin; progress is indeterminate, not
a fabricated completion percentage. The store's verification/transaction behavior is unchanged.
`ProjectProgress` keeps ordinary progress separate from the Settings-launched advanced-tools
dialog. Empty source catalogs are explained without fabricated origins, model calls or resets.
No persisted format change is involved. See [startup](desktop.md#visible-startup-2026-10-31)
and [navigation](browser-workspace.md#simpler-progress-and-optional-assessment-tools-2026-10-31).

Database 26 adds covering expression indexes for startup change-review validation.
They project review arrays rather than full project/revision payloads and remain
maintained by SQLite on historical edits. A bounded, launch-local digest cache avoids
parsing identical arrays repeatedly without permanently trusting saved data. One-time
indexing and later history/work/evidence checks have separate allowlisted startup
phases. Full evidence/fingerprint semantics and portable formats are unchanged; the
first index build still reads the archive and other validators remain active.

`workflow-receipts.ts` defines an ephemeral scheduling/proof view, not a saved job.
The coordinator reads its necessary task/verdict fields directly from SQLite instead
of retaining whole histories across inference. Completion/clarification still load
the matching original full records. Definition candidates are decoded lazily with
the existing selection window and no cursor held over awaits. Portable assessment
origins are encoded one snapshot at a time, retaining only the exact output deltas
and interned differences. These changes reduce heap pressure without truncating
saved evidence, changing fingerprints or resetting attempts. They do not bound all
archive/export costs; see [the allocation-failure investigation](desktop.md#assessment-memory-pressure-mitigation-2026-11-04).

`definition-change-evidence.ts` adds app-owned exact source lookup turns to change
checks; it grants no native tools or research. Versioned lookup ledgers bind request
hashes and attempts to original snapshots. All loaded bodies, original findings and
changes remain in the bounded joint context; publication separately binds the final
context and verdict. Database 25 is a capability-only forward boundary. Portable
state 5 records exact current record ordering before applying historical deltas,
preserving linked source/question identities across grouped feature files. Legacy
v1 work retains its original protocol and paid results; no upgrade-time inference.

`definition-mixed-publication.ts` in core/storage and its UI component add exact supported-source
publication previews, immutable local review history, separate eligibility/consent and idempotent
atomic apply. SQLite 23 adds only local saved-review/receipt tables. `ProjectStore` commits
assessment/history, the existing definition-only implementation compatibility certificate,
receipt and activity together; original task/source/origin/reader/portable/fingerprint formats
are unchanged. No provider/coordinator execution authority is added. See
[saved reviews versus separate assessment publication](definition-mixed-publication.md).

`src/core/definition-mixed-view.ts`, `src/storage/definition-mixed-view.ts` and
`src/ui/definition-mixed-controls.tsx` add explicit bounded source pages, exact candidate preview,
lightweight dated status and separately requested original-witness display. The web server now
constructs the mixed bridge/service for explicit consented starts through the discovery queue;
exact job/kind ownership gates Stop. Reload and uncertain responses require reads, not write
replay. That browser slice itself added no automatic coordinator, publisher or persisted-format
change; later separate publication controls add assessment-only apply.
See [browser workflow boundaries](definition-mixed-browser.md).

`src/service/definition-mixed-adapter.ts` explicitly bridges store-verified mixed tasks to
existing selected OpenCode/direct adapters. Provider preflight reconstructs the frozen
canonical selection identity and exact full context; private snapshots and sticky callback
checks bind expected model/research observations. Runtime uses a dedicated JSON-text prompt,
while direct opts mixed requests into the unchanged strict no-tools/text-inventory profile.
The bridge itself introduces no API/task scheduling/publication authority or persisted format. See
[provider boundary versus live qualification](definition-mixed-providers.md).

`definition-mixed-review.ts` in core/storage/service adds exact typed source selections,
actual ordinary/scoped witness reconstruction and a separately authorized in-process task.
SQLite 22 records one-request reservation, validated replies, atomic completion and explicit
no-call recovery, with bounded dated/verified inspection. Explicit browser dispatch now exists;
automatic coordinator dispatch remains absent. Separately confirmed assessment apply now exists.
The provider bridge rejects malformed/alternate profiles before startup;
portable/generic discovery/resume/coverage-baseline paths exclude it. See
[durable mixed pilot boundaries](definition-mixed-execution.md).

`definition-mixed-assessment.ts` adds a separate persisted mixed-origin reader format,
exact nine-finding assemblies and structural consistency declarations. Schema-only check/
scope/provenance modules prevent project-schema cycles while preserving frozen v1 identities.
`definition-mixed-consistency.ts` builds complete bounded evidence contexts and validates
dedicated replies, but has no provider, task dispatcher or publisher. SQLite 21 and conditional
portable state 3 protect the new marker from older readers; old payloads are unchanged.
The browser displays distinct dates/complete source concerns as declarations, not independent
authentication. See [implemented reader versus future apply](definition-mixed-assessment.md).

`src/core/definition-scope-provenance.ts` adds distinct scoped-observation origins and a
whole-result provenance packet, without changing ordinary origin/assessment schemas.
`ProjectStore.inspectDefinitionScopeProvenance` verifies exact original/root witnesses in
a bounded readonly transaction. It does not use today's project as the original review.
The later mixed source catalog explicitly calls it; there is no publisher, migration or automatic caller. See
[provenance and future assembly gates](definition-scope-provenance.md).

`src/service/definition-scope-qualification.ts` and `scripts/qualify-definition-scope.ts`
provide offline structural preflight and explicit one-shot OpenCode qualification runs in
exclusive synthetic directories. Readonly bounded inspection binds case/model/original inputs
without startup migration or automatic recovery. Reports require human semantic review;
this harness grants no browser/coordinator/publication authority and changes no app schema.
See [qualification boundaries](definition-scope-qualification.md).

`src/service/definition-scope-adapter.ts` explicitly bridges scoped tasks to existing
discovery/provider adapters using an unchanged v1 manifest and authoritative project.
`runtime/discovery.ts` has a scope-only prompt/profile guard; the direct provider opts
scope requests into no-tools and complete text-inventory checking. Default owned-server
and exact-account routing stay intact. Browser dispatch is explicit; coordinator dispatch
remains disabled.
See [provider bridge versus live qualification](definition-scope-providers.md).

`src/service/definition-scope-review.ts` and `src/storage/definition-scope-review.ts` add an
explicit injected-adapter execution pilot: one reserved invocation, bounded original scope/
model/context witnesses, durable validated replies, atomic completion and no-call recovery.
SQLite 20 adds a local table/job kind; generic discovery/portable/resume/baseline paths
exclude it. `startApp` constructs the provider bridge for strict explicit browser POSTs;
`definition-scope-view.ts` defines bounded dated transport contracts and the queue owns
exact-job Stop/serialization. `definition-scope-controls.tsx` requires status-first consent
and explicit ambiguous-ack recovery. No scheduler route or scoped publisher is registered.
See [pilot boundaries](definition-scope-pilot.md).

`definition-review-scope.ts` is a local prototype for app-owned output assignments,
complete project-evidence contexts and strict scope-bound replies/cross-dimensional
concerns. It uses exhaustive dependency validation and the unchanged extracted combined
evidence document. The dedicated injected-adapter pilot now binds its durable witnesses;
provider/browser dispatch is explicit, while scheduling and scoped assessment publication
remain unwired.
See [task binding versus independence](definition-review-scope.md).

`definition-partition-evaluation.ts` and synthetic `definition-partition-fixtures.ts`
support an offline adversarial narrowing experiment, invoked only by tests and
`scripts/qualify-definition-partitions.ts`. They compare rejected citation/category
prototypes with unchanged conservative controls and grant no publication/skip authority.
No scheduler/API/UI consumes these results, and no persisted format/key changes. See
[scope, observed counterexamples and next gate](definition-partition-experiments.md).

`src/core/definition-finding-identity.ts` extracts the unchanged origin schema/hash into
a browser-safe module, with stable dimensions shared through `definition-dimensions.ts`.
`definition-combined-assessment.ts` defines optional strict original-finding provenance
and a separate conservative project-evidence guard; project validation binds it to exact
checks, while model output schemas reject it. Coverage/retention apply the additional
guard only to marked data. SQLite 18 establishes a no-rewrite compatibility boundary;
portable state format 2 is conditional on current/historical provenance, with legacy
format 1 unchanged otherwise. The explicit apply path now adds atomic source re-verification,
assessment/history/implementation-compatibility/Activity receipt writes and a SQLite 19
no-rewrite boundary, with separate browser eligibility and consent.
See [format boundaries](combined-assessment-format.md).

`src/core/definition-combination-review.ts` defines strict immutable local review evidence;
SQLite 17 adds `definition_combination_reviews` without changing project/assessment or
portable formats. `ProjectStore.saveDefinitionCombinationReview` re-verifies the exact
preview under worker/token guards in an immediate transaction and commits one record plus
Activity entry, with idempotent reuse of the first save date. Bounded history/detail
reads in `src/storage/definition-combination-review.ts` and explicit browser ack/save/history
controls retain dated contents without current-assessment, approval or skip authority.
The records are machine-local, not workspace/portable state. See [local reviews](definition-combination-reviews.md).

`src/core/definition-combination-preview.ts` defines a transient exact-content packet;
`src/storage/definition-combination-preview.ts` re-verifies one exact supported joint
job, its original reserved reply owner and selected source publications in a read
transaction. It compares original/current findings under full content/assessment tokens,
never creates an assessment or publication permission. The explicit authenticated
`definition-combination-preview` route and `src/ui/definition-combination-preview.tsx`
expose the complete contents without AI, truncation or automatic reads. SQLite stays 16;
persisted mixed publication remains a separate gate. See [combined preview](definition-combination-preview.md).

Joint checks reuse the existing optional `DiscoveryMeasurement` job metadata, with
request checkpoints before dispatch and zero-request recovery measured separately.
`src/core/definition-joint-usage.ts` validates metadata-only, anonymized bounded reports;
the store selects at most 21 metadata rows/32 KiB per measurement without source/reply
reads. Explicit `definition-joint-usage` and browser load/download controls perform no
writes or inference. Missing old measurements remain unknown; completed reuse never
resets original timings or creates a new job. SQLite stays 16. See [usage evidence](definition-joint-usage.md).

`src/core/definition-joint-view.ts` projects bounded dated local run evidence for the
browser. `DiscoveryQueue.reviewDefinitionCombination` serializes a separate explicit
one-request task with ordinary workers and owns exact-job cancellation; it starts no
follow-up discovery or coordinator work. `definition-joint-start/status/stop` routes
retain token/host/origin/input guards. `src/ui/definition-joint-controls.tsx` requires
exact-combination consent, explicitly loads saved results and polls only an acknowledged
or explicitly loaded live job. No persisted contract changes; SQLite stays 16. See
[browser joint checks](definition-joint-review.md#browser-consent-and-saved-results).

`src/storage/definition-source-inspection.ts` pages at most six locally re-verified
publication certificates inside a read transaction, returning only original identity
metadata. Authenticated `definition-sources`/`definition-origins` inspection routes run
before generic project history projection. `src/ui/definition-source-inspection.tsx`
offers explicit loading/selection/comparison in Overall progress, bound to full content
and revision. There is no inference, automatic fetch, state write, publication or
freshness change; SQLite stays 16. See [source inspection](definition-finding-origins.md#browser-inspection).

`src/core/definition-joint-review.ts` defines exact candidate/context and verdict
contracts; `src/storage/definition-joint-review.ts` verifies sources and local checkpoints.
The explicit `DiscoveryService.reviewDefinitionCombination` task uses one reserved
request with the selected adapter and a dedicated prompt, preserving original findings.
SQLite 16 adds local run evidence and a specialized job kind; completion/recovery
rechecks current content and never publishes mixed assessments. These jobs are not
portable or automatic coordinator work, and cannot become generic discovery-resume
authority. See [joint consistency review](definition-joint-review.md).

`src/core/definition-finding-origin.ts` supplies content-bound original finding identities;
`src/storage/definition-finding-origin.ts` previews explicit dimension/source selections
inside a bounded SQLite read transaction. It re-verifies local publication certificates,
retains each original date/job/evidence key and compares shared whole-area guards under
a distinct inspection-only policy. It neither saves mixed assessments nor claims joint
consistency/narrower independence; coverage and scheduling remain unchanged. This
original slice kept SQLite at 15; subsequent joint checkpoints advance it to 16.
See [per-finding provenance](definition-finding-origins.md).

`src/core/definition-dependencies.ts` compares original finding identities plus shared
whole-area/population guards against a content-bound current view, with inspection-only
authority. `src/core/definition-publication.ts` and `src/storage/definition-publication.ts`
add optional local publication evidence at validated definition-only saves. SQLite 15
adds dispatch/response witnesses and atomically saved certificates; bounded reads
re-verify original snapshots, actual context/result witnesses and complete single/staged
coverage. Older work is never backfilled or repeated solely for certification. No
scheduler, v1 freshness change or skip authority is added. The later read-only browser
inspector exposes certificate metadata without publication authority. See
[publication evidence](definition-publication.md) and [activation gates](definition-dependency-protocol.md).

`src/core/definition-retention.ts` compares complete original review identities and
existing conservative input bases at specification-run boundaries. New local format-1
run receipts bind current start/end snapshots and store bounded dated identity metadata;
the workflow drawer shows original revisions without relabeling today's status.
SQLite 13→14 preserves older receipts unchanged and never backfills missing witnesses.
This changes neither scheduler/freshness rules nor consent and is not finding-level
reuse or a skipped-request certificate. See [compatibility](migrations.md#retained-definition-reviews-in-specification-runs-2026-10-29).

Definition persistence uses `src/core/definition-serialization.ts` to normalize
evidence property order before stamping new reviews without changing the frozen v1
digest. Its ordering-only proof compares exact original raw/parsed digest documents
and reproduces the original key. `src/storage/definition-serialization.ts` applies
SQLite 12→13 with byte-exact current-row backups and key-only repairs, preserving
revisions, immutable history, jobs and execution evidence. Impact/history reads can
project proved original keys without rewriting archives. No finding-level semantic
reuse is implied. See [compatibility](migrations.md#definition-storage-order-compatibility-2026-10-29).

Status: shared engine, browser API/UI, and the first epic/assessment/context loop
implemented under `src/`. See [decisions.md](decisions.md),
[browser-workspace.md](browser-workspace.md), and [terminal-discovery.md](terminal-discovery.md).

## Implemented slice

- `src/core/implementation-revisions.ts` defines a strict, execution-side recovery-only
  revision certificate. Explicit definition-history restoration publishes it atomically
  with the project revision. Plan reuse, frozen-run continuation and legacy code-review
  revision fallback recognize only its current, exact-input contiguous interval; normal
  concurrency checks remain exact. Ordinary revisions end the interval. Original saved
  evidence is never rebased. SQLite migration 9 upgrades execution schema 1→2 with
  transactional backups; portable readers accept v1 and retain v2 certificates without
  exporting local coding sessions. See [compatibility](migrations.md#implementation-reuse-across-assessment-recovery-2026-10-29).

- `src/ui/implementation.tsx` separates the Prepare implementation group (existing
  check/planning/review/settings operations) from Build and verify (explicit coding/
  delivery). No composite worker, new permission, changed freshness gate or migration
  is introduced. Current plans are inspected/reused under existing rules; frozen runs
  retain their scope. Repository inspection on mount remains metadata-only. See
  [compatibility and verification](migrations.md#separate-implementation-preparation-from-builddelivery-2026-10-29).

- `src/ui/processing-settings.tsx` groups existing workflow, browser-wide saved-input
  and project-local maintenance controls without merging storage or authority. Continue
  specification uses existing workflow routes/grants; More actions and Improve
  requirements retain their scoped handlers. Opening disclosures/Settings does not
  dispatch. Inactive preferences stay intact, with existing pauses/leases honored on
  returning to separate settings; see [compatibility](migrations.md#specification-controls-and-processing-permission-grouping-2026-10-29).

- `src/core/processing-policy.ts` and `src/storage/processing-policy.ts` define a
  format-1, machine-local project policy, independently versioned from project revisions
  and workflow/maintenance settings. SQLite 10 adds `processing_policy`; absent rows
  use compatibility mode `legacy`. Manual is a narrowing hold, not a new automatic
  grant. Store changes atomically check project/policy/settings versions and worker
  exclusion; `beginJob` rejects automatic dispatch under Manual within its transaction.
  Queue wake-ups/maintenance honor the hold; explicit saved-input scopes are finite,
  and Manual coordination disarms at its next decision/pause. No portable or evidence
  identity changes. See [migration ledger](migrations.md#project-local-manual-processing-2026-10-29).

  SQLite 12 additionally recognizes explicit `guided` consent in format-1 policy,
  without rewriting compatible old rows or defaulting anyone into it. Guided projects
  new response eligibility into the existing coordinator, holding both independent
  automatic workers at SQL selection and atomic job creation. Selecting it arms no
  worker and grants no allowance; Continue owns the existing bounded authority.
  View-level coordinated enablement does not overwrite the original enabled flag.
  Separate maintenance/disable actions cannot bypass Guided. All actual mode switches
  pause the three workers and advance settings CAS without renewing grants. See
  [processing permissions](processing-permissions.md) and [compatibility](migrations.md#guided-processing-consent-2026-10-29).

- `src/core/workflow-run.ts` and `src/storage/workflow-runs.ts` provide format-1 local
  receipts for each coordinator worker pass. SQLite 11 adds `workflow_runs`, without
  rewriting workflow grants or historical evidence. Claim/start and request reservation/
  allowance CAS are atomic; owned release records ending revision, net record counts
  and outcomes for jobs with reserved attempts. Old runs are not backfilled, and a
  missing ending observation stays incomplete after crashes or lease loss. An exact
  starting-snapshot digest prevents equal-numbered adopted history from fabricating
  the comparison. The indexed latest receipt is read-only in `ProjectWorkflow.view`
  and the queue UI; current follow-through remains separately revision-labelled.
  These reports neither schedule calls nor define freshness/approval/readiness. See
  [compatibility](migrations.md#bounded-specification-run-receipts-2026-10-29).

- `src/core/definition-impact.ts` and `src/storage/definition-impact.ts` implement
  advisory finding-level input comparisons, not new assessment freshness/reuse gates.
  An explicit bounded read verifies one original snapshot and compares citation link
  closures alongside the conservative whole-area context. Unchanged links with
  changed context stay unproven; invalid/missing/bounded provenance stays unknown.
  The strict authenticated `definition-impact` POST runs before general get's lazy
  basis projection to enforce read bounds. `src/ui/definition-impact.tsx` fetches only
  on explicit Compare, binds reports to version/content and keeps dated results
  separate. The browser snapshot coverage cache also checks projected content, not
  just revision, to handle equal-numbered adoption. These view-only tokens never
  change persisted assessment identities or permissions. See [finding impact](definition-finding-impact.md).

- `src/core/follow-through.ts` projects definition review work from existing coverage
  freshness without another scheduler or persisted identity. The coordinator repairs
  outdated existing reviews before new gap discovery; initial baselines retain their
  ordering. Maintenance shares the status projection but not broader consent. The API
  and workflow drawer expose saved/current/outdated areas, reconstructable after restart.
  Existing exact job ledgers own attempts and continuation. See the
  [consolidation plan and remaining mutation gaps](workflow-consolidation.md).
  It also projects pending refinement/plan notices using existing stale-reason and
  planning-current gates. Organization changes retain original assessments under
  original area IDs; archived evidence stays out of current coverage and is never
  copied onto new split areas. No new persisted queue format or permission is added.
  Its saved-outcome projection combines a separately revision-labelled local activity
  count receipt with current pending work. `src/storage/activity.ts` extracts only
  counts from one existing indexed revision entry, bounded by the viewed revision;
  no historical snapshot decoding, source-prose export or new summary state is needed.

- Workflow planning has a questions-only `staged-records-v4` fallback for otherwise
  unsplittable evidence chains. The mandatory exact record union is distributed
  across durable discovery/check batches, with target/original-input pins repeated.
  Every batch is checked before question publication; requirements and extra loads
  are forbidden. The 96,000-character envelope, 8,000-character draft reserve and
  sixteen-batch limit remain. Old model protocols and attempts are not relabelled.
  See [compatibility and verification](migrations.md#questions-only-exact-record-workflow-fallback-2026-10-28).

- Workflow planning uses material-bound CPU receipts and separate successful-context/
  failed-probe caches. Candidate-policy failures checkpoint expensive partition work
  within unfinished groups; bookkeeping-only revisions can retain local progress,
  while evidence, history and selection remain conservative invalidators. SQLite 8
  adds a pool-selection index only. Model-stage identities/attempts and publication
  CAS remain separate. See [planning recovery](migrations.md#resumable-workflow-planning-probes-and-bookkeeping-revisions-2026-10-27).

- `src/core/refinement-stages.ts` / `src/service/refinement-stages.ts`: overflow-only
  exact read/frozen-draft checks for individual requirement refinement. Every request
  pins the full target/support; durable receipts and attempts survive explicit
  task-only queue continuation and portable adoption. Store publication independently
  replays every batch before ordinary proposal authorization; no early publication
  or direct specification edits. The format-2 pair overflow protocol uses the same
  checkpoint engine with separate resolution drafts, exact pair/support/trigger pins,
  source/basis-specific citation rules and original pair publication authorization.
  Format-1 contexts remain unchanged. See [pair compatibility](migrations.md#oversized-pair-resolution-refinement-continuation-2026-10-26).

- `src/core/submission-stages.ts` / `src/service/submission-stages.ts`: overflow-only
  exact read/frozen-draft verification for targeted saved review/scoped-answer
  follow-up. The queue preflights bounded batches before starting; durable ledgers
  retain attempts, receipts and input/material identity across explicit continuation.
  Store publication independently replays all batches before ordinary submission
  authorization and atomic specification updates. Browser polling projects progress;
  portable continuation retains the resumable ledger. General input/research and
  pair-resolution policies remain unchanged; live user-project qualification is open.

- `src/runtime/client.ts` uses `@opencode/client@2.1.4` for OpenCode V2 and exposes
  an app-owned projection for discovery, help, model metadata and execution. It
  translates native permissions, queued prompt/wait/message pagination, terminal
  outcomes, tool content and live events without importing provider credentials.
  `src/runtime/executable.ts` detects V2 CLI binaries and rejects stale V1 overrides.
  The app still owns a private authenticated loopback server and stops only that
  child; it does not attach to, configure or terminate the desktop/shared service.

- `src/service/planning-context.ts` / `planning-stages.ts`: lossless bounded planning
  contexts and exact staged read/check fallback for mandatory implementation evidence.
  Versioned ledgers in the existing planning envelope preserve accepted requests and
  spent attempts through SQLite/portable continuation. Packages publish only after
  all stages and still require human planning approval; see
  [large planning contexts](implementation-workspace.md#large-planning-contexts-and-exact-stage-continuation-2026-10-25).

- `src/core/workflow.ts`, `src/storage/workflow.ts`, `src/service/workflow.ts`:
  coordinator over existing discovery/queue publication paths, separate settings and
  scheduler CAS, worker exclusion, shared pre-dispatch accounting, provenance reuse
  and immutable readiness receipts. Schema 7 adds local metadata only; existing
  assessment/context identities remain. API and `src/ui/workflow-controls.tsx`
  expose settings and an operational decision inbox. See
  [coordinated workflow](coordinated-workflow.md).

- `src/core/readiness-questions.ts`: additive versioned task/context contract for
  questions-only clarification of current unresolved definition dimensions. The
  coordinator shares its allowance/lease; runtime prompts and the storage publication
  boundary forbid edits or assessment upgrades. Original findings and exact evidence
  remain in saved jobs; answers use the existing input and definition-refresh paths.
  Explicit manual format-2 tasks inspect a whole area's findings or a current stopped
  review for actual human choices, rather than treating each partial category as a
  correction task. The queue/API offer a questions-only path to
  Design, reusing current old/new receipts and preserving source-blocker provenance.
  Oversized manual tasks use `src/core/readiness-stages.ts` for exact mandatory-record
  batching, bounded drafts, cross-batch evidence loading, all-batch pruning and
  publication replay. `src/service/readiness-stages.ts` saves accepted steps and
  pre-dispatch attempts through the store and enforces finite per-request bounds.
  Ordinary preparation runs continuously; definition reviews queue it automatically.
  Interrupted work resumes only on explicit action. Coordinated budgets stay bounded.
  Browser snapshots carry derived progress, not the
  full receipt ledger; portable continuation retains the exact resumable ledger.
  Additive task format 3 binds saved-response terminal verdicts to questions-only
  triage, with original-job replay at dispatch/publication. A concrete answer to the
  published question permits a new submission plan with explicit reconciliation
  provenance; rejected ledgers remain immutable. See
  [saved-response recovery](migrations.md#saved-response-conflict-questions-and-explicit-answer-recovery-2026-10-28).
  A versioned `submissionWork.draftRepair` boundary additionally allows a completed
  no-question result to trigger one corrective draft review: replay retains all old
  reads/rejections, checks the old failure evidence and then re-verifies every batch.
  Dispatch/publication validate source provenance independently; no AI finding becomes
  a human decision. See [corrective review](migrations.md#no-question-clarification-to-bounded-corrective-draft-review-2026-10-28).

- `src/core/maintenance.ts`, `src/storage/maintenance.ts`, `src/service/queue.ts`:
  opt-in decision-triggered area scheduling with durable CAS dispatch receipts,
  separate settings concurrency, debounce and bounded automatic assessment bursts.
  Scheduling projections never certify coverage. Existing assessment validation and
  owned job leases remain the publication boundary; restart requires explicit consent.
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
  Optional boundary-versioned cross-batch evidence requests rehydrate exact planned
  records for indispensable decision relationships, retaining original request hashes
  and spent attempts; they never invoke external tools or change human decisions.
  Marked continuation splits can repack unfinished base records while pinning the
  entire supplemental evidence group to every child; replay retains the original
  pre-split retrieval context and all accepted child contexts independently.
  Boundary-versioned linked follow-ups retain pre-request split counts and evidence
  lineage, using existing spent-attempt limits. Manual upgrade of an old one-request
  block may load explicitly named, directly linked saved records without treating
  their accepted/cleanup labels as proof of human approval.
  `definition-budget.ts` separates valid same-step evidence responses from failed/
  unfinished dispatches without rewriting raw history. Versioned allowance boundaries
  preserve replay and legacy recovery accounting. Refresh owns revision/area/job-bound
  extra-request consent and continues ordinary remaining work after a successful
  extension; automatic maintenance cannot grant that extension.
  `definition-wire.ts` adds reversible plain-review/cleanup envelope encoding only
  when the full encoded request is smaller. `exactWirePolicy` preserves old hashes
  at a safe stage boundary; exact-load labels resolve against their original request
  and persist separately from raw responses. Verification is never skipped. Manual
  continuous refresh defers its workspace publication until finish/pause while every
  SQLite checkpoint commits immediately; local phase timings and cumulative action
  request counts distinguish model work from preparation/export. See
  [efficiency compatibility](migrations.md#definition-exact-wire-evidence-and-continuous-publication-2026-10-27).
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

The finite refinement sweep has no shared whole-sweep allowance or periodic consent
pause. Individual staged wording tasks can finish after all exact reads when the
final explicit validated draft proposes no changes; no empty-proposal verification
pass is dispatched. Actual proposals and pair outcomes still require all checks.
Publication replays original receipts and checks exact coverage/current material;
blocked work cannot take the shortcut. Saved hashes/formats remain compatible.
New per-job request counters exclude inherited receipts; historical logs disclose
receipt-derived lower bounds. Volatile sweep progress separates requests, suggestions
and unchanged requirements. See [compatibility](migrations.md#no-change-refinement-completion-and-request-visibility-2026-10-27).

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
