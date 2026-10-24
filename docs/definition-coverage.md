# Definition coverage and discovery status

Implemented 2026-10-23 for RW-019. Definition coverage estimates recorded product
decisions; it is not readiness, code completeness, or verified delivery to main.

## Refresh the overall view

Open **Overall progress → Refresh definition coverage**. Expand Definition coverage
for per-area refresh actions, explanations and linked evidence. The refresh:

- Assesses complete current areas separately, with project/dependency guardrails and
  linked evidence. It cannot propose questions, edit requirements, reorganize areas,
  change global interpretation or authorize coding.
- Requires saved responses to be processed first. It never processes those responses
  or starts gap discovery implicitly. Research is disabled.
- Reuses current assessments without model calls. Unassessed/outdated areas get a
  bounded assessment covering all nine dimensions; large areas use exact batches. Missing evidence
  remains unknown; proposals/delegation/research do not establish human decisions.
- Runs at most ten attempted areas/fifteen minutes per action, using ordinary
  five-minute per-request bounds. Stop retains completed areas. Explicit refresh
  continues unfinished areas; startup/reload never initiates calls.
- When a complete area exceeds 96k, partitions the complete prepared evidence set
  into exact-record batches, never a sample or a truncated human constraint. Every
  batch is read to accumulate a bounded nine-dimension draft, then every batch
  checks that draft before publication. Verification can downgrade findings or raise
  importance, never add positive coverage. Indispensable unresolved relationships
  block rather than being guessed. See the staged protocol below.

