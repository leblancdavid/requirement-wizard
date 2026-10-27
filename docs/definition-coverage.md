# Definition coverage and discovery status

Implemented 2026-10-23 for RW-019. Definition coverage estimates recorded product
decisions; it is not readiness, code completeness, or verified delivery to main.

## Refresh the overall view

### Refresh efficiency and evidence references (2026-10-27)

Continuous refresh remains the default: no new whole-action cap or periodic Continue
confirmation. Every evidence batch is still read and every final assessment checked;
an empty verification response is a passed check, not permission to skip that check.

Staged requests can now losslessly encode plain review and cleanup snapshots before
ordinary text/identifier/table sharing. Historical wording, full embedded originals
and human addenda remain exact. The smaller complete encoding wins; records are not
summarized or dropped. Request-local evidence labels are also accepted for exact loads,
not only citations. A request may include already loaded records alongside new unread
evidence; invalid references and duplicate aliases still block with bounded count
diagnostics. This fixes an app-side canonical-only mismatch, but does not establish
the exact cause of earlier rejected live responses that were not retained.

**Processing & queue** shows the refresh's area position, completed/reused/unfinished
areas and cumulative requests, followed by current evidence-stage progress. Requests
use the selected model and allowance as before. Diagnostics add local preparation,
replay, context, checkpoint, validation and publication timings; missing older timings
are unknown, not zero. Model request time still includes provider/runtime work.
The retained queue summary separately times the final workspace-publication check;
that volatile action timing is not retroactively added to older per-job diagnostics.

