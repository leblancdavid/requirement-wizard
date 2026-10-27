# Graph-backed discovery and current-specification contexts

## Exhausted saved step: explicit, bounded additional allowance (2026-10-26)

A user retry reached four cumulative attempts: evidence load, the old permissions
blocker, another load and a draft rejected for out-of-authority global changes.
Repeating ordinary processing cannot clear this cap. The staged prompt now has its
own constrained draft schema instead of embedding ordinary/global discovery
instructions. It still enforces the saved input's authority and exact evidence rules.

For an eligible exhausted step, **Processing & queue → Review additional allowance →
Allow 4 more requests** explicitly grants up to four additional calls to that step
only (eight cumulative). Earlier attempts/receipts and loaded evidence remain;
completed work is not repeated. Opening/reloading this confirmation grants nothing.
Other steps keep their original limits, and other inputs, research and gap discovery
are not included. An extended step can still fail; the grant is neither an automatic
reset nor a completion guarantee. See [compatibility](migrations.md#explicit-extra-saved-response-requests-and-isolated-staged-prompt-2026-10-26).

## Loaded targets with support in another batch (2026-10-26)

A subsequent saved-input run correctly read explicit replacement intent but stopped
because its ordinary prompt listed no accepted requirements as revision-eligible.
The loaded targets' original supporting sources were split across evidence batches.
This was an app-side evidence/permission projection bug, not a new product decision.

Staged prompts now list eligible detailed targets whose complete support is present
in the mandatory material, identify missing source IDs and require exact retrieval
before new/changed updates. A candidate ID alone is not evidence or permission to
ignore a conflicting human decision. Normal single-request permissions are unchanged.
An older affected read blocker can be re-evaluated on **Process saved responses
only**, retaining its original receipt and spent attempts. Corrected-prompt blockers
and failed frozen-draft checks do not receive that recovery. Completed work is not
repeated or reclassified as stale. See the [migration ledger](migrations.md#staged-revision-permission-evidence-loading-and-blocker-recovery-2026-10-26).

## Retained reconciliation answers before more clarification (2026-10-26)

Read-only inspection of the affected local project established that a completed
clarification did not finish retained input: two concrete unscoped reconciliation
answers were applied but size-blocked before dispatch, and another was still queued.
The earlier fallback mistakenly required `answerScope`; questions citing human
sources rather than requirement IDs legitimately lack that narrow scope. Repeating
question preparation cannot substitute for processing those answers.

The fallback now covers all concrete answers without manufacturing scope. The queue
prioritizes **Process saved responses only**, sending explicit submission IDs and
`research:false` to the processing-only API. It does not start another discovery or
clarification package. Pending input disables queue clarification continuation;
Design also disables continuation when related retained input remains. Saved
clarification receipts stay intact. Review-blocker processing now sends the selected
submission IDs instead of discarding them in favor of a general feature-level call.

Pure planning reproduced the two original overflows and now fits each into 10 exact
batches / 20 steps. This does not establish semantic completion or live-provider
success. No personal project writes or model calls were authorized or performed.
See [compatibility and checks](migrations.md#broad-concrete-answer-staging-and-explicit-processing-only-selection-2026-10-26).

## Visible paused clarification and complete staged diagnostics (2026-10-26)

A supplied metadata-only export showed its latest run **interrupted after 32
returned adapter attempts**, with every request below the 96k context budget. It did
not establish another oversized-context failure. Its policy and saved-work counters
were null and every staged response was labelled `other`: the exporter predated the
readiness/submission ledgers. Those omissions prevented identifying the exact saved
phase, accepted progress or historical pause cause from the attachment alone. A
returned adapter response is not proof of validation/publication.

The queue now shows saved clarification steps and a direct **Continue clarification**
action, including while browsing Specification. It does not send that task to
general discovery. The request names the exact saved job, and the server checks that
it is still the latest stopped task for the area's current evidence before doing
anything. Completed requests/attempts remain saved; no response needs resubmitting.
A large task can pause again at its existing per-action limit, requiring explicit
continuation; step counts distinguish progress from an unchanged failure.

Re-exporting now includes readiness/submission policies, anonymized plan grouping,
accepted steps, total/remaining steps, phase and the right continuation action.
Retrieval requests are separate from completed read/check progress. Historical
measurements are not rewritten, missing interruption causes stay unknown, and the
report remains metadata-only. See [upgrade compatibility](migrations.md#clarification-recovery-controls-and-diagnostic-projection-2026-10-26).

Verification: **921 tests** passed (260 pretests + 661 main), as did type checking,
UI/desktop builds and the focused Specification/browser runner. That runner now
continues a paused clarification directly from the Specification queue, checks the
exact saved job ID and confirms that no completed read repeats. The aggregate
browser runner passed layout/model selection, then stopped at the existing
**Project map** locator (`src/web/browser-check.ts:706`); later aggregate checks were
not reached. No live model call or personal-project read/write was performed beyond
reading the user-supplied diagnostic export. The user's actual continuation remains
unverified; the old attachment alone cannot establish its saved accepted-step count.

## Oversized targeted saved-response follow-up (2026-10-26)

A reported **168,043 / 144,000-character**, two-area failure occurred while
processing retained input, before an AI job started. It is separate from Design
question generation; that questions-only workflow cannot complete a saved review.
Splitting the target requirement cannot reduce mandatory shared project evidence.

The queue still isolates each response and tries the existing exact planner first.
Targeted reviews and all concrete answers (including unscoped reconciliation) now have an overflow-only exact
read/check fallback. Original input is not applied twice. Reads can draft changes
under existing submission authority; every draft action is then checked unchanged
against every evidence batch before anything publishes. Each request stays within
96k characters, including the bounded draft; exact cross-batch retrieval is available.
No raise to the ordinary 144k cap and no silent human-evidence trimming is used.

Use **Resume processing** or **Process saved responses only** for an eligible old
size-blocked response. Continue remains explicit after pause/restart and reuses
accepted stages; there is no need to submit the same review again. This is not
authority to resolve competing human decisions automatically, reapprove a requirement,
archive a feature, or run coding. Research-enabled, unscoped/general input and pair
resolution retain their existing policies; indivisible evidence may still block.
See [upgrade/recovery](migrations.md#oversized-targeted-saved-response-continuation-2026-10-26).

Verification: all **917 tests** passed (257 pretests + 660 main), along with type
checking, UI/desktop builds and the focused Specification/browser runner. The new
checks cover older pre-job blockers, scoped answers, exact independent wire decoding,
file-backed restart, portable adoption into an empty store, publication-only zero-call
retry, stale material, malformed output/attempt exhaustion, cross-batch loading,
oversized supplements and non-cooperating-adapter timeout/late results. The browser
case reloads a saved review and explicitly resumes only its unfinished stages, while
asserting progress-only snapshots. The aggregate browser command passed layout and
model selection, then failed the existing **Project map** locator at
`src/web/browser-check.ts:706`; later aggregate runners were not reached. The focused
runner passed separately after correcting its new Advanced-actions locator and
waiting for routed polls before browser cleanup. No live model requests or actual
user-project writes were performed for this change.

## Citation failure during staged clarification (2026-10-25)

A reported live run fitted every request (59k–86k characters) and saved four read
steps, then rejected a new/revised question citing evidence outside its current
batch. The original read protocol required exact whole-record reproduction to keep
prior draft questions, making incidental explanation/tooltip edits trigger the same
strict citation gate as real behavior changes. The supplied diagnostic does not
identify the returned question, so its precise cause remains unknown.

New/resumed manual stages now request indexed retention: `keepQuestions` copies
unchanged prior draft records in the engine; `questions` contains only new/revised
proposals with currently loaded citations. Evidence/navigation permissions are not
broadened. Completed receipts replay with their original instructions and hashes.
An additive forward boundary upgrades only future requests, with four total requests
per unfinished step (one more than the old bound), keeping all spent attempts and
the existing per-action limit. See [compatibility and recovery](migrations.md#indexed-clarification-draft-retention-2026-10-25).

Verification: all **900 tests** passed (`npm test`: 240 pretests + 660 main), as did
type checking, UI build, the focused clarification/portable tests and Specification
browser continuation. Actual saved-project/live-provider recovery remains unverified;
no live allowance was consumed for these checks. The broader browser blockers recorded
below were not addressed or rerun by this protocol-only change.

## Oversized Clarify in Design: exact staged evidence (2026-10-25)

The later supplied **416,761 / 144,000-character** failure was confirmed to be
**Clarify in Design**, not Continue or response processing. Another one-shot limit
increase would not fix that distributed evidence load. Manual format-2 clarification
now falls back to `exact-readiness-batches-v1`: exact original mandatory records are
partitioned into saved batches, followed by a separate all-batch check pass. No
question publishes before both passes finish. Global interpretation is explicitly
dated; goals, actors, assumptions, area purposes and pending organization remain
exact, not silently omitted to make the batch fit. Finding records are hypotheses,
not citable human evidence. Unseen cross-batch records can be explicitly loaded by
ID; navigation IDs alone cannot authorize new citations.

Each encoded request is measured against 96k characters with a 12k draft reserve.
Read steps can retain or revise up to three questions; revised questions must cite
currently loaded exact evidence. Check steps can only retain/prune unchanged
questions, not rewrite options or choose rule precedence. The final write boundary
replays the saved ledger against current material/plan identity and checks complete
mandatory coverage. Requirements, assessments and pending responses stay unchanged.

One action defaults to 32 requests/15 minutes, with five-minute request timeouts and
originally three attempts per unfinished step (four after the indexed-read upgrade
above). Attempts are saved before dispatch and accepted
responses before preparing the next request. Explicit continuation retains both
spent attempts and completed steps across restart or portable adoption. Oversized
indivisible/supplemental evidence and more than 32 batches remain specific blockers;
no summary substitutes for omitted evidence. This does not change ordinary saved
response or refinement policies below. See [migration/recovery details](migrations.md#resumable-exact-design-clarification-2026-10-25).

Verification: `npm test` passed all **898 tests** (238 pretests + 660 main), as did
type checking, UI build, focused clarification/portable tests and the Specification
browser runner, including reload/explicit continuation and progress-only snapshots.
The aggregate browser command passed layout/model selection, then stopped at the
obsolete **Project map** assertion (`src/web/browser-check.ts:706`). Separately, the
portable browser runner failed on an ambiguous **Open shared checkpoint** locator
(`src/web/portable-browser-check.ts:37`); portable engine/import continuation tests
passed, but this browser path is not qualified by that result. The supplied actual
project and live-provider staged reasoning remain untested. No paid probe was run.

## Saved-input/clarification dead-end recovery (2026-10-25)

**Individual refinement follow-up (2026-10-26):** the reported
149,358/144,000-character overflow now has an exact staged fallback after the
single-request compaction below. It pins the story and all supporting sources,
reads remaining mandatory constraints in bounded batches, then checks the frozen
draft against every batch before publication. **Processing & queue → Continue
refinement** resumes only the latest saved task with unchanged evidence. The 144k
single-request ceiling is not raised. The later 148,329/144,000-character failure
was a pair comparison; pair overflow now has its own format-2 read/check protocol
with exact pair/support/trigger pins and unchanged resolution authority. A read-only
preflight of that saved snapshot fits in nine batches/eighteen steps. See
[pair bounds and compatibility](migrations.md#oversized-pair-resolution-refinement-continuation-2026-10-26) and
[bounds and migration](migrations.md#oversized-individual-refinement-continuation-2026-10-26).

The supplied 159,757/96,000-character diagnostic is a local context-preparation
failure, not a provider rejection or missing human decision. The original input is
retained and the reported request made no model call. Retrying the same wire package
does not resolve it; splitting unrelated requirements cannot shrink shared evidence.

New single-response and isolated refinement requests try their original context
first. On overflow only, `planExactTaskContext` compares exact canonical approval-
snapshot references and literal phrase sharing, preserving record scope, every human
source, normative wording/scenarios and selected evidence. Saved responses retain
their existing 144k mandatory-only fallback. Isolated refinements and manual format-2
questions-only clarifications may now also use at most 144k, only after exact snapshot/
phrase compaction; there is no optional-context refill. Legacy dimension tasks and
staged gap/definition policies retain their own bounds. These are application input
allowances, not claims about provider/model token capacity. Oversized indivisible
human evidence still blocks rather than being truncated or summarized away.

The clarification gate is now area/dependency/evidence-scoped and ignores resolved,
archived or explicitly superseded submissions. Unrelated input does not block it.
Relevant unapplied/conflicted input must still be recorded/resolved. Already applied
human sources with unfinished AI follow-up can be included exactly in a read-only
clarification: their source IDs are pinned, original input and failed status remain,
and an older finding is labelled a dated hypothesis rather than a current assessment.
The request cannot apply specification changes or complete/retry those submissions.

A synthetic 80-requirement approval fixture shrank from 161,713 to 107,479 characters
while independent decoding recovered every human source, requirement statement/
scenario/link and question/option/answer link. A file-backed older blocked response
reopens unchanged and completes one response round on explicit retry without
reapplying human input; ordinary required overlap checks remain separate. This is
representative deterministic evidence, not qualification of the supplied project.
See [upgrade policy](migrations.md#exact-task-context-and-read-only-pending-input-2026-10-25).

Verification: all 888 tests (`npm test`: 229 pretests + 659 main), type check, UI
build, focused Specification browser runner and diff whitespace check passed. The
browser fixture now exercises clarification with a recorded size-blocked response
and outdated findings, preserving the failed input while showing Design options or
a no-question result. The aggregate browser command passes workspace/model runners
but still stops at the obsolete **Project map** assertion in
`src/web/browser-check.ts:706`. No live model call or personal-project write was run.

## Implemented first slice (2026-10-22)

Storage and inference context have separate responsibilities. SQLite revisions,
original human input, earlier wording, generated explanations and completed jobs
remain intact. A discovery request is a bounded, revision-linked projection, not
an archive replay and not permission to delete historical evidence.

`src/core/evidence-graph.ts` builds an invocation-local index over requirements,
questions, sources and research. Typed forward/reverse links distinguish requirement
support, question motivation, answers, reviews and supersession. Queue traversal
visits reachable records/links rather than repeatedly scanning entire arrays.
Supersession is historical navigation, never an automatic evidence load. Shared
files and epic membership do not create inferred requirement-to-requirement edges.
Missing references remain explicit; cycles terminate. Reverse links identify
candidates, not sufficient proof of the complete impact of a change.

Legacy gap evidence identities now use this index without changing their normalized
evidence, conservative feature/dependency guardrails or `gap-evidence-v1` semantics.
Question lookup and epic-dependency lookup are indexed. Workflow planning shares an
index within one synchronous plan; it is not cached across mutable project reads.

### Current specification versus history

New workflow/dependency reviews try `contextPolicy: current-spec-v1` after reconstructing
compatible saved work under its original policy. This policy uses graph-based exact
closure and proactively compares a compact current-spec representation:

- Keep exact current requirement statements, acceptance scenarios, status and source links.
- Keep target rationale, exact human answers/notes/addenda and unknown review prose.
- Omit generated rationales only for human-confirmed background requirements.
- Omit unselected historical option consequences only when an answer exactly matches
  one unique option label. Preserve all labels, the selected consequence and the
  exact human answer. Freeform/ambiguous answers keep all consequences.
- Retain the existing verified current-decision projection: only proven superseded
  plain review snapshots can be omitted. Verified generated cleanup/resolution
  receipts describe their exact current decision, not embedded old snapshots.
- Compare plain approvals with lossless references to matching exact requirement
  wording/scenarios; choose the smaller wire representation. No semantic summary of
  human evidence is substituted for original input.
- Explicitly describe metadata omissions, but use them only when the complete
  measured package is actually smaller. Never spend recovered space on unrelated
  history in an isolated workflow request.

Original material remains available in saved records/revisions. A correction or an
explicit evidence load still pins its required records. Unknown supersession,
older human addenda and unresolved conflicts remain conservative; the app does not
guess that newer wording has absorbed every earlier exception.

The existing 72k target, 96k ceiling, staged guardrail fallback, citation validation,
expected-revision checks, cancellation and spent-attempt rules are unchanged. Staged
reviews retain their own existing policy and reconstructible exact batches. Neither
metadata omission nor graph navigation earns evidence/citation authority for unread
records. Oversized indivisible human evidence can still block.

### Browser Resume routing (2026-10-22)

**Processing & queue → Resume discovery** now uses a dedicated
`POST /api/projects/:id/resume-discovery` request. The server decides from current
saved-input state rather than a stale renderer snapshot:

- With unfinished, non-archived/non-resolved input, process the finite selected
  response scope using existing isolated follow-up and recovery rules. Never fall
  through to legacy gap discovery if that scope is empty or another worker already
  completed it. Conflicts and out-of-scope responses stay retained/paused.
- With no unfinished input, run the same workflow discovery mode as **Explore next
  gaps**, respecting the selected feature, question target and research choice.
  The existing workflow planner reuses compatible saved policies, stages and attempts,
  including older headroom and staged work. It does not restart completed stages.

This fixes an inconsistency where the Design button selected workflow discovery but
the queue's Resume button could select legacy individual/lens discovery. The two
backlog ledgers remain distinct; old legacy checks/blockers are not relabelled as
workflow checks or deleted. The existing terminal/legacy analyze and explicit
Continue exploration paths remain available with their original semantics.
Processing saved responses does not authorize additional gap exploration afterward;
use **Explore next gaps** once the retained input is resolved. This routing fix does
not guarantee that every mandatory human evidence chain fits the context budget.

Verification: type check, UI build, 43 pretests / 633 main tests, and the focused
workflow browser runner passed on Windows Node 22.23.3. The broader browser command
still stops at its existing missing **Approve resolution** assertion. The focused
browser check includes Resume after reload and unchanged original staged-job evidence;
the SQLite test exercises restart without automatic inference. No live model calls.

### Staged headroom fallback (2026-10-22)

Supplied diagnostics examined 234 packages, with 233 blocked, including 68 newly
measured staged-seed blockers and two staged-target blockers. The largest known
blocked context was 71,887 characters against the old 54,000-character staged gate.
This identifies a policy constraint, not evidence that the user's entire project
will now finish preparation or produce new gaps.

New `staged-headroom-v2` opens otherwise blocked indivisible leaves only. Ordinary
splitting and the preferred 72k path retain priority; old v1 stages retain their
54k base gate and 72k actual-stage ceiling. V2 measures the largest discover/check/
complete envelope together with exact evidence and the full existing 12k draft
reserve against the unchanged 96k application-context ceiling. Every actual request
is measured again, including instructions and current drafts. Reduced headroom is
explicit; this is not a provider-token or full runtime-overhead guarantee.

Saved stages carry policy provenance and v2 has distinct review fingerprints.
Compatible completed calls and spent attempts reconstruct under their original
policy. Old CPU-only local size/unknown blockers are automatically reconsidered
without invalidating reviewed/waiting work or resetting model allowances. See
[upgrade/recovery details](migrations.md#staged-headroom-v2-and-local-eligibility-upgrade-2026-10-22).

Restart the updated app normally and use **Resume discovery** (or **Explore next
gaps** when no input remains). Do not reset project data or delete cached jobs.
Startup itself never starts model calls. Indivisible evidence plus the reserve can
still exceed 96k, and the existing preparation deadline/batch/attempt limits remain.

Verification: the full main suite passed 635 tests; the final pretest rerun passed
all 69 tests. A normal Node compiled-JavaScript worker smoke prepared an 82,467-character
v2 stage without a TypeScript loader. (An initial stdin invocation failed because
`--input-type=module` was inherited by the file-based worker; the file-entry smoke
passed.) Type checking, desktop TypeScript emit, UI build and focused workflow browser tests
passed, including v1 pause/resume and above-target v2 completion. No personal database
or live provider calls were used. Exact-project throughput, live provider behavior
and full packaged Electron execution remain unqualified. The broader browser suite
was not rerun; its earlier **Approve resolution** blocker remains unresolved.

### Saved-answer overlap checks (2026-10-23)

Saved-response processing is separate from staged gap discovery. Each queued answer
already has a 144k mandatory-only fallback, but its automatic duplicate/conflict
checks previously stopped at 96k. A synthetic reproduction completed the response
at 111,107/144,000 characters, then blocked its pair at 111,390/96,000 with no pair
request. Resume retained the completed response but retried the same oversized check.

Only receipt-validated saved-response pairs now share the existing 144k fallback.
Original answers, completed response jobs and completed pair checks remain saved;
explicit Resume retries unfinished work, not the completed response. Ordinary
refinement and staged gap budgets remain unchanged. Diagnostics selection still
excludes refinement jobs; failure messages distinguish the saved response from its
unfinished check. See [compatibility and tests](migrations.md#saved-response-overlap-allowance-parity-2026-10-23).

### Refinement evidence completeness (2026-10-23)

A follow-on failure reached model inference but rejected a returned resolution for
missing detailed supporting evidence. A synthetic regression reproduces this when
one pair requirement cites an old approval owned by a background requirement: the
background decision projection omitted it, but publication required the original link.
Exact direct source links are now pinned as supporting records for both pair targets
(and individual refinement), with a completeness check before inference and again at
publication. No safeguard or citation rule is weakened; superseded evidence remains
historical, not authority for a new decision. Existing successful-check identities
and completed answer calls remain intact. This avoids a reproduced class of wasted
model calls, not a claim that all live resolution failures are fixed. See
[upgrade tests and limits](migrations.md#exact-refinement-supporting-evidence-preflight-2026-10-23).

### Saved-policy batch-ceiling recovery (2026-10-23)

Supplied diagnostics stopped in about four seconds with zero model requests and
zero examined packages, during saved-policy reconstruction. A saved staged policy
could throw its sixteen-batch error before the planner reached its normal fallback/
blocker handling. This was a planner-wide abort, not evidence that every project
package required more than sixteen batches.

The typed overflow is now cached as a local failed compatibility candidate for both
saved roots and children. Normal policy selection can continue; true stage-limit
blockers are counted without preventing independent eligible work. Other errors
still fail visibly. This does not increase context, batch, lease or model-attempt
allowances, and does not replay/relabel old stages after changed decisions. See
[compatibility and regression fixtures](migrations.md#saved-staged-policy-batch-ceiling-recovery-2026-10-23).

### Continuous bounded staged actions (2026-10-23)

The six-request pause was reliable checkpointing exposed as repetitive user work:
a 26-stage package needed five explicit actions even with no model errors. Staged
packages now continue in the same job up to 32 requests or fifteen minutes including
preparation. The existing queue-wide fifteen-minute/ten-package limits still apply.
Stop, exact checkpoints, three attempts per stage, context limits and publication
only after all batches remain. Real failures stop; there is no automatic error retry
or post-restart inference. This removes repeated resumes, not repeated evidence or
the cost of a multi-batch review.

Format-1 `retrievalWork.stagedRun` records each action's limits and optional budget
pause reason. Intentional stops retain `interrupted` storage status and display
**Paused—progress saved**, not failed analysis. A new action clears only its own
run-budget marker, never saved stage attempts/responses. Old six-request jobs remain
unchanged and resume compatible work under the new scheduling allowance. Metadata
diagnostics now retain all requests up to 32 rather than failing at the seventh.
See [upgrade and verification](migrations.md#continuous-bounded-staged-actions-2026-10-23).

## Measurement

### Responsive, incremental preparation (2026-10-22)

Workflow discovery now prepares only through the **first eligible package** rather
than building every package's exact context before the first request. The catalog
order, saved-policy reconstruction, split/boundary preservation and exact evidence
identities remain unchanged. A report marked `planningPartial: true` covers only the
examined prefix; neither the UI nor diagnostic backlog totals describe unseen packages
as checked, blocked or complete. With no eligible package, planning still examines the
remaining scope to establish the no-call outcome, subject to the preparation deadline.

Expensive initial context preparation runs in one owned CPU worker, separate from the
loopback API/service event loop. The parent can serve snapshots, accept **Stop**, run
deadline timers and terminate even an indivisible synchronous compaction. The worker
owns no database, provider, credentials or OpenCode server. Historical revision data
is requested from the parent only when needed for exact compatibility checks; an
invocation-local cache avoids rebuilding already prepared candidates during that read.
Prepared staged batches and their exact basis are reused instead of needlessly
rebuilding every batch for each saved-match comparison.

Before any model request, Processing & queue shows **Preparing workflow evidence…**,
with preparation counts and elapsed seconds. Local format-1 diagnostics optionally
add `planningProgress` (phase, examined-prefix count, context preparations, checkpoint
sequence and historical-revision count). Latest progress/elapsed time is saved roughly
every 500ms, plus initial/first-context/final boundaries. These are diagnostic progress
checkpoints, not completed analysis or a resumable computation cursor. Explicit retry
can redo local preparation; completed model stages and spent attempts remain intact.
Interrupted `recording` measurements now export an unknown adapter-time total rather
than a misleading zero completed-run total. Per-request entries remain unchanged.

Initial preparation has a **two-minute parent-owned deadline** within the existing
five-minute combined discovery bound and six-minute lease. No longer lease or extra
model allowance is granted. Stop/deadline/stale-input failure terminates only the owned
planning worker and preserves original evidence. A deadline explains that preparation
stopped without model inference; choosing a narrower feature may be necessary. Startup
never resumes calls automatically, and an old lease-expired job is not fabricated into
a completed plan.

This slice isolates initial workflow planning, not every local operation in the app.
Initial SQLite reads/snapshot transfer, later explicit evidence-load preparation and
independent publication-time validations retain their existing implementation. It is
not a promise that arbitrary human evidence fits, that a whole project plans within
two minutes, or that the user's interrupted run has been reproduced exactly. Source
runs use the dev TypeScript loader explicitly in the worker; emitted desktop code
uses the emitted JavaScript worker without requiring that loader.

Verification: all 49 pretests and 633 main tests passed, along with type checking,
UI build, desktop TypeScript emit and the focused epic-workflow browser check.
A normal Node compiled-JavaScript smoke check verified worker startup without a
TypeScript loader; this does not qualify full packaged Electron execution. The
broader browser command stopped at the missing **Approve resolution** assertion in
`src/web/browser-check.ts:1347`, before its portable/specification runners. The user's
exact stalled project was not reproduced, and no live provider calls were made.

### Exact-input local planning continuation (2026-10-22)

A subsequent real diagnostic reached the two-minute bound after 55 examined packages
and 3,173 context preparations, with no model request. Worker isolation kept the app
responsive but did not remove repeated preparation. Local planning now shares
immutable decision/approval-snapshot derivations and lookup indexes between context
variants; equivalent contexts and existing exact model/checkpoint keys are unchanged.

After a complete root group's local scheduling, non-pending tasks and their numeric
report basis are checkpointed in a separate SQLite table. Explicit retries, including
after app restart, reuse these groups **only for identical complete planner inputs**:
project content, ordered workflow history, submissions, selected scope and algorithm
version. This avoids rebuilding exact contexts for resolved groups before reaching
the next eligible package. Pending tasks still require fresh exact contexts. Changed
decisions, jobs, attempts, model selection or even irrelevant project metadata
invalidate this conservative CPU reuse; model-stage compatibility continues to use
its existing separate evidence checks.

Queue progress/diagnostics show numeric `reusedGroups` and `resolvedGroups` counts;
the saved receipts contain no context bodies and are never exported as model checks.
The currently unfinished root group restarts after interruption. A project retains
at most 2,000 root-group receipts/4 MiB for one input generation; reaching the cap
does not change scheduling, but stops saving additional receipts. No automatic retry,
model call, longer lease, larger context or larger model allowance is introduced.
One indivisible slow group may still time out; scope narrowing remains a fallback,
not the primary retry strategy. Numeric half-second progress pulses alone are still
diagnostic metadata, distinct from completed-group CPU checkpoints.

Schema 3 upgrades transactionally to schema 4 without rewriting saved requirements,
jobs, assessments, history or completed model work. The previous timeout cannot gain
receipts retroactively: the first run after upgrading starts the new cache. See
[migration and recovery](migrations.md#exact-input-local-planning-continuation-2026-10-22).

Verification: 633 main tests passed in `npm test`; the final pretest rerun passed
all 53 tests, including the added zero-preparation reuse case. Type checking, UI
build, desktop TypeScript emit, normal Node compiled-JavaScript worker smoke and
the focused workflow browser runner passed. Full packaged Electron execution and
the exact supplied project's performance remain unqualified; no personal database
or live provider calls were used. The broad browser suite was not rerun for this
follow-up (the earlier worker-isolation run's blocker is recorded above).

### Intermediate preparation reuse and explainable progress (2026-10-22)

Further supplied diagnostics showed progress from 72 to 116 examined packages:
the second run reused 16 root groups but still performed 3,667 context preparations
before its deadline. That establishes working coarse-grained continuation, not a
complete performance fix or proof that an eligible package is near.

Planning now saves completed recursive subtrees **inside** an unfinished root group,
and memoizes exact context computations, including full size-overflow outcomes.
An explicit retry can reuse a completed sibling and earlier staged partition probes
instead of rebuilding the entire root. Success contexts are isolated copies; cached
overflow manifests/messages retain their original exact blockers. Candidate review
identities, guardrail order/partition and output validation remain unchanged. Existing
root receipts remain reusable across this upgrade; the root-input digest is not
invalidated by an equivalent computation strategy. Changed inputs still invalidate
CPU reuse conservatively.

Intermediate contexts are bounded to the recent 128 entries / 16 MiB in local SQLite
per project/input generation; older entries can be recomputed. They contain private
evidence text and are **not diagnostic/export artifacts**. Completed roots/subtrees
share the existing 2,000-entry / 4 MiB receipt limit. A single indivisible computation
can still time out, and evicted/unfinished work may repeat. This is not a guarantee
that this user's exact project now finishes in one pass, or that repeated retries
will discover gaps rather than eventually report waiting/blocked work.

Preparation progress now labels its examined prefix as reviewed, waiting, blocked
or eligible, and shows intermediate-context reuse. These are scheduling states, not
new model reviews or whole-project totals. Diagnostics additionally expose fixed
worker activities/timing buckets: saved-policy reconstruction/matching, new-package
preparation, new staged partitioning, recursive splitting and catalog/other worker
time. Nested work is counted exclusively (for example, saved staged-policy rebuilding
belongs to saved-policy time). These are sampled worker wall times, not provider time
or an exact breakdown of parent startup/SQLite work; a killed operation may leave a
partial bucket. `preparedContexts` counts complete checkpointable computations,
not necessarily persisted rows. Group counts may include both roots and subtrees.

Long preparation logs can evict the original “Finding gaps” line from the bounded
20-message queue history. The final outcome banner now also recognizes the typed
saved workflow/gap report, so losing that initial message cannot hide its outcome.
The two-minute preparation deadline, five-minute combined bound and six-minute lease
are unchanged. There are no automatic retries or extra model allowances. See
[schema-5 compatibility](migrations.md#intermediate-preparation-checkpoints-and-phase-diagnostics-2026-10-22).

Verification: 57 pretests / 633 main tests, type checking, UI build, desktop emit,
compiled-JavaScript worker startup/receipt/state smoke and the focused workflow
browser runner passed. The focused browser test caught the outcome-banner regression
described above; after the UI fix, its expensive no-inference blocker fixture uses
an explicit bounded 30-second terminal-state wait rather than a 5-second UI default.
The broad browser command remains blocked at **Approve resolution** in
`src/web/browser-check.ts:1350`, before its portable/specification runners. Full
packaged Electron execution and this user's exact project throughput remain
unqualified. No personal database or live model calls were used.

### Staging-cost optimization and blocker causes (2026-10-22)

The next supplied diagnostic isolated the expensive path: about 99.5 seconds in
staging and 17.7 seconds in splitting, with 164 packages examined (163 blocked,
one reviewed, none eligible), 23 groups reused, and no model request. This is evidence
of costly unsuccessful local staging, not a provider stall or proof of the exact
blocker causes in those older cached groups.

The staging algorithm now applies its **existing** exact target-only 54k gate before
constructing the full-area seed catalog. An already-unfit target avoids a redundant
catalog build. Successful targets still use the original seed order, deterministic
bisection, compaction rules and batch cap. No human evidence is dropped and no
monotonic-size assumption about different seed sets is made.

Legacy contexts now compute closure with an indexed logical-sweep worklist. Unlike
ordinary BFS, it preserves the exact old insertion order in the manifest, including
backward links deferred to the next sweep. Each reachable record is processed once
instead of repeatedly scanning entire project arrays. Supersession stays navigation,
not an automatic evidence load; existing workspace/answer/decision filters remain.

Different staged seeds often close to the **same exact evidence**. Their rendering
and lossless compaction can now be shared when all task flags/target IDs and the final
membership match. Caller-specific legacy included-ID order is restored. This is not
semantic similarity, summary reuse or reuse across different targets or mutations.
The ephemeral cache holds up to 64 results / 8 MiB, including exact overflow outcomes.
`closureRenderAttempts` counts cache-miss rendering attempts and `reusedClosures`
counts equivalent-rendering reuse; these are separate from full-context and
root/subtree receipt counters. All existing persisted checkpoints remain compatible.

Progress and exported diagnostics now retain an examined-prefix `blockerSummary`:
target-size, indivisible decision-seed-size, context-limit, staged batch-limit,
saved-evidence blockers, attempt-limit, and older unknown causes. Known maximum
characters/minimum budget remain numeric; unavailable sizes stay null. Old receipts
are not recomputed merely to fill these fields. Summaries survive interruption via
the existing parent measurement checkpoints, though a currently unfinished package
is not yet counted. These are local scheduling causes, not model-review outcomes or
a whole-project inventory. See [compatibility details](migrations.md#legacy-order-staging-optimization-and-blocker-metadata-2026-10-22).

Verification: all 60 pretests and 635 main tests passed. Type checking, UI build,
desktop TypeScript emit, compiled-JavaScript worker/blocker smoke and focused
workflow browser verification passed. Tests show fewer target preparations and
reused renderings for equal closed sets, with exact reference output/identity parity;
they do not establish a speedup or one-pass completion for the supplied project.
The broad browser suite was not rerun for this slice (the preceding **Approve
resolution** blocker remains unqualified). Full packaged Electron and exact-project
throughput remain unqualified; no personal database or live provider calls were used.

### Export a representative discovery run

1. Restart the updated app. New discovery and saved-answer follow-up jobs record
   bounded local metadata; no inference is run just to collect diagnostics.
2. Use **Design → Explore next gaps** on a representative feature as usual. Wait
   for completion or a useful blocker; exporting a running run is also supported,
   but its measurements are partial.
3. Open **Processing & queue → Discovery diagnostics**. The newest five eligible
   visible runs are initially selected. Expand **Select runs** to change selection,
   clear it or select all recent eligible runs (at most twenty). Scans, help and
   refinement jobs are excluded; selection comes from the workspace's recent jobs,
   not an unbounded archive listing.
4. Click **Export discovery diagnostics**. Review the downloaded
   `reqwizit-discovery-diagnostics.json` and share it for analysis if desired.

The authenticated same-origin API is `POST /api/projects/:id/discovery-diagnostics`
with `{jobIDs:[...]}` (one to twenty distinct project-owned discovery job UUIDs).
It reads bounded SQL metadata projections, never model outputs/history, and returns
a no-store JSON report capped at 256,000 UTF-8 bytes. Export makes no model calls,
does not revise the specification and does not change checkpoints or attempt limits.

**Included:** report-local run/package handles, input revisions, status, known
context policy, initial planning time, per-adapter-attempt duration and envelope
category, exact context character/count breakdowns from known sections, selected
current-spec context traversal counts, retained-stage/attempt/batch counts and saved
backlog totals. Workflow planning counts distinguish new packages, compatible saved
packages and packages without a compatible saved match. The latter can reflect
changed evidence, scope or grouping; it is not a semantic explanation of a change.

For finished measured runs, `timing` separates initial planning, adapter requests,
and remaining local time (evidence preparation, validation, storage and orchestration).
Request time includes adapter/server startup, tools and provider work, not just model
inference. Request entries are checkpointed before dispatch; an in-flight entry is
not proof that a provider accepted a call. Response categories are identified before
validation; a returned response is not proof of successful publication.

**Excluded:** original project/job/record IDs, project/feature names, source/requirement
text, answers, prompts, responses, error/progress prose, file paths, timestamps,
provider/model/account/session identifiers, credentials and arbitrary metadata keys.
The export uses explicit field/key allowlists rather than trying to redact arbitrary
logs. Counts, revisions, durations and package relationships can still reveal project
scale or structure; this is minimized metadata, not a guarantee of anonymity.

Older jobs have `measurements: null`; missing counts remain null. Do not manufacture
zero requests from absent measurements or replay old calls to get timings. Measured
requests belong only to that job invocation, while saved attempt/receipt counts may
span retries. Abrupt interruption retains `state: recording` and null durations for
unfinished requests; it does not fabricate a completed timing. Graph counts describe
the selected context's traversal, not every candidate/compaction attempt during planning.
Character counts describe the app context, not total runtime prompt overhead or tokens.
For staged jobs, `savedContext` can describe the publication union rather than a single
request. Use each measured request's context for actual app input sizes.
Metrics are excluded from portable continuation and never affect evidence fingerprints.

Diagnostics verification (2026-10-22, Windows Node 22.23.3): full `npm test` passed
(38 pretests / 633 main tests), with final focused diagnostics checks, type checking,
UI build and focused workflow/specification browser checks passing. Workflow browser
coverage includes selection, actual JSON download, privacy assertions, export failure,
reload, staged resume and mobile layout. Diagnostics are collapsed below active
controls; the broader runner passed its active Stop visibility check after correcting
an initial layout regression. The full browser command still stops at its existing
missing **Approve resolution** assertion (`browser-check.ts:1347`); the separately
run portable browser check still stops at its existing duplicate **Open shared
checkpoint** selector (`portable-browser-check.ts:37`). Neither suite is claimed as
passing. No live model calls or personal database inspection were used.

### Synthetic benchmark

Run `npm run benchmark:discovery` with Node 22.12+. It creates only disposable synthetic
in-memory data and makes no model calls. It reports:

- An adversarial reverse-ordered chain: old full-array closure versus graph build and
  queue traversal, with record/edge counts and median/p95 local timings.
- Generated-background-heavy workflow context: old `headroom-v1` versus
  `current-spec-v1`, complete character counts, section sizes and preparation timing.

One Windows Node 22.23.3 run measured 26,253 versus 10,190 characters (61.2% smaller)
with the same included evidence IDs. This fixture deliberately contains redundant
generated background; it is not a typical-project improvement guarantee. Timings
are machine/load dependent. No live model latency, token use, answer quality or
subscription savings have been established.

Verification: type check, UI build, full `npm test` (28 pretests and 632 main tests),
the final five-test graph suite (including an additional independent pre-graph hash
contract check), benchmark, and focused epic-review browser runner passed. Test and
benchmark runtime was Windows Node 22.23.3. Browser coverage includes selected-epic
routing, blockers, staged pause/resume, no-call reuse, reload and mobile layout.
The full browser suite was not rerun for this non-UI change; its previously documented
resolution-approval blocker remains outside this verification. Vite's existing
chunk-size warning remains non-blocking. No live inference or personal data was used.

## Remaining work

- Profile actual project blockers with explicit user consent; do not inspect personal
  databases or make inference calls merely to collect performance numbers. The export
  above now supports user-selected metadata sharing; real-project results remain unmeasured.
- Introduce ranked full-text search alongside graph navigation. Existing bounded
  literal search remains unchanged, and the browser workflow path still avoids
  model-driven search/paging.
- Add explicit semantic constraint/dependency relationships and selective freshness
  rules. Existing guardrail fingerprints intentionally remain conservative: new
  constraints must not escape invalidation just because an older check never saw them.
- Broader safe projection of historical answers requires explicit, trustworthy
  supersession/decision scope. This slice does not summarize away human history or
  implement a retention/deletion policy.

See [upgrade compatibility](migrations.md#graph-backed-current-specification-contexts-2026-10-22)
and [workflow review](epic-workflow-review.md).