Definition freshness now compares versioned SHA-256 identities of relevant saved
inputs, not the optimistic-concurrency revision counter. Inputs conservatively
include the area, project-wide records, transitive declared dependencies, linked
evidence, superseding sources and explicitly cited assessment evidence. Project-wide
assessments also track the active epic map. Relevant changed/new/removed records
invalidate coverage; model selection, another assessment, an empty discovery pass,
and unrelated area changes alone do not. This is bounded declared dependency/record
tracking, not inferred exhaustive impact analysis. See [upgrade behavior](migrations.md#definition-coverage-freshness-and-near-limit-staging-2026-10-23).
When completed areas are current but other areas have no assessment, the aggregate
label is **Assessment incomplete**, not **Assessment outdated**. Old evidence is
labelled outdated only when it actually needs rechecking. Per-area states remain
current/outdated/not assessed; partial batch work cannot make one current.

## Finding earlier failures (2026-10-24)

Open **Overall progress → View assessment history**, or **Logs → View assessment
history**. Saved assessment attempts are grouped by area, with area/unfinished-only
filters and older-page navigation. Failed responses, evidence blockers and pauses
have distinct labels. Each attempt identifies whether it is the latest saved task
for that area or earlier history; this does not establish current evidence freshness
or that an earlier failure is resolved. Expand **Failure details** for its original
saved diagnostic, or use its **View logs** link. A newer paused task no longer hides
older response errors. Opening any of these views starts no model calls.

The authenticated read-only `GET /api/projects/:id/definition-history` endpoint
selects at most 25 summaries per page in SQLite before returning them, rather than
decoding full model results/receipts. It reaches beyond the workspace's 20 recent
jobs. No account/model/session fields, prompts, answers or response bodies are
included; error prose can still contain project text or paths. Display redacts
credential patterns and escapes markup. Each diagnostic field has a disclosed
16,000-character display bound; original saved text is unchanged. Missing historical
counts/errors stay unknown. The separate metadata-only diagnostics export is
unchanged and still excludes error prose.

The strengthened recovery regression uses a pre-compact ledger and the reported
98,959-character blocker wording: four exact saved responses survive repeated
SQLite reopen, interruption during repacking, final continuation and portable
replay without repeated completed calls. Earlier failed jobs remain historical and
the finished continuation is identified as the area's latest attempt. This verifies
the existing recovery mechanism with deterministic evidence, not the user's actual
saved project. Genuine indivisible-record/attempt/stage limits remain blockers.

Verification on Windows Node 22.23.4: type check, UI build, 169 pretests and 652 main
tests passed. The focused `npm run test:browser:definition-history` passed older
failures behind a newer pause, area filtering, redacted exact errors, targeted Logs,
paging, failed-history-request retry, reload and mobile width. The aggregate browser
suite passed model selection, then stopped at a missing **Project map** tab in
`src/web/browser-check.ts:706` after workspace consolidation; subsequent portable
and specification runners did not execute. The bundle-size warning remains. No live
inference, personal-project edits, retry resets or schema/data migrations were used.

## Explainable progress and oversized-draft recovery (2026-10-23)

### Smaller collection responses and deadline scheduling

New staged assessments use an assessment-only first response, followed by
`definitionUpdate` responses containing only changed dimensions. The engine retains
omitted dimensions, confidence and explanation exactly; changed dimensions must
retain still-supported earlier findings and citations. Complete drafts are validated
after each update; unknown citations, duplicate dimensions and unauthorized fields
are rejected. Every batch is still read and verified before publication. This reduces
repeated output, not the evidence reviewed, verification requirements or request count.
It is not delta-only evidence review and does not promise a live speedup.

Explicit global/per-area refreshes now share in-memory request-duration estimates.
Initial estimates are 90 seconds for reading and 20 seconds for verification;
completed requests update the corresponding estimate. Admission reserves the estimate
plus 20% and five seconds (bounded by the request timeout). When less time remains,
the action pauses *before* dispatch with `refresh-time-reserve`, preserving completed
stages and spending no new attempt. Estimates are not guarantees: an unexpectedly
slow request can still hit the unchanged shared fifteen-minute deadline. Single-context
areas use the reading estimate. Estimates reset on the next explicit refresh; restart
does not initiate work. Coordinated/maintenance allowances are unchanged.

Existing saved partitions, responses, hashes, provenance and spent attempts survive.
Legacy collection contracts switch only at an unattempted unfinished stage after
replay validation; completed work needs no model calls. Already-attempted stages
keep their contract and allowance. See [upgrade behavior](migrations.md#compact-definition-responses-and-deadline-admission-2026-10-23).

Verification on Windows Node 22.23.3: type checking, UI build, all 155 pretests and
650 main tests, and focused epic-review/coordinated-workflow browser checks passed.
New checks cover compact-response validation, unchanged-dimension preservation,
legacy-to-compact SQLite reopen/replay, portable continuation, unsupported future
policy rejection without overwrite, deadline admission without spent attempts and
explicit resume without repeating saved stages. The aggregate browser suite still
stops at the known missing **Approve resolution** control (`browser-check.ts:1358`);
its subsequent portable/specification runners did not execute. Existing bundle-size
and test-timer warnings remain. No live calls or personal-project data edits were
performed; live latency/quality and the reported failed stage remain unqualified.

Definition processing now labels the area and its position in the requested refresh
scope. Preparation messages distinguish local evidence packaging from inference;
staged requests show read versus verification, original batch, saved/total stages,
record-type counts and exact encoded size. Both single-context and staged requests
emit a ten-second elapsed-request heartbeat while waiting for the model. This is
elapsed time, not a predicted finish time or access to model reasoning.

The progress panel shows measured local preparation and completed request timings
for the current run, and expandable evidence previews (25 records at a time).
Preview shortening affects display only, never assessment evidence. Counts and titles
explain the included area, linked, project-wide and declared-dependency evidence;
they do not establish that every cross-area relationship has been checked.

An evidence batch plus a growing complete draft can exceed 96,000 characters even
after lossless encoding (including the reported 98,959-character failure). Instead
of immediately blocking, the first unfinished step can now split at exact record
boundaries. Collection and verification can subdivide independently; all original
evidence must still be collected and checked before publication. Earlier requests,
responses and original batch partitions remain byte-identical and reusable. Stage
totals can increase, up to 64; existing per-action request/time allowances do not.
An indivisible record plus findings, or the subdivision limit, still blocks explicitly.
No findings are summarized away and no partial score is published.

Existing blocked checkpoints upgrade lazily on explicit Refresh/Resume, after their
saved receipts are replay-validated. No reset, automatic calls, or repeated completed
calls are needed. See the [migration ledger](migrations.md#adaptive-definition-subdivision-and-progress-2026-10-23).

Local batch preparation uses measured growing-prefix probes and boundary refinement
rather than rendering once per record, avoids rebuilding linked-record closures just
to find dependency areas, and reuses serialized wire lengths within each encoding
pass. A deterministic 128-note test checks reduced probe count and exact evidence
preservation. Live model speedups and delta-only assessment are not established;
sequential collection/verification remains necessary under this protocol.

Verification on Windows Node 22.23.3: type checking, UI build, `npm test` (143 pretests
and 650 main tests), and the focused epic-review browser runner passed. Tests cover
four saved legacy calls through repeated SQLite reopen, lossless recovery and portable
replay without completed-call repetition, indivisible blocking, spent attempts,
heartbeat cleanup, evidence inspection without inference, Stop/Resume and mobile
width. These are deterministic fixtures, not the user's database or live inference.
The aggregate `npm run test:browser` was also run and still stops at the pre-existing
missing **Approve resolution** control (`src/web/browser-check.ts:1353`); its later
portable/specification runners did not execute in that command. The existing UI
bundle-size warning remains. The aggregate browser suite is not claimed passing.

## Discovery is a separate ledger

The progress dialog also shows the latest available workflow discovery report,
separately from definition coverage. Reports explicitly distinguish reviewed,
pending, waiting for decisions and evidence-blocked packages. Examined-prefix counts
are not whole-project totals. Old reports retain their saved revision/scope and are
not silently presented as current completeness. Recent browser job history is bounded;
absence of a report does not establish that no discovery has run.

No new questions may mean no consequential gaps were found in a reviewed package,
unpublished staged drafts are still being checked, or other packages could not be
reviewed. Blocked packages are never counted as reviewed. **Discover missing
decisions** still cannot refresh whole-area definition assessments.

## Large-area assessment and continuation (follow-up, 2026-10-23)

`exact-batches-v1` fixes the reported 145,769 / 96,000 whole-area dead end without
raising the input cap. Exact record links may cross batches; an unread link is not
authority to cite its contents. Human evidence stays exact across the complete
partition. Partial findings remain unpublished; earlier assessments stay dated and
outdated until all read/verification stages finish. Independent batch checks cannot
prove all cross-batch relationships: saved assessments explicitly identify this
method and cap confidence at medium. Missing decisions remain unknown/partial or
needs-review, not artificially defined.

There are at most sixteen original batches / 32 original stages (up to 64 exact
subdivided stages under the continuation policy above), a 12k accumulated assessment draft
target/reserve, three spent attempts per unfinished stage, and 32 requests per explicit staged
area action within the existing fifteen-minute refresh window. Each request also
has a five-minute timeout. Oversized individual records, over-sixteen-batch areas,
missing records and model-identified indispensable missing evidence stay explicit
**Evidence blocked** outcomes, not successful reviews or silent truncation.

Valid collection/verdict responses are now saved before preparing the next request;
raw drafts over 12k are not discarded solely for their size. Subsequent requests
carry only the assessment fields, with repeated explanations/citations shared
losslessly. Complete schema-validated responses (including ignored wrapper fields)
remain in receipts. Explanations, statuses, importance and citations are not
summarized, truncated or rewritten to fit. The actual encoded evidence-plus-draft
request still cannot exceed 96,000 characters. The adaptive continuation above now
tries exact-record subdivision first. If that cannot fit, the assessment blocks
with all completed responses retained; unchanged Resume makes no repeated call.
This removes an artificial raw-size failure, not every possible size limit.

Existing partitions and receipt hashes are preserved. An optional versioned draft
policy starts at the first unfinished stage only after replaying older receipts
under their original rules. Original saved jobs, provenance and attempts remain
unchanged; completed old ledgers can still publish without inference. Historical
responses rejected before this fix were never checkpointed and cannot be restored
from metadata-only diagnostics. The unfinished stage may still require a call.

The historical 209,523 / 96,000 single-context failure is distinct: the current
definition path catches that planning overflow and switches to exact batches. The
latest supplied export reports this area's completed five-batch / ten-stage ledger,
with seven new calls after three previously saved stages. It does not establish
that every other area's earlier failure is resolved or that this draft fix has
been exercised on the user's saved project.

Draft follow-up checks: type check, 103 pretests + 647 main tests, UI build and
focused workflow/specification browser runners passed. Portable browser checks
passed on isolated rerun after a duplicate-button locator failure. The full browser
suite was not rerun for this follow-up; its prior **Approve resolution** failure
remains unresolved. No live model calls or personal database edits were made.

**Refresh definition coverage** or **Resume processing** after a paused/cancelled/failed
assessment continues saved stages. Ordinary Discover missing decisions remains gap
discovery. Compatible saved partitions/attempts take priority even if a newer local
preparation could fit a single context. Restart never initiates calls. A completed
final checkpoint can publish after recovery without repeating inference. Relevant
input changes preserve earlier work as history rather than publishing it as current.
Portable continuation retains current partitions, exact receipt identities and
original stage/model provenance, without account credentials or runtime sessions.
The migration ledger describes format checks and recovery.
Resume uses the saved assessment area unless the feature filter selects another;
the drawer labels that scope explicitly. To continue all other areas, use the global
**Refresh definition coverage** action; already-current areas need no new calls.

### Why a later area can pause after only a few minutes

The fifteen-minute window is shared across the whole **Refresh definition coverage**
action, not restarted for each area. Earlier completed or failed areas consume that
window. A later area may therefore pause during its second request even though its
own job has run for only two minutes and its five-minute request timeout was not
reached. Completed stages remain saved; unfinished in-flight attempts remain spent.

New runs record separate causes for that shared deadline, the area's own deadline,
an individual request timeout, explicit Stop, app shutdown and unspecified external
interruption. Time limits display **Paused—progress saved**, not an apparent user
cancellation; Stop displays **Stopped—progress saved**. The drawer says definition
processing is paused, not discovery. The same bounded Resume/Refresh actions continue
unfinished work; there are no automatic repeated model calls or larger allowances.

Older cancelled runs did not record which cause occurred. Their exact saved job and
checks are preserved; the UI calls the cause unknown rather than guessing, and new
diagnostics export `interruptionCause: null`. A supplied 142-second cancelled area
with a 63-second saved first stage and a 78-second interrupted second request is not
evidence of a five-minute request timeout. A shared deadline is possible, but the old
export alone cannot distinguish it from Stop or another external cancellation.

Interruption follow-up verification: type check/UI build, 99 pretests and 647 main
tests passed on Windows Node 22.23.3. Focused workflow browser checks exercise Stop
and Resume without replaying the saved first stage; portable/specification browser
runners also passed separately. The full browser suite remains blocked at the known
**Approve resolution** assertion. No live model calls or changes to the user's
saved project database.

Follow-up verification (2026-10-23, Windows Node 22.23.3): type check/UI build,
91 pretests and 647 main tests passed. Portable and specification browser runners
also passed separately. The focused workflow browser runner includes
the new large-area assessment, a saved stage through reload, no premature coverage,
final publication and mobile layout. The full browser command still reaches the
previously documented **Approve resolution** failure at `src/web/browser-check.ts:1352`;
the aggregate suite is not claimed passing. No live inference or personal-project
database migration was performed.

## Near-limit exact evidence

New otherwise blocked indivisible workflow leaves can try
`staged-current-spec-v3` after existing staged policies fail. This combines the
current-specification projection with an **8,000-character accumulated draft
reserve**, rather than v2's 12,000. It leaves more room for exact human constraints
under the unchanged 96,000-character input ceiling. The model is told to return
fewer concise proposals; existing drafts and evidence are never truncated to fit.
Over-reserve drafts fail explicitly. Generated background projection has the same
conservative unique-answer/supersession rules as ordinary current-spec contexts.

This is a proposal-capacity tradeoff, not a provider-context increase or a guarantee
of useful gaps. All discovery/validation batches must finish before publication.
Compatible older stages reconstruct under their original policy, reserve and spent
attempts. Original reports remain history. Local size/batch-limit CPU receipts can
be reconsidered once under v3 without replaying model work or clearing true saved
model/attempt blockers. See [workflow review](epic-workflow-review.md).

Deterministic checks cover refresh scope/preservation, unrelated/relevant changes,
unknown dimensions, malformed/unseen citations, cancellation/staleness, indivisible
oversized no-call outcomes, original-snapshot legacy upgrade/reopen, API bounds and unprocessed
input rejection. Synthetic staged regressions reproduce the supplied 97,489–99,403
character failure totals, exercise the reduced draft cap and retain checkpoints
through SQLite/portable reopen. These are not the user's actual evidence chains or
live model qualification. Browser verification covers refresh, no-call reuse, reload,
separate blocker status and mobile layout in the focused workflow runner.

Initial-slice verification (2026-10-23, Windows Node 22.23.3): type check, UI build, `npm test`
(79 pretests / 646 main tests), focused workflow browser checks, portable browser
checks and specification browser checks passed. The full browser command was run;
after updating its progress-section count for the new sections, it reaches the
previously documented missing **Approve resolution** control at
`src/web/browser-check.ts:1352` and stops. The aggregate browser suite is not passing.
The existing >500 kB UI bundle warning remains. No live inference, personal-project
database changes or packaged Electron verification were performed.