Portable folder export is coalesced until the continuous action finishes or pauses,
rather than rebuilding the full shared continuation after every area. Results and
request checkpoints remain immediately durable in SQLite. **Pause assessment before
committing/sharing the latest `.reqwizit/` state**; the folder may lag during a run.
Failure/shutdown also release publication, and dirty exports recover after interruption
without inference. Independent workspaces are unaffected. Saved reads, evidence loads,
attempts and completed assessment identities survive explicit continuation/upgrades;
see [compatibility](migrations.md#definition-exact-wire-evidence-and-continuous-publication-2026-10-27).

Read-only profiling of one saved personal-project assessment measured approximately
264 ms for nine-stage replay and 329 ms for local planning, not the entire roughly
15-second non-request interval seen in many jobs. A subsequent read-only project-wide
encoding probe still needed four batches: compression offers modest context savings
there, not an established halving of model calls. Coalesced export eliminates repeated
between-area publication in deterministic connected-workspace checks; actual-project
wall-clock/model quality improvements remain unqualified. No live model requests or
personal-project writes were performed.

Verification: **975 tests passed** (`npm test`: 310 pretests + 665 main), type check,
UI build and both focused continuous-definition / refresh-allowance browser runners
passed. Checks cover independent exact snapshot decoding, label resolution/raw receipt
retention, rejected/forged references, safe legacy stage upgrades, repeated reopening,
portable continuation, immediate SQLite durability, coalesced export on success/failure/
Stop, interruption recovery, independent workspaces, local timing privacy and mobile
refresh progress. The aggregate browser runner passed layout/model selection, then
stopped at the previously documented obsolete **Project map** locator
(`src/web/browser-check.ts:706`); subsequent aggregate checks were not reached.
Desktop rebuilding and actual-project/live-provider continuation were not performed.

### Refresh resumes saved work and owns extra-usage confirmation (2026-10-25)

Use **Refresh definition coverage** to continue saved reviews. Successful evidence
gathering is no longer counted as a failed attempt: each step permits up to eight
saved evidence requests separately from three failed/unfinished calls. Both consume
AI usage, and a 12-dispatch hard ceiling, 96k context and 64-step limit still apply.
The historical calls are retained, not reset. For example, nine saved steps and
three recorded calls including one successful evidence request can continue with
call four without a separate recovery action or repeated completed calls.

After three genuinely failed/unfinished calls, Refresh asks inline before allowing
**one additional request** for each listed area. **Continue refresh** confirms that
usage; **Cancel** and reload start nothing. If the extra request saves the step,
remaining normal steps and areas continue in the same refresh. Repeated refresh
never grants another extension to that exhausted step. Genuine evidence conflicts,
unfitting records and stale inputs are not bypassed. Automatic maintenance retains
its own action limits and cannot authorize extra requests.

Restart/rebuild the updated app, then click Refresh normally. Original saved jobs,
receipts, evidence and valid completed assessments stay intact. Old recovery grants
remain accounted for conservatively. The old single-request recovery API is kept for
compatibility, but no separate **Recover assessment** UI navigation is needed. See
[upgrade and crash recovery](migrations.md#refresh-owned-definition-allowances-2026-10-25).

Verification: type check, `npm test` (including all 652 main tests), 97 final focused
definition/diagnostic tests, UI build and the focused refresh-allowance browser check
passed. Workspace layout and model-selection browser checks passed; portable and
specification browser checks passed separately. `npm run test:browser` still stops
at the pre-existing missing **Project map** tab assertion in `browser-check.ts:706`.
That unrelated legacy selector was not changed. Existing bundle-size/React-key
warnings remain. No live provider call or personal-project write/recovery was run.

### Exact earlier decisions across batches (2026-10-25)

**Linked-decision follow-up:** the reviewer may now request further exact linked
records when the first evidence request reveals another indispensable human decision.
Each request must add new saved records and consumes the existing attempt allowance;
this is not an unlimited search or a new approval. Accepted status or a cleanup note
alone does not prove a human approved the behavior. Body-collision approval must not
be extended to a separate hurt-detection region without its exact decision evidence.

For an older **“permitted evidence request has already been used”** blocker, restart/
rebuild the updated app and explicitly **Refresh definition coverage**. If that saved
diagnostic names exact record IDs directly linked by supplied records, the app loads
those records locally and preserves the old block as history. It does not infer their
meaning. The [current Refresh allowance flow](#refresh-resumes-saved-work-and-owns-extra-usage-confirmation-2026-10-25)
separates saved evidence requests from failed calls and asks inline only if an extra
request is needed.
Unsupported/missing/unlinked evidence remains blocked. See
[compatibility and limits](migrations.md#linked-exact-evidence-follow-ups-2026-10-25).

**Supplemental overflow follow-up:** if the requested evidence plus the current batch
exceeds 96k (for example 106,445 characters), continuation now locally subdivides the
unfinished batch while keeping the full requested evidence beside each smaller piece.
It does not repeat the evidence request, truncate decisions, or restart completed
steps. Restart/rebuild the updated backend/desktop, then explicitly **Refresh definition
coverage**. Saved overflow jobs remain historical; the next run reuses their ledger.
The first smaller step retains its spent attempts. If even one base record plus the
complete requested group and assessment cannot fit, or the 64-stage bound is reached,
the review still blocks safely. See [upgrade/recovery](migrations.md#exact-supplemental-evidence-repacking-2026-10-25).

An accumulated assessment can refer to earlier constraints whose exact human text
is in another batch. The reviewer can now request up to twenty saved records by
canonical ID per request before deciding whether a later approval replaces or
limits those constraints. The next request includes the full exact records and the
current batch, not just the earlier assessment's summary. No new product approval
is inferred, and no questions, external tools or requirement edits are authorized.

Requests consume the existing stage/action allowance; they do not reset attempts.
Each combined request must fit 96k after lossless encoding, using smaller base-record
partitions where possible, or remain blocked without truncation/publication.
Completed read/check steps are never repeated. A genuinely unresolved relationship
can still block after the exact records are supplied.

Restart the updated backend (rebuild/relaunch desktop if applicable), then explicitly
choose **Refresh definition coverage**. A legacy block describing exact earlier
evidence not supplied in this/another batch can be superseded once when retained
citations identify other planned records. The old diagnostic, receipts and spent
attempts stay saved. Automatic/bounded maintenance does not clear legacy blockers;
already-upgraded blockers do not acquire another retry on unchanged refresh. Exhausted
failed attempts need the additional-request confirmation within Refresh.

See [compatibility and recovery](migrations.md#cross-batch-exact-definition-evidence-2026-10-25).
Deterministic tests cover legacy continuation, exact text, saved attempts, SQLite
reopening, portable replay, malformed references, overflow, cancellation and stale
results. Live model quality and recovery of the reported personal project remain
unverified; no personal data or model allowance was used for these checks.
Earlier backend-only verification including the linked-decision follow-up: `npm run check`,
`npm test` (including all 652 main tests), 93 focused definition/diagnostic tests,
`npm run build:ui` and `git diff --check` passed. The existing UI bundle-size warning
remains. Browser checks were not rerun for this backend/protocol change.

### Accumulated explanation field limit (2026-10-25)

A staged `definitionUpdate.checks[…].explanation` could exceed the ordinary
4,000-character field limit as findings accumulated, even when the full request
was below 96k. Compact definition collection and stored accumulated checks now
allow longer explanations, up to the 96k request ceiling per check. Ordinary
discovery and verification response limits are unchanged. Explanations still target
concise wording; every complete evidence-plus-draft request must independently fit
96k, or block without truncating evidence/findings or publishing partial coverage.

Restart the updated backend (rebuild/relaunch desktop if applicable), then explicitly
refresh/resume. Seven saved steps, for example, stay saved; the rejected response
does not replace them. Rejected output was not saved, so continuation needs a new
request for that unfinished step and retains its already-spent attempt. Exhausted
stages still require explicit extra-usage confirmation within Refresh, not an allowance reset.
See [upgrade details](migrations.md#accumulated-definition-explanation-bounds-2026-10-25).

Verification: type check, `npm test` (including all 652 main tests), 69 focused staged/discovery tests and diff whitespace
check passed. Tests preserve seven legacy receipts, spent attempts and verbatim
long explanations across repeated SQLite reopen and portable replay, and retain
the independent field/context bounds. No live model request or personal-project
recovery was run; browser checks were not rerun for this backend/schema change.

### Collection citation-limit blocker (2026-10-25)

Fixed contradictory collection instructions requiring retention of every earlier
citation while limiting each response to 20 per dimension. Changed compact checks
now send citation additions; the engine retains and deduplicates all earlier
citations, up to the existing 1,280 accumulated limit. Explanations still retain
supported earlier findings. The response limit remains 20 additions per dimension.
All exact batches must still be verified before coverage can be published.

After restarting the updated backend (or rebuilding/relaunching desktop), explicitly
choose **Refresh definition coverage** or **Resume this assessment**. The recognized
saved 20-citation protocol blocker can then be superseded without replaying saved
steps or resetting spent attempts. Other evidence/attempt/context blockers stay
blocked. See [compatibility details](migrations.md#additive-definition-collection-citations-2026-10-25).

If Logs says **0 model request attempts this run**, the run did not receive a new
model rejection: it stopped locally with retained evidence. Saved steps can be reused
from earlier runs. Selected-task logs are not necessarily the latest run; use
**Show all logs**, clear filters, and **Latest saved tasks** when on an older page.
The newest dated task in the current view is identified separately from live status.

Verification: type check, `npm test`, 61 final focused staged/log tests and the
focused unified-log browser check/UI build passed, including latest-task identity and zero-request
blocker wording. No personal-project recovery or live model call was run. Existing
UI bundle-size warnings remain.

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
- Continues through all selected pending areas until finished or paused, without a
  shared fifteen-minute, ten-area or per-area action-request cutoff. Each request
  still has a five-minute timeout. Pause retains completed checks; explicit refresh
  continues unfinished work. Startup/reload never initiates calls.
- When a complete area exceeds 96k, partitions the complete prepared evidence set
  into exact-record batches, never a sample or a truncated human constraint. Every
  batch is read to accumulate a bounded nine-dimension draft, then every batch
  checks that draft before publication. Verification can downgrade findings or raise
  importance, never add positive coverage. Indispensable unresolved relationships
  block rather than being guessed. See the staged protocol below.

### Recover a review that exhausted its attempts (2026-10-25)

The earlier standalone recovery UI is superseded by the
[Refresh-owned allowance flow](#refresh-resumes-saved-work-and-owns-extra-usage-confirmation-2026-10-25).
Refresh now separates evidence gathering from failed calls and requests extra-usage
consent inline only when needed, then continues remaining normal work automatically.
Only one extra request is available per genuinely exhausted step. Saved calls and
checks remain intact, and real evidence/context blockers remain blockers. The older
single-request recovery API remains compatible for existing clients; it does not
silently authorize further work.
See [compatibility and crash handling](migrations.md#explicit-exhausted-definition-stage-recovery-2026-10-25).

Earlier verification: type check, `npm test` (184 pretests and 652 main tests), final focused
staged tests (50, including an additional pre-dispatch crash/future-ledger check),
UI build and focused recovery browser checks passed. Aggregate browser checks passed
workspace layout and model selection, then stopped at the existing missing
**Project map** tab assertion in `browser-check.ts:706`; later runners did not run.
Existing bundle-size warnings remain. No live inference or personal-project writes
were made; successful recovery of the reported project is not yet verified.

### Accumulated verification citations (2026-10-24)

Fixed an app-side failure where valid verification responses merged more than 20
distinct citations into a check, then failed the model-response limit on the merged
result. Each model response remains capped at 20 citations per check; engine-built
results and stored assessments allow up to 1,280, retaining evidence rather than
truncating it. All exact stages and reference checks still precede publication.

After restarting the updated backend, explicitly resume/refresh the assessment.
Compatible saved stages are reused and spent attempts remain spent. A regression
reproduces four batches, seven saved stages and two spent attempts: after SQLite
reopen, only final verification runs, is recorded as attempt three, and publishes
the merged citations. No personal-project recovery or live model call has been run.
See [compatibility details](migrations.md#accumulated-definition-citations-2026-10-24).

Verification: type check, all 177 pretests and 652 main tests, UI build, focused
continuous-refresh/history browser checks and `git diff --check` passed. The broader
browser suite was not rerun for this schema fix; its previously reported stale
**Project map** assertions remain unresolved. Existing bundle-size warnings remain.

### Citation failure details (2026-10-24)

New invalid-citation failures name the check/dimension and citation position,
distinguish a missing record from an existing record outside allowed detailed
evidence, and identify collection/verification phase and batch for staged reviews.
Counts cover all rejected citations; at most four examples are shown. UUIDs are
shown verbatim; non-UUID model values use a short SHA-256 fingerprint so arbitrary
private response text is not copied into errors. These details appear through the
existing Failure details/task diagnostic views after restarting the updated backend.
Older failures cannot be expanded retrospectively: rejected responses were not saved.
No automatic retries, extra attempts or broader citation authority are introduced.

Verification: type check, 179 pretests, 652 main tests and diff whitespace check
passed. Tests exercise saved first-batch failures through SQLite reopen, verification
scope errors, bounded/private malformed values and preservation of decisions,
receipts and spent attempts. No live calls or personal-project retries were made;
browser checks were not rerun for this backend-only diagnostic change.

### Short citation labels in staged reviews (2026-10-24)

Staged definition requests now give each allowed evidence record a short label
(`E1`, `E2`, …), attached to the exact record and listed in the request's citation
map. Models are instructed to use these labels instead of copying long UUIDs,
reducing opportunities to splice unrelated IDs. Labels are request-local, not new
project record identities. The app resolves them to exact IDs before validation;
unknown labels or invented IDs fail, never fuzzy-match or silently drop evidence.
Existing adapters may still return exact allowed canonical IDs. Small single-context
assessments keep their existing protocol.

Previously saved stages retain their original response/context bytes. Explicit
resume enables labels only at the unfinished stage and retains spent attempts—even
when the rejected request used the old UUID protocol. Raw labeled responses remain
in receipts; saved assessment evidence and linked UI records always use canonical
IDs. No extra model calls, automatic retry or reset of exhausted attempts is granted.
The protocol reduces copying risk, not a guarantee of valid model output. See
[upgrade/recovery details](migrations.md#short-staged-definition-citation-labels-2026-10-24).

Verification: type check, all 182 pretests and 652 main tests, UI build, focused
continuous-definition browser check (now returning short labels), and diff check
passed. The tests include legacy upgrade with two spent attempts, unchanged older
request bytes/receipts, portable replay, repeated SQLite reopen and refusal of
unknown future policy formats. A read-only reconstruction of the reported failed
job confirmed that labels fit its existing first batch without subdivision; no
personal-project writes or live model requests were made. Live reduction of model
copying errors remains unqualified. The broad browser suite was not rerun; its
previous stale-tab assertions and existing bundle warnings remain unresolved.

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

## Continuous manual refresh by default (2026-10-24)

**Refresh definition coverage** and manual **Resume this assessment** now run to the
end of their selected scope without an overall time budget, area count cap or
32-request staged-action stop. There is no separate opt-in mode. The UI explains
that requests consume AI allowance and offers **Pause assessment** in the active
header. A refresh finishes when its initially selected pending areas are checked;
it does not start a perpetual background loop or grant coding/discovery authority.

Current areas are reused without calls. Evidence-blocked areas are reported and
skipped, without repeating unchanged blocked stages. Connection/invalid-response
failures, individual request timeouts, cancellation and stale results stop the run
for attention. No automatic retry or spent-attempt reset is introduced. Per-request
timeouts remain five minutes; sixteen original batches, 64 exact subdivided stages,
three spent attempts per unfinished stage and the 96,000-character input bound
remain intact. All read/check stages must finish before coverage is published.

Continuous staged workers renew a finite six-minute lease atomically with each
request checkpoint. Expired, stale or replaced workers cannot renew; another
worker's live lease cannot be stolen. An app crash leaves a finite expiry, not an
unbounded lock. Restart requires explicit continuation. Existing partitions, hashes,
responses, original model provenance and spent attempts are reused. Historical
deadline/reserve warnings keep their original meaning but no longer govern a new
manual refresh. Metadata measurements now accept up to 64 requests per job, matching
the stage bound; the export remains metadata-only and byte-bounded.

Automatic-maintenance preferences and its eight-request/five-minute/three-area
bursts are unchanged. Coordinated **Continue project** retains its separate consent
and allowance. Those bounded callers cannot use the internal continuous-manual
dispatch option. See [upgrade compatibility](migrations.md#continuous-manual-definition-refresh-2026-10-24).

Verification on Windows Node 22.23.4: type check, UI build, 174 pretests and 652 main
tests passed. Mock-clock checks cross fifteen minutes within/across areas while
preserving live leases; other tests cover more than ten areas, 33 exact stages with
SQLite reopen/export, blocked-area skipping, failure stops, request timeout,
historical deadline-pause recovery without repeated completed calls, and expired/
stale lease rejection. The focused continuous-definition and coordinated-workflow
browser checks passed, including Pause/reload/explicit resume, stage reuse, all-area
completion, usage guidance and mobile width. Aggregate browser checks passed workspace
layout and model selection, then still stopped at the missing **Project map** tab
in `browser-check.ts:706`; the focused epic runner has the same stale-tab assertion
at line 122. Later aggregate portable/specification runners did not execute. Existing
bundle warnings remain. No live model calls or personal-project edits were made.

## Finding earlier failures (2026-10-24)

Updated 2026-10-25: open **Overall progress → View logs** or **Application menu →
Logs**. Definition attempts load automatically alongside other run logs; there is
no separate assessment-history screen. Select **Source → Definition review**, an
area and **Problems only** if needed; use **Older saved tasks** to reach earlier
attempts. Expand an entry's **Log details** for the original bounded diagnostic.
Each entry shows its task identity, revision, area, recorded timing and saved-step/
current-run request counts where known. An earlier failure is historical, not proof
that a newer task failed; current coverage freshness remains separate. Opening,
filtering or paging logs starts no model calls. See [unified timeline](workspace-navigation.md#unified-run-timeline-and-timing-2026-10-25).

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

Before continuous manual refresh, explicit global/per-area refreshes shared
in-memory request-duration estimates. This historical scheduling policy remains
available only to explicitly bounded internal callers, not the default manual path.
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
target/reserve and three spent attempts per unfinished stage. The original
32-request/fifteen-minute staged-action budget is superseded for manual refresh by
continuous processing above; explicitly bounded callers retain their allowances.
Each request still has a five-minute timeout. Oversized individual records, over-sixteen-batch areas,
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

### Historical shared-window pauses

Before continuous manual refresh, the fifteen-minute window was shared across the whole **Refresh definition coverage**
action, not restarted for each area. Earlier completed or failed areas consume that
window. A later area may therefore pause during its second request even though its
own job has run for only two minutes and its five-minute request timeout was not
reached. Completed stages remain saved; unfinished in-flight attempts remain spent.

New runs record separate causes for that shared deadline, the area's own deadline,
an individual request timeout, explicit Stop, app shutdown and unspecified external
interruption. Historical time limits display **Paused—progress saved**, not an apparent user
cancellation; Stop displays **Stopped—progress saved**. The drawer says definition
processing is paused, not discovery. Explicit manual Resume/Refresh now continues
under the continuous default without repeating completed calls or resetting attempts.

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
