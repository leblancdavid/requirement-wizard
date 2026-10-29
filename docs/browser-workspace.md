# Browser workspace, epics, and estimated completeness

## Consolidated-flow regression checks (2026-10-29)

The default `npm run test:browser` now passes beyond its former Project map blocker,
covering the current Specification/Implement/progress/Settings/Logs destinations.
It includes explicit missing-assessment recovery and review-draft regression runners.
`npm run test:browser:review-drafts` isolates notes, change-request drafts and newly
opened forms remaining visible when polling updates their supporting evidence. Editing
or opening Request changes pins the current card without queuing a decision or model
call. Portable browser checks repeat checkpoint busy/ready cycles to ensure stale
disabled controls do not accumulate. Saved evidence, authority and budgets are unchanged.
See [qualification details](workspace-navigation.md#default-aggregate-qualified-2026-10-29).

Missing definition reviews from older versions can be previewed and explicitly
restored under **Overall progress → Recover missing saved assessments**. Opening the
controls makes no history request or model call. Existing results are never replaced;
recovery-only revisions preserve valid saved implementation work without rewriting
original plans, code findings or delivery evidence. Already outdated work stays outdated.
See [recovery guidance and current limits](assessment-history-recovery.md).

## Prepare implementation, then build explicitly (2026-10-29)

Implement separates **Prepare implementation** (Check progress, Prepare plan, Check
options, plan review and settings) from **Build and verify** (Start/Resume implementation
or Verify delivery). Opening the view performs metadata inspection, not code assessment,
verification commands, plan generation or coding. Already authorized work can continue.

Use Check progress when code already exists; it follows the selected feature and can
verify main with configured commands. Prepare plan remains explicit and project-wide
over approved requirements. A new repository can proceed directly to planning after
setup. Current approved plans need not be regenerated; older proposals/paused work
retain their existing review and continuation rules. Frozen runs keep their saved
scope. This grouping changes neither permissions nor valid saved evidence. See
[implementation guidance](implementation-workspace.md#preparation-versus-building-2026-10-29)
and [compatibility](migrations.md#separate-implementation-preparation-from-builddelivery-2026-10-29).

## Specification actions and processing permissions (2026-10-29)

**Continue specification** is the renamed coordinated action, not permission to plan
or code. Opening its explanation while coordination is off still makes no requests;
explicit continuation retains the eight-request/five-active-minute grant. Existing
scoped saved-response, clarification and refinement recovery shortcuts remain.

Use **Design → More actions → Discover missing decisions** for scoped exploration and
its Questions ready target. Use **Specification → More actions → Improve requirements**
for wording/overlap cleanup (formerly Refine requirements). Both disclosures open
without inference; explicit tasks keep their own scope and usage limits. The queue's
Advanced actions disclosure is also now called More actions. Keyboard targets and
44px disclosure/task controls are retained on mobile.

**Settings → Project settings → Processing permissions** groups the existing controls:
coordinated specification work, automatically processing saved inputs, and automatic
definition updates. The saved-input preference applies across projects in this browser;
workflow/definition settings are project-local on this machine. Coordination makes
the separate preferences inactive without changing them. **Use separate task settings**
restores their applicability, not an all-manual mode; existing pauses/restart gates
still apply. Original input flags, opt-outs, limits and separate research/coding
permissions are unchanged. Earlier names in dated descriptions/logs below refer to
these same operations. See [compatibility](migrations.md#specification-controls-and-processing-permission-grouping-2026-10-29).

**Manual processing** is now a separate project-local choice on this computer.
Select the radio and **Save processing mode** explicitly; inspection/selection starts
no work. Stop active tasks first. It holds automatic saved-response follow-up,
definition maintenance and future coordinator wake-ups without changing the browser-wide
`reqwizit-auto` preference, original response flags, opt-ins, checks or spent allowance.
Plain approvals still complete through local checks without AI. Explicit processing
and **Continue specification** remain available; only already-saved responses are
included, and a coordinated run needs explicit continuation after its next decision
or pause. Returning to **Keep existing permissions** leaves the queue, coordinator and
maintenance paused; it does not renew allowance or restart them. Other projects,
research, scans, implementation preparation, coding and delivery consent remain separate.
The machine-local policy is not exported. See [upgrade compatibility](migrations.md#project-local-manual-processing-2026-10-29).
Focused deterministic browser check: `npm run test:browser:processing` (including
stale settings, reload, save-only input, retained preference and mobile layout).

## Saved outcome and next step (2026-10-29)

**Processing & queue → Project workflow → Last specification run** now adds a durable
summary across all steps of the latest bounded coordinator worker pass, not just the
last mutation. It shows starting/ending revisions, reserved AI attempt count, outcomes
for jobs with attempts and net changes to decisions, requirements, questions, features,
research, refinement proposals and definition reviews. Intermediate edits may cancel
out; proposals are not approvals, and concurrent human edits are not attributed to AI.
Attempt reservations happen before dispatch and are not provider billing totals.
Existing current reviews remain available for reuse; the receipt does not claim a count
of requests saved. Current remaining work stays in the separately revision-labelled
summary below, not silently rewritten into the dated run.

Each worker pass has its own receipt, even when a later decision resumes the same
remaining allowance. A run stopped for a decision, limit, error or Stop is not proof of
specification completion. A missing ending summary after interruption/lease loss is
explicitly incomplete; no ending revision is reconstructed from today's project.
Old versions' runs have no fabricated receipts. Restart/inspection starts no calls.
All local receipts are retained, but this first UI shows only the latest; they are not
portable authority or a report covering manual tasks, implementation or multiple bursts.
The focused workflow browser check covers the summary, mobile and restart preservation.

**Processing & queue → Project workflow → Saved outcome and next step** combines
the latest locally recorded specification-change counts with current remaining work.
The change receipt and current status each show their own revision. Expand the receipt
for added/updated/removed record counts; proposals are not counted as approvals and
this is not an entire-run report. Activity retains the available detailed history.
Without local change history, the receipt remains explicitly unavailable.

The summary shows saved definition reviews still current, reviews needing updates or
an initial baseline, unfinished input, pending decisions and affected refinements/plans.
Definition counts cover active requirement/dependency areas and project-wide decisions.
Current reviews are available for reuse, not proof that a specific number of model
calls was saved or that every finding is resolved. The next-step explanation distinguishes
running work, saved-input issues, review blockers and explicit specification/planning/
coding actions. Reading it grants no allowance and starts no requests. Saved evidence
reconstructs the summary after restart. See [compatibility](migrations.md#revision-labelled-saved-outcome-summaries-2026-10-29).

## Organization changes and related saved work (2026-10-29)

Merging, splitting, restoring organization or explicitly retiring an area no longer
discards its saved definition findings. Archived-area findings remain dated evidence,
outside current coverage; new split areas still need their own reviews. Restoring an
old organization never undoes later human decisions. Its original assessments can be
reused only when the existing exact evidence checks match.

**Processing & queue → Project workflow → Related saved work** now explains pending
refinement and implementation-plan status: needs updating, needs your review,
unfinished or current. Plan explanations identify changed specification revision,
workspace or implementation settings. They do not start model calls, regenerate a
plan or approve coding. Use **Prepare plan** explicitly in Implement after resolving
setup issues; Continue project does not prepare or approve implementation plans.
Earlier versions' already removed assessments are not automatically recovered.
See [compatibility](migrations.md#organization-assessment-retention-and-related-artifact-explanations-2026-10-29).

## Visible definition follow-through (2026-10-29)

**Processing & queue → Project workflow → Definition reviews** distinguishes saved
current reviews, reviews needing an update and never-assessed areas. Expand **Areas
and saved review status** for names and explanations. These labels reconstruct from
saved evidence after restart; they neither start calls nor imply that current findings
are fully resolved. Enabled workflow controls remain in the drawer when the header
offers scoped saved-response processing.

Within existing authorized coordination, outdated reviews are updated before more
gap exploration, after saved input, required decisions and consistency checks. New
baseline reviews retain discovery-first ordering. Stop, failure, usage limits and
restart still preserve work and require the appropriate explicit continuation.
See [coordinated workflow](coordinated-workflow.md#definition-follow-through-2026-10-29)
and [remaining consolidation work](workflow-consolidation.md).

## Refinement preserves definition review evidence (2026-10-29)

Approving wording refinement or a pair resolution, or removing a duplicate, now
retains previous definition assessments rather than removing whole assessments that
cited changed requirements. Affected areas show **Assessment outdated**, not **Not
assessed**, and unchanged unrelated areas remain current. Changes to project-wide
rules can legitimately affect multiple areas. Original findings remain dated evidence,
not proof that replacement wording is fully defined. Use **Refresh definition coverage**
or the existing coordinated workflow to update affected reviews within its consent.

This does not yet add a unified automatic repair queue or restore assessments removed
by earlier app versions. See the [consolidation plan](workflow-consolidation.md) for
the staged follow-through/control work and [upgrade compatibility](migrations.md#preserve-definition-assessments-through-requirement-cleanup-2026-10-29).
An already running desktop/backend must be rebuilt/restarted to load this correction.

## Visible question-preparation feedback (2026-10-28)

**Prepare questions in Design** and explicit clarification continuation now move
focus and scroll to the Design clarification status. This also happens when an
unchanged saved result is reused: no new question or AI call is required just to
show feedback. Background polling does not steal focus. Refusals/errors remain
visible rather than being confined to a source card hidden by navigation.
The focused Specification browser regression covers new/no-question results,
repeated no-call reuse from a deep page and API rejection. There is no persisted
state or evidence-policy change; see [compatibility](migrations.md#reveal-the-explicit-design-clarification-outcome-2026-10-28).

## Large linked-evidence workflow packages (2026-10-28)

General discovery can recover otherwise unsplittable linked-evidence packages using
a **questions-only exact-record fallback**. Exact records are distributed across
saved read/check batches rather than pulling the entire linked chain into each
request. Original input and target records repeat. Nothing publishes until all
batches finish; this cannot propose requirements or approve decisions. Missing
evidence, an individually oversized record or an unsafe comparison can still block.
The two-minute local planner bound and evidence limits are unchanged.

A read-only preflight of the reported 51-blocker project selected an eligible
six-batch package in about 10 seconds without inference or database writes. This only
qualifies preparation of the first package, not live provider acceptance or
whole-project completion. Existing completed calls and interrupted stages remain
in their original protocols. See [compatibility and verification](migrations.md#questions-only-exact-record-workflow-fallback-2026-10-28).

## Continuous refinement and no-change results (2026-10-27)

**Refine requirements** continues automatically through its selected finite target
list, with no new whole-sweep request/time cap or periodic Continue confirmation.
The queue shows stage-level completed/total checks, model requests this run, wording
suggestions and unchanged requirements, plus the current requirement's evidence
read/check progress. Stop and existing individual-request/task failure safeguards
remain available. App restart never silently restarts model requests.

Large individual wording tasks still read every exact evidence batch. If the final
explicit draft proposes no changes, the task saves that outcome without a redundant
second model pass verifying an empty proposal. A later read can still propose changes;
then all frozen-draft checks are required before a suggestion publishes. Pair
comparisons retain their full verification, including distinct/no-change outcomes.
No evidence-selection or context-size rules are relaxed.

Logs distinguish **Finished—no wording changes needed** from a wording suggestion
ready for approval. New refinement jobs retain their own dispatched-request count,
excluding reused steps; older stage receipts supply a labelled lower bound where
available. Saved evidence counts are separate from requests made this run. Original
historical jobs are not rewritten. Compatible saved reads can finish on explicit
continuation without repeated calls, including zero-call no-change publication.
See [upgrade compatibility](migrations.md#no-change-refinement-completion-and-request-visibility-2026-10-27).

Verification: **964 tests passed** (`npm test`: 301 pretests + 663 main), along with
type checking, UI build, and both focused individual/pair refinement browser runners.
Tests cover all-read no-change completion, late proposals requiring the full check
pass, blocked/incomplete evidence, repeated startup, portable receipt preservation,
zero-call recovery of older saved reads, continuous multi-requirement runs and
per-job counts excluding inherited work. Browser checks cover live request counts,
saved stages, Stop/reload/continuation and mobile overflow. The aggregate browser
runner passed workspace layout/model selection, then stopped at its existing
obsolete **Project map** locator (`src/web/browser-check.ts:706`); later aggregate
checks were not reached. No live model calls or running personal-project writes
were performed. The already-running desktop process does not hot-load these changes;
desktop rebuild/update and explicit continuation remain separate, unperformed actions.

## Large individual refinement (2026-10-26)

An individual story/requirement refinement that exceeds the ordinary 144k context
limit now falls back to saved exact evidence batches. Its full wording and supporting
sources stay in every request; shared project/dependency constraints are read and
checked across batches. Nothing publishes early, and resulting wording still needs
approval. Small refinements keep the existing single-request path.

If paused, **Processing & queue → Continue refinement** resumes only that saved
requirement, using your AI allowance without repeating completed steps or starting
general discovery. Reload/restart makes no requests. Progress counts survive reopen
and portable continuation. Changed evidence rejects saved continuation; explicitly
run Refine again for a fresh review of the changed material. Indivisible target
evidence, conflicting checks and exhausted step allowances remain explicit blockers.
Pair overlap/resolution tasks now also use saved exact batches under a separate
pair policy. Both stories, all support and any triggering human response remain
exact in every request; **Continue refinement** resumes only that saved comparison,
not general discovery or the full Refine sweep. Outcomes retain normal resolution
rules and require every batch's verification before a proposal/question publishes.
The reported 148,329-character pair snapshot passed read-only size preparation in
9 batches; actual live-provider completion remains unverified. See
[pair upgrade compatibility](migrations.md#oversized-pair-resolution-refinement-continuation-2026-10-26) and
[upgrade compatibility](migrations.md#oversized-individual-refinement-continuation-2026-10-26).

## Resolve assessment findings in Specification (2026-10-25)

**Blocked saved-response follow-up:** you can use **Clarify in Design** directly
when related human input is already recorded, even if its AI follow-up hit a size
limit. Those exact sources are included and an older finding remains a dated
hypothesis; the failed/pending response is not marked complete. Unrelated saved
responses no longer block this action. Relevant input that is still unapplied or
conflicted must be recorded/resolved first. Do not delete or resubmit saved answers
to clear the gate. See [size/gate recovery](discovery-efficiency.md#saved-inputclarification-dead-end-recovery-2026-10-25).

Partial/needs-review assessment categories are **not individual human input tasks**.
The initial projection of every category into **Needs your decision** produced a
misleading large correction backlog and has been removed. Saved assessments, scores,
answers, manually submitted clarifications and review history remain unchanged.

Definition refresh now automatically prepares Design questions for unresolved area
findings after the selected reviews finish. It reuses completed question/no-question
results; a stopped or failed matching attempt requires explicit continuation, not an
automatic retry. No calls start on render, reload or app startup. Review-triggered
preparation uses additional AI allowance and does not change requirements or start coding.
Ordinary queue reviews that publish assessments also prepare questions; completed,
unpaused automatic-maintenance rounds do the same. Coordinated workflow keeps its own
bounded orchestration. **Process saved responses only** stays within selected input;
the saved-response conflict follow-up below is a related questions-only exception.
Related unfinished human input takes priority over automatic question preparation.

Verification (2026-10-27): `npm run check`, `npm test` (316 pretests + 665 main
tests), UI build and the focused `specification-browser-check.ts` passed using
deterministic adapters, including automatic question appearance without Clarify.
An additional focused 62-test run passed after the continuous lease/time test was
strengthened. `npm run test:browser` passed layout/model-selection checks but stopped
at an obsolete **Project map** tab reference in `browser-check.ts:706`; the full
browser sequence is not qualified. The separate epic-review browser check likewise
stops at its obsolete **Project map** selector (`epic-review-browser-check.ts:122`).
No live model calls were made.

### Saved-response conflicts become Design questions (2026-10-28)

**Reused results and earlier failures:** when **Clarify in Design** reuses a current
completed result, Design and Processing & queue now say **Saved clarification result
reused** and **No new AI request was made**. A separate prior discovery/planning
failure is labelled as an earlier task rather than shown as this clarification's
outcome. Its diagnostic and logs remain available, and its package blockers are not
resolved. The local result notice expires when a new job/revision/project arrives;
saved-input and active-work status still take priority. No new job, model call,
approval or data migration is introduced. See
[UI compatibility](migrations.md#reused-clarification-ui-outcome-attribution-2026-10-28).

Verification for this UI correction: `npm test` passed (337 pretests + 667 main
tests), type check, UI build and 11 queue-activity tests passed. The Specification
browser check reproducing no-call reuse after an unrelated planner failure passed.
The full browser command again passed layout/model selection, then stopped at the
known obsolete **Project map** selector in `browser-check.ts:706`; later full-suite
checks were not reached. Existing bundle-size and React list-key warnings remain.

**Older frozen rationale:** new instructions to keep workflow commentary out of
rationale apply to newly written drafts, not retroactively to saved wording that
checks cannot rewrite. The original prose remains dated AI explanation; it does
not become human authority or a product rule. Factual and authorization checks
still apply. **Process saved responses only** can recheck an affected older v1
rejection once under compatible instructions, retaining the unchanged draft,
completed clarification/reads and spent attempts. It neither cleans up the rationale
silently nor approves the product rule. See
[authoring compatibility](migrations.md#non-retroactive-saved-draft-authoring-guidance-2026-10-28).

**Verification scope:** checking another evidence batch no longer presents its local
target list as the complete staged permission list. Original structural eligibility
is kept distinct from detailed evidence and human intent. Corrective checks receive
the original rejection as dated AI context; future drafts are told to keep workflow
arguments out of product rationale. An affected older failed check can be rechecked
once on **Process saved responses only**, without rewriting its frozen draft,
repeating clarification/reads or resetting spent attempts. A renewed semantic
rejection still stops; recovery is not approval. See
[verification compatibility](migrations.md#staged-verification-scope-and-dated-rejection-context-2026-10-28).

**Evidence-loading continuation:** successful requests for additional exact records
no longer consume the finite failed-attempt allowance. A step can keep loading new
linked evidence and then finish its draft/verdict, rather than stopping after four
useful reads. Duplicate/unknown evidence requests and malformed/failed calls still
spend the original finite allowance; context, receipt and cancellation bounds remain.
After updating the backend, **Continue clarification** reuses an older stopped
ledger's exact reads and completed steps. It does not restart question generation
or reset failure history. See [evidence-progress compatibility](migrations.md#clarification-evidence-progress-accounting-2026-10-28).

Staged follow-up distinguishes **evidence pins** from **current-input authority**.
A later answer added to resolve a saved-response blocker stays available for exact
comparison, but its own queued follow-up owns changes requiring that answer. The
original response's prompt/schema now advertise only its actual authorized input,
matching publication validation. Existing reads and spent attempts survive retry;
this correction does not grant more requests or repeat completed clarification.
See [authority compatibility](migrations.md#separate-staged-evidence-pins-from-input-authorization-2026-10-28).

**Completed-draft citation recovery:** an older fully checked draft can accidentally
mix the current answer and historical confirmation in its update-authorization
citations. **Process saved responses only** now reuses the checked draft without
model calls when the only extra citations are confirmations already retained on
the target and reviewed as evidence. Checked wording and original receipts remain
unchanged; only the current concrete input authorizes publication. Other invalid
citations still fail closed. New drafts reject this mistake before batch checks.
See [citation compatibility](migrations.md#checked-saved-response-authorization-citation-projection-2026-10-28).

**No-question recovery:** completed question preparation can conclude that no new
human choice is established while the saved response still has a rejected draft.
That outcome now permits one bounded corrective draft review, rather than replaying
the old rejection forever. It reuses the completed clarification and original reads,
checks the exact human evidence behind the rejection, and independently verifies the
corrected frozen draft against every original batch. A no-question summary is not
treated as human authority or approval. A genuinely unresolved conflict remains
blocked; unchanged correction cannot restart endlessly or silently gain allowance.
Newly completed clarification can continue the original response in the same manual
action. An older completed no-question result is reused on **Process saved responses
only**, without repeating question generation. Original input, rejected receipts,
history and the paused coordinator settings remain intact. See
[correction compatibility](migrations.md#no-question-clarification-to-bounded-corrective-draft-review-2026-10-28).

Verification: `npm test` passed (326 pretests + 666 main tests), type check and UI
build passed, and the focused 36-test saved-response/diagnostics suite passed after
the final provenance checks. The Specification browser check now exercises both
question-needed and no-question → correction → verified completion with the
coordinator enabled/paused, and passed on a separate rerun. The full browser suite
again passed layout/model selection, then stopped at the obsolete **Project map**
selector in `browser-check.ts:706`. An earlier focused run during a concurrent build
missed its Specification tab; the serial rerun passed. Read-only local preflight
of the reported state confirms the completed clarification is reusable, retains all
12 original reads and fits a 51,854-character corrective request under 96,000. It
plans one correction plus 12 independent checks, not another 46-request question
sweep. This is preflight only: no live calls or user-project writes were performed.

Follow-up correction: a coordinator that is **enabled but stopped** no longer
suppresses automatic question preparation after explicit manual processing or
definition refresh. The previous guard incorrectly treated the saved opt-in setting
as a running coordinator. Live-worker exclusion and coordinator-owned allowances
remain separate; manual processing does not resume or alter coordinator settings.
No data reset or previous-answer changes are needed. See
[compatibility](migrations.md#manual-clarification-with-a-stopped-enabled-coordinator-2026-10-28).

Correction verification: the enabled-but-blocked regression failed before the guard
fix and passes afterward. `npm run check`, `npm test` (323 pretests + 666 main tests),
the 46-test focused saved-response/assessment/coordinator run, focused Specification
browser check and diff check passed. The browser fixtures now preserve enabled/paused
coordinator settings through explicit manual recovery. Read-only local validation of
the reported saved state confirms a valid retained blocker, no other related input
gate, no previous format-3 attempt and a ready 23-batch/46-step exact clarification
plan. No user data, workflow grant/settings or provider allowance was changed; this
does not establish live question-generation success. Broader browser-suite selector
blockers documented below remain unresolved.

A retained exact saved-response `submissionBlocked` or rejected frozen-draft check
now triggers automatic questions-only triage, not repeated zero-request failures.
It reads the actual original inputs and treats both the rejected draft and blocker
as AI hypotheses. Only genuinely missing human precedence/exception intent produces
a new Design question with options. Technical limits or settled intent can return
no question; the failed draft is never silently approved. Preparation uses additional
AI allowance and the continuous exact clarification runner, not general gap discovery.

The original response and its completed evidence/check receipts stay saved. An
unanswered, deferred or delegated linked question prevents retrying that response.
Answer in Design, save/process the answer as usual, then continue the retained
response. The explicit answer permits a new draft/evidence plan without re-entering
the original input; earlier rejected work stays in history, not falsely current.
No original status is marked completed merely because a question was generated.
If preparation was stopped, **Continue clarification** resumes that task even though
its source response is still unfinished. Other related input conflicts still block it.
Reload/restart never repeats inference. See [compatibility and recovery](migrations.md#saved-response-conflict-questions-and-explicit-answer-recovery-2026-10-28).

Verification: `npm run check`, `npm test` (321 pretests + 666 main tests), UI build,
and the focused Specification browser check passed, including a retained conflict
producing a question without a Clarify click or original follow-up replay. A final
29-test saved-response/queue run also passed. The full browser suite was rerun:
layout and model-selection passed, then the same obsolete **Project map** selector
at `browser-check.ts:706` blocked the remaining sequence. No live calls or changes
to the reported user's project data were made.

For manual preparation/recovery, in **Specification**, expand **Let AI turn definition findings into Design questions**,
pick an area and choose **Clarify in Design → Prepare questions in Design**. The
confirmation explains AI usage; opening the control alone starts no call. An exact-evidence,
questions-only workflow reviews the area's current findings and exact evidence,
proposing up to three focused questions with answer options. It opens **Design** and
focuses a resulting question. Choose an option or type your own answer, then **Save
response**. Ordinary response consent/queue processing still applies; use **Continue
project** or **Process saved responses** when input is waiting.

Large manual clarifications use exact evidence batches instead of raising the
one-request limit. Every batch is read, then proposed questions are checked against
every batch before any questions publish. Requests target 96,000 characters;
ordinary preparation continues until finished, stopped or blocked, without a 32-request
or fifteen-minute action cutoff. Each request retains a five-minute timeout, finite
failed-attempt/evidence limits, rolling worker lease and stale-publication protection.
Design shows saved
read/check progress and **Continue clarification** after a pause/reload. Continuing
consumes allowance only for unfinished work; completed steps and spent attempts
persist. No requirement, assessment or pending saved response is resolved by this
read-only workflow. Indivisible or oversized supplemental evidence remains an
explicit blocker rather than truncated input. See the [migration ledger](migrations.md#resumable-exact-design-clarification-2026-10-25).

Paused clarification is also visible in **Processing & queue**, including its saved
step counts and a dedicated **Continue clarification** button. With no unfinished
saved input, the queue header prioritizes that continuation rather than offering
general discovery. The request retains the exact saved task; changed evidence or a
newer attempt rejects without silently restarting. Timeouts, failures and Stop still
require explicit continuation. Diagnostic exports now include these stage counts,
phase and next action instead of leaving the newer workflows unknown.

When retained responses need follow-up, **Process saved responses only** is the
primary queue action. It selects the saved inputs explicitly, performs no new
research and cannot proceed into gap discovery or unrelated clarification packages.
An exact saved-response semantic blocker can prepare its own Design question as
described above; this does not process unrelated saved input.
Answers need not be entered again. Concrete reconciliation answers without a narrow
requirement scope now use the same exact-batch overflow fallback; their original
broad authority is preserved. Question-preparation progress remains saved but its
queue continuation is disabled until unfinished input is processed or resolved.

If a saved step exhausts its four cumulative requests, ordinary processing does not
reset it. **Review additional allowance** opens a confirmation explaining the saved
work and scope. **Allow 4 more requests** grants at most four extra calls to that one
unfinished step (eight total), without repeating prior retrieval/completed steps or
starting research/gap discovery. Later steps retain their four-request limits.
Opening the confirmation or reloading grants nothing, and extra allowance does not
guarantee success. The exact-job consent and spend ledger survive reopening.

Saved targeted review follow-up is a separate workflow: an eligible review or
requirement-scoped answer that exceeds the ordinary 144k limit can now continue via
saved exact read/check batches. Use **Resume processing** or **Process saved
responses only**, not another submission of the same decision. No partial edits
publish; the original input, completed steps and spent attempts remain saved.
Processing shows bounded stage progress, while full receipts stay out of polling
snapshots. Research must be explicitly disabled for this fallback. See
[size recovery and limits](discovery-efficiency.md#oversized-targeted-saved-response-follow-up-2026-10-26).

Completed clarification ledgers that previously failed publication on a question
`localID` can use **Continue clarification** without another model request when
their evidence remains current. Publication validates the exact saved draft first,
then ignores unnecessary declaration aliases while assigning permanent question IDs;
it does not rewrite saved steps, evidence or options. See [compatibility](migrations.md#clarification-publication-aliases-2026-10-26).

Settled scope summaries need no reconfirmation. If no new product question is
established, Design shows the saved explanation instead of demanding a correction.
An unchanged completed result is reused without another request. Missing/indivisible
evidence and technical limitations remain blockers, not invented preferences. A new
reconciliation question can explain conflicting original rules and ask which governs
or is an exception, without choosing precedence or rewriting answers.

The latest stopped, explicitly blocked assessment for each active area still appears
under **Needs your decision**, with evidence and **Clarify in Design** as its primary
path. **I already know the correction** retains the optional manual note editor.
Earlier findings require refresh before submitting a new correction from them.
Saving/asking a question never marks an assessment resolved, approves a requirement
or starts coding. Inspect resulting specification updates and refresh affected
definition coverage after processing answers.

This uses existing assessments and the browser's recent job window, not a retrospective
full-history sweep or automatic bulk question-generation call.
A stopped review outside that window may need explicit refresh to become visible.
No SQLite schema, saved assessment identity or score changes; existing evidence and history
remain intact. The additive format-2 clarification task and preserved older receipts
are documented in [upgrade compatibility](migrations.md#area-clarification-and-assessment-inbox-correction-2026-10-25).

Area-clarification verification: all 884 tests (`npm test`: 227 pretests + 657 main
tests), type check, UI build and the focused Specification browser runner passed.
The browser fixture covers explicit consent, an answer-option question in Design,
save-only answers, a settled-scope no-question result and unchanged-result reuse,
plus mobile layout. Screenshots include
`.reqwizit-state/browser-definition-design-clarification-mobile.png`. No live model
calls or personal-project changes were made. The aggregate browser command still
stops at the existing **Project map** assertion noted below.

Earlier manual-path verification: all 878 tests (`npm test`: 224 pretests + 654 main tests), 65 targeted
UI/specification tests, type check, UI build, focused Specification browser runner (including
mobile, failed saves, filter draft retention and saved-response reload), and diff
whitespace check passed without live inference. `npm run test:browser` passed the
workspace-layout and model-selection runners, then stopped at the obsolete
**Project map** tab assertion in `src/web/browser-check.ts:706`; the aggregate
browser suite is not passing. The focused screenshot is
`.reqwizit-state/browser-definition-decision-mobile.png`.

## Unified run logs (2026-10-25)

**Application menu → Logs** automatically includes definition reviews and older
saved attempts alongside discovery and implementation diagnostics. **Overall progress
→ View logs** opens the same timeline. Filter by source/area/problems or load older
saved tasks; there is no extra assessment-log screen. New jobs record start/finish
times, old planning entries use already saved creation times, and available durations
are shown without guessing missing historical timing. See
[run timing and retention](workspace-navigation.md#unified-run-timeline-and-timing-2026-10-25).

Expanded **Log details** has a **Copy details** button at the top right. It copies
the available detail text with credential redaction (before display truncation),
and reports success or a manual-copy fallback if clipboard access fails. This is
presentation-only; saved data and migration formats are unchanged.

## Continue definition reviews through Refresh (2026-10-25)

Open **Overall progress → Refresh definition coverage**. Successful saved evidence
gathering is separate from failed/unfinished calls, so ordinary saved work continues
without navigating a recovery screen. If repeated failures exhaust the allowance,
Refresh asks inline for one additional request per listed area. **Continue refresh**
confirms AI usage and resumes the remaining normal steps after that step succeeds;
**Cancel** or reload starts nothing. Original evidence, calls and completed steps
stay saved, and genuine evidence/size blockers remain. See
[allowances and upgrade behavior](definition-coverage.md#refresh-resumes-saved-work-and-owns-extra-usage-confirmation-2026-10-25).

Progress-dialog actions use visibly bordered buttons with consistent padding and
44px minimum targets. Refresh/log and inline confirmation actions
align in equal-width desktop columns and stack on mobile. Focused recovery browser
checks verify alignment, wrapped-label heights, spacing and no horizontal overflow;
desktop/mobile screenshots are saved under `.reqwizit-state/browser-definition-recovery-*.png`.
No startup request or silent retry allowance is granted.

## Consolidated workspace (2026-10-24)

Specification now owns feature organization and requirement review; the separate
Project map requirement viewer is removed. Processing & queue focuses on unfinished
work. Technical disclosures and diagnostic exports route to **Application menu →
Logs**, while Overall progress owns assessment explanations and Activity owns saved
changes. See [workspace responsibilities and logs](workspace-navigation.md) for
boundaries, retention, compatibility and verification limits. Earlier descriptions
below of Project map, queue history or Technical details describe the preceding UI.

## Plain-language guidance

Main guidance now describes product decisions and next steps rather than internal
processing mechanics. Progress and error notices keep original diagnostics under
**Technical details**, with clearer outcomes and saved-work/recovery explanations.
Search labels use “features”; AI-generated prose has a shared plain-language policy
for future requests. Existing saved text and processing behavior are unchanged.
See [user-facing language](user-facing-language.md) for conventions and limits.

## Coordinated workflow preview

Continuation controls are consolidated: **Continue project** is the sole primary
queue/header action. With coordinated mode off, the header opens a scope/allowance
explanation before explicit enablement; merely opening it makes no model calls.
When enabled it resumes the existing bounded coordinator. Awaiting decisions shows
**Needs your decision**, with no duplicate Resume processing control. Manual scoped
processing, saved assessment recovery and exploration are under the queue drawer's
**Advanced actions**, using explicit operation names and unchanged allowances. They
remain available in advanced mode; mode selection stays in Project settings.

**Continue project** opts into project-wide coordination with eight requests/five
active minutes per explicit allowance. Project settings holds configuration;
Processing & queue holds status, Stop/pause and the decision inbox. Advanced
preferences survive, but legacy automatic maintenance is suspended while enabled.
Restart/shared-checkpoint adoption require explicit continuation. See
[coordinated workflow](coordinated-workflow.md) for readiness and remaining gaps.
`npm run test:browser:workflow` exercises the deterministic flow; screenshots are
`.reqwizit-state/browser-workflow.png` and `browser-workflow-mobile.png`.

Current unresolved definition checks can now produce targeted questions in the same
decision inbox, with answers triggering affected rechecks. This shares the existing
allowance and never marks a dimension resolved merely because a question was asked.
Evidence/technical blockers remain visible rather than becoming invented choices.

## Guided next steps and automatic maintenance

Workflow status and actions stay in Design, Specification, Overall progress and
Processing & queue rather than a duplicate **What’s next?** card. **Settings → Project
settings → Automatic maintenance** opts in to changed-area definition updates after a twenty-second
settle window, bounded at eight requests/five minutes/three areas per burst. Saved-input
processing keeps its separate consent setting, renamed **Automatically process saved
inputs**. A completed assessment no longer leaves a spurious idle Resume action.
Current evidence/compatible stages are reused, but delta-only assessment is not yet
implemented. No retrospective bulk sweep, automatic proposal approval, coding or
delivery; restart needs explicit resume. See [guided maintenance](guided-maintenance.md)
and the schema-6 [migration ledger](migrations.md#opt-in-guided-maintenance-2026-10-23).

Maintenance is project-specific and stored on this machine, not an app-wide or
repository-shared preference. Enable/disable and usage explanations are in Settings.
**Processing & queue** holds task status, blockers and pause/resume; Stop stays on
the current task. The **What’s next?** card has been removed entirely. The queue links directly
back to the settings section with keyboard focus; opening either view starts no calls.

Run `npm run test:browser:maintenance` for the deterministic guided flow, keyboard,
mobile and restart-consent checks; screenshots use `.reqwizit-state/browser-maintenance*`.

## Header activity feedback

Discovery is the overall question/specification workflow; its actions now describe
the next step explicitly. **Discover missing decisions** (formerly **Explore next
gaps**) finds missing decisions and asks follow-up questions in the selected feature
or all project areas. The same action is available in Design and in the top
**Processing & queue** bar when idle, including from other tabs. Both use the same
workflow handler, question target, scope and blocking rules; the idle bar shows scope.
Saved responses instead offer **Process saved responses**, and paused work offers
**Resume processing**. Saved responses are labelled **Saved · awaiting follow-up**.
When a saved exploration needs additional allowance, the header's **Continue
exploration** opens the existing review/confirmation rather than granting calls.
This is presentation-only: no saved schema, fingerprints, history or model budgets
change, and no forward migration or reassessment is required. Historical diagnostics
may retain the earlier labels.

Verification (2026-10-22): type check, UI build, 46 targeted UI tests, and the
workflow, saved-evidence navigation, portable and specification browser runners
passed (browser runners on Node 22.23.3), including idle-header feature scope,
cross-tab discovery, mobile width and continuation confirmation without inference.
The full `npm test` run had 631 passes and two failures in storage migration tests
(duplicate migration-history version and Windows SQLite cleanup lock). The main
browser runner stopped at a missing **Approve resolution** control in its refinement
flow; the aggregate browser suite is not claimed passing.

**Processing & queue → Discovery diagnostics** exports a bounded metadata-only JSON
report for selected recent discovery runs (initially the newest five). New runs
record planning/request timings, context sizes/counts and workflow matching counters.
Older timings remain unknown; running/interrupted measurements may be partial.
Export never starts inference or changes the specification. Original text, paths,
IDs, credentials and error prose are excluded, but counts/durations can still reveal
project scale: review the file before sharing. See
[discovery diagnostics](discovery-efficiency.md#export-a-representative-discovery-run)
for fields, limits and interpretation.

Foreground actions (including requirement review and saving answers) use a compact
spinner in a permanently reserved slot beside the header title. Activity starts and
finishes without adding a row or resizing the header. The action label remains
available through a status announcement and hover tooltip; multiple actions list
their labels in the tooltip. Detailed progress bars elsewhere are unchanged.
This is presentation-only; saved data and migration formats are unchanged.

All workspace modals use 60% of the viewport width and height rather than separate
narrow dialog limits.
Phones (540px and below) retain full-screen dialogs. Dialog bodies scroll while
their headings and close controls remain visible. This presentation-only change
does not affect saved data or require a migration.

## Continuous specification and decisions by exception

**Specification** replaces the Review tab. Explicit queued answers, notes and
targeted change requests can record/update requirements automatically, with an
expandable Design change summary and **Recorded from your answer** provenance.
**Current specification** shows active requirements; **Needs your decision** holds
ambiguous choices, conflicts, cleanup/resolutions and legacy proposals. **History**
retains earlier review outcomes. Use **Request changes** to correct current wording.
No separate approval or coding authorization is inferred from automatic updates.
Existing approvals and saved proposals are not converted on upgrade. The historical
Review instructions below still describe legacy/manual exception paths; eligible
answer-derived updates supersede their mandatory second-approval step. See
[continuous specification](continuous-specification.md) for exact boundaries and limits.

## Epic-first specification and implementation browsing

Specification and Implement show collapsed epic lists before their supporting
review/build controls. Expand an epic to inspect its requirements. Epic pagination
counts epics, not requirements; each expanded epic has its own independent
requirement pagination (10, 25 or 50 per page, initially 25). Hidden requirement
details are not constructed. Explicit requirement recovery opens the containing epic
and the correct requirement page; ordinary background updates do not open epics.

Both tabs provide case-insensitive, all-words search across epic IDs/names/purpose,
requirement IDs/wording/rationale and acceptance scenarios. Specification also
searches refinement wording and retained review feedback in the applicable views.
Search combines with existing feature, status and readiness filters, omits epics
without matches and resets pagination when the query or filters change. Review
drafts remain available when paging, collapsing an epic or changing search.
Implementation epic actions retain their full approved epic scope regardless of
the displayed search/status matches; the action includes an explicit scope note.

This is a browser-only projection change: SQLite, portable/project artifacts,
assessment fingerprints, evidence and saved jobs are unchanged. No forward data
migration or repeat model calls are needed.

The deterministic `specification-browser-check.ts` covers both tabs with 30 epics,
independent inner/outer pagination, search by ID/scenario/epic, empty results,
review draft retention, filters and mobile width. No live provider calls are used.
That check passed on 2026-10-22 using Node 22.23.3, along with the targeted UI
tests, full `npm test`, type check and UI build. The broader browser suite is tracked separately;
this focused check is not a claim that every legacy browser flow passed.

## Saved-response context blockers

**Refresh definition coverage** now runs continuously by default across the selected
pending areas—no shared fifteen-minute, ten-area or staged-action request cutoff.
Use the active header's **Pause assessment** control to stop; completed checks are
saved. Per-request five-minute timeouts, exact evidence/stage limits, spent attempts
and stale-result checks remain. Restart requires explicit continuation; automatic
maintenance and coordinated workflow retain their own allowances. See
[continuous refresh](definition-coverage.md#continuous-manual-refresh-by-default-2026-10-24).

**Overall progress → View assessment history** (also in Logs) reads saved definition
attempts beyond the recent-task window. Group/filter by area, distinguish failed
responses from pauses and evidence blockers, and open each earlier attempt's
**Failure details** or **View logs** link. Latest-per-area labels describe recorded
task order, not coverage freshness. Reading history never starts AI requests or
spends attempts; the metadata-only diagnostic export remains unchanged. See
[earlier definition failures](definition-coverage.md#finding-earlier-failures-2026-10-24)
for bounds, original-error display and verification results.

Definition coverage now shows area position, local preparation versus model waiting,
read/verification stages, saved work, evidence counts and ten-second elapsed-request
updates. Expand **Evidence in this request** in the assessment panel for bounded
record previews and shared/dependency context. Measured preparation/request timings
describe this run only. Oversized growing-draft requests try lossless unfinished-step
subdivision, preserving completed calls; stage totals may increase without increasing
the action allowance. Indivisible evidence still blocks explicitly. See
[progress and recovery](definition-coverage.md#explainable-progress-and-oversized-draft-recovery-2026-10-23).

For **Assessment outdated**, use **Overall progress → Refresh definition coverage**
rather than repeated gap discovery. It is shown as an accent-filled button;
per-area refresh actions use outlined buttons.
Both have a 44px minimum target, visible keyboard focus and full-width mobile layout.
This styling-only change does not affect saved data, freshness or model-call behavior.
Verified with type checking, UI build and the focused workflow browser runner,
including computed button styling, keyboard focus and mobile layout. The full
browser command still stops at the known **Approve resolution** assertion; no
live model calls were used.
Definition freshness now follows relevant saved inputs. Historical timeout receipts
distinguish the former shared fifteen-minute refresh window across
all areas from individual request timeouts, Stop and shutdown. Deadline stops show
**Paused—progress saved**; historical cancelled runs without a cause stay explicitly
unknown. Definition processing no longer inherits the generic **Discovery is paused**
footer. Resume retains completed stages and spent attempts without automatic calls.
The dialog shows assessment status separately from saved discovery package/blocker
counts. Refreshes assess whole current areas without changing the specification,
reuse current areas and use resumable exact batches when an area exceeds 96k. All
batches are read, then every batch checks the accumulated findings before publication.
New staged reading responses return only changed dimensions after the initial
assessment; unchanged findings remain saved. Refresh can pause before starting a
request estimated to outlast the remaining shared window, without spending a new
attempt. This reduces repeated output/wasted in-flight work, not verification or
evidence scope; live speed gains remain unqualified. Existing checkpoints upgrade
only at safe unattempted boundaries. See [definition coverage](definition-coverage.md#smaller-collection-responses-and-deadline-scheduling).
Single-record/stage-limit/missing-evidence blockers remain explicit; partial findings
never make coverage current. Paused/cancelled assessment Resume stays on assessment,
not gap discovery. A near-limit staged workflow
fallback trades draft capacity (8k rather than 12k) for exact evidence headroom; old
checkpoints retain their original policies. See [definition coverage](definition-coverage.md)
and the [migration ledger](migrations.md#definition-coverage-freshness-and-near-limit-staging-2026-10-23).

Workflow startup now reports **Preparing workflow evidence…** before a model request,
with local preparation counts and elapsed time. Expensive initial preparation runs
in an owned CPU worker so the API, **Stop**, and deadline remain responsive. It stops
at the first eligible package rather than preparing the whole backlog upfront.
Reports explicitly label examined-prefix counts; remaining packages are unassessed.
The default preparation deadline is two minutes, within the existing combined
discovery bound. Completed calls/attempt limits are preserved; progress itself is not
a completed check. Completed local planning groups now have separate exact-input
SQLite checkpoints: an explicit retry can reuse them even after restart, while the
unfinished group and pending model package prepare again. Progress shows how many
saved local groups were reused. Changes to planner inputs invalidate CPU reuse,
without discarding earlier model checks. See
[preparation details](discovery-efficiency.md#responsive-incremental-preparation-2026-10-22).

Preparation now also shows reviewed/waiting/blocked/eligible counts for the examined
prefix and reuse of intermediate contexts. Completed split siblings and exact staged
context probes can survive interruption inside an unfinished group. These are local
planning checkpoints, not new model reviews. Existing root checkpoints are preserved
by the schema-5 upgrade. See [intermediate reuse](discovery-efficiency.md#intermediate-preparation-reuse-and-explainable-progress-2026-10-22)
for cache bounds and the new timing diagnostics. Final gap outcome banners recognize
saved typed reports even after long preparation evicts the initial log message.

Staging now checks its existing target-only size gate before building the full
decision catalog, and reuses rendering only for exactly equal evidence closures
with identical task flags. Preparation progress/exported diagnostics distinguish
target-size, indivisible decision-size, batch-limit, context-limit, saved-evidence
and attempt-limit blockers; causes absent from older saved receipts remain unknown.
These counts cover the examined prefix and remain available after interruption.
See [staging optimization](discovery-efficiency.md#staging-cost-optimization-and-blocker-causes-2026-10-22).

The queue's **Resume processing / Process saved responses** action routes through
current server state: unfinished responses receive finite isolated follow-up; otherwise
Resume uses workflow discovery like **Discover missing decisions**, not legacy individual
checks. Selected-scope emptiness cannot trigger unrelated gap discovery. Existing
staged/headroom checkpoints and spent calls remain reusable without relabelling old
checks. See [Resume routing](discovery-efficiency.md#browser-resume-routing-2026-10-22).

Saved-response follow-up now applies the existing current-decision projection to
background guardrails: verified superseded plain approvals can be omitted, and
verified app-generated current cleanup/resolution receipts can expose their exact
approved decision without embedded old snapshots. Target and explicitly requested
supporting evidence retain original history. Human addenda, unknown review prose
and ambiguous supersession remain exact; genuinely oversized input still blocks.
Stored sources and decisions are unchanged. After restarting the updated app, use
the retained response's retry action rather than submitting it again. Retry replans
locally before any model call; this does not guarantee every oversized project fits.

Duplicate/conflict checks following an already saved response also receive the
144,000-character mandatory-only fallback when backed by their saved pending-pair
receipt. This fixes a mismatch where the response could finish at 111k but its
automatic check failed at 96k. Restart and **Resume processing** retries unfinished
checks without repeating completed response calls or re-entering answers. Ordinary
manual refinement keeps its existing bound. Failure messages now explicitly identify
the already saved response versus the unfinished check; evidence above 144k still
blocks without truncation. See [compatibility](migrations.md#saved-response-overlap-allowance-parity-2026-10-23).

If a single saved-response follow-up still exceeds 96,000 characters after the
existing compaction passes, it can now use a final **144,000-character mandatory-only
allowance**. Required human evidence remains intact; optional reconciliation candidates
and related-record hints cannot consume this additional space. Normal discovery,
gap exploration and help retain their existing limits. Larger evidence still blocks
before inference, and the allowance does not certify any provider's context capacity.

## Question-help context boundaries

Word explanations use a separate **definition-only** request (`define`), containing
the clicked word, its complete displayed text and the exact enclosing question
wording. The server checks that the text and word belong to the current question
or an option. It does not load the project's evidence chain, dependency guardrails,
other options or previous help merely to explain vocabulary. Definitions must not
recommend a choice, infer unseen decisions or invent a project-specific meaning;
ambiguous wording is identified explicitly. Saved legacy word explanations remain
visible, including their original revision. Requests can run while discovery or
implementation is active; waiting for that work would not reduce an oversized
saved evidence chain. No deferred-help queue is introduced.

The broader question help panel uses a dedicated question-local
context, not the discovery working-set planner. One 48,000-character application
input budget includes the current request, exact question/options, forward-linked
evidence, initial human input, current feature notes and project/dependency human
guardrails. Shared files and epic membership do not pull in unrelated records.
Generated summaries, coverage assessments, concept tooltip metadata and navigation
indexes are not included. Missing wider context must be stated, not guessed.

Up to six completed exchanges for the same question are included, newest last;
oldest exchanges are removed first if needed, with an exact omitted-exchange count.
Original help history remains saved. Mandatory evidence is never silently cut.
If it cannot fit even without history, a question-help-specific diagnostic is saved
before inference rather than advising users to split their project. Help remains
advisory, revision-linked, and independent of a running discovery/implementation job;
existing stale-result and cancellation checks still apply. Old completed help is
retained without replay; retrying a failed explanation is explicit.

## Application menu and header

The top-left **Application menu** replaces the persistent project sidebar. It offers
**New project**, **Open project** (the existing portable-project opening flow),
**Recent workspaces**, and **Settings**. Recent workspaces lists all saved local
projects, including those without a connected folder. Recently selected projects
come first; projects not yet selected retain their existing newest-created order.
The selection history is a bounded browser-local preference, separate from project
state, and survives reload. Older installations need no project migration.

The menu supports Tab, arrow keys, Home/End, Escape and outside-click dismissal.
Choosing an action closes it; Escape returns focus to the menu button. The header
fills the viewport width and uses the selected accent color with automatically
contrasting title/menu text. Processing and progress controls and Resume/Stop buttons
use subtle accent-tinted backgrounds and borders, contrasting text and meters, and
visible hover/keyboard-focus states instead of bright surface-colored cards. Their
behavior is unchanged; opened dialogs retain normal workspace surface colors.
Settings' back link is below the header. This styling change needs no data migration.
The compact header aligns processing and overall progress in matching-height panels,
with Stop/Resume grouped inside the processing panel. Task headlines and detail lines
truncate visually rather than expanding the header; full task details remain in
Processing & queue. Question totals and local-code findings remain in the progress
breakdown rather than the header. Smaller, evenly spaced tabs retain their counts.
At narrower widths, processing moves below project identity and progress. This is
presentation-only: saved project data, appearance preferences and jobs are unchanged.
The whole header uses a scoped accent palette: the application-menu dropdown,
recent-workspace list, selected/hover/focus states, separators, activity widgets,
tabs and count badges all follow the selected preset or custom accent. Text and
indicators use its contrasting foreground. Portaled dialogs and the workspace
below the header retain their normal palette; saved appearance settings are unchanged.

The Design, Review, Implement, Project map and Activity tabs occupy a second row
of the sticky header, below current processing and project progress. The tabs blend
into the accent background, with contrasting text/counts and an underlined, subtly
highlighted active tab. Reduced desktop padding, vertically centered project identity
and a wider progress card keep the header compact without hiding summary information.
Progress summary lines remain separate instead of running together. The tabs remain
visible while scrolling on desktop and mobile and are hidden in Settings and
project creation. Tab counts and navigation are unchanged. This layout-only
change does not affect persisted data or require a migration.

Only the content below the header/tabs scrolls; the scrollbar no longer extends
alongside the header. Its thumb follows the selected theme accent, with a workspace
background track. The viewport-sized layout also accounts for the desktop titlebar.
Settings and project creation use the same content scroller. No saved-data changes
or migration are needed.

All content below the header shares a horizontally centered, 1100px maximum-width
container, including Settings, page navigation, notices and foreground progress
feedback. Symmetric scrollbar gutters preserve centering relative to the header;
panel-specific vertical margins and internal text alignment are unchanged. This is
layout-only, with no saved-data or migration impact.
The header's workspace tabs are also horizontally centered, including each wrapped
row on narrow screens; tab order and navigation remain unchanged.
Header tab-row centering assertions passed at 390, 1000, 1440 and 2666px, along
with type checking, UI build and diff checking; the broader browser run still
stopped later at the missing **Approve resolution** button described below.

Centering verification (2026-10-22, Node 22.23.3): new browser assertions passed
for Settings/navigation, creation/foreground progress at 390, 768, 1440 and 2666px,
and the active workspace at 390, 1000, 1440 and 2666px. Type check, UI build,
55 targeted UI tests and the specification browser runner passed. The broader
browser runner later stopped on a missing **Approve resolution** button; the
portable runner stopped on a duplicate **Open shared checkpoint** selector. Those
flows are not claimed as passing for this change. No model calls were used.

Verification (2026-10-21): type check, UI build and browser/portable-browser
checks passed (browser tests on Node 22.23.3), including all five tabs staying
fully visible below processing controls after scrolling at 1440px and 390px.
The existing Vite chunk-size warning remains non-blocking; no inference was used.
The compact/accent-tab follow-up also passed type checking, UI build and full
browser/portable-browser checks on Node 22.23.3, including 1440px, 2666px and 390px
sticky-header layouts, contrasting tab text/active underline and desktop height
below 220px with processing controls visible. No persisted formats, preferences or
freshness rules changed; no data migration is needed.
Accent-tinted processing/progress controls also passed type checking, UI build and
browser/portable-browser checks on Node 22.23.3 at those three viewport widths,
including contrasting summary text, spinner and progress fill (no inference).
Whole-header palette verification also passed type checking, UI build and full
browser/portable-browser checks, including application-menu text, focus outline,
recent-workspace separators across all 12 presets and a custom accent. The existing
Vite chunk-size warning remains non-blocking. No data formats changed.

Desktop users also get **Quit**, using the same safe shutdown as closing the window,
without a confirmation or tray mode. It is hidden in regular browsers, which cannot
reliably close user-opened tabs. Saved data is retained; unsubmitted text is not saved.

Verification (2026-10-21, Node 22.23.3): type check, all 555 deterministic tests,
UI build, browser/portable-browser checks, and the reliability, focused retrieval,
saved-evidence navigation, retrieval-pilot and epic-review browser runners passed.
Menu coverage includes keyboard/outside/Tab dismissal, focus restoration, mobile
layout, malformed older preferences, recent selection/reload, all 12 accent themes
and custom accent color. Desktop Quit/window-close smoke checks passed against an
independently staged build; see [desktop verification](desktop.md#verification).
No live inference was used. The existing Vite chunk-size warning remains non-blocking.

## Understanding project progress

The processing header describes current work, queued responses, pauses and responses
needing attention, rather than promoting saved background outcomes to current status.
With nothing running or waiting it shows **Ready when you are**. Previous assessment,
implementation and discovery outcomes remain available in **Processing & queue**.
This is presentation-only; saved jobs and evidence are unchanged.

The header shows saved answer counts and current local complete/partial counts as
well as the existing overall estimate. Its breakdown separates **Questions answered**,
**Local implementation**, **Definition coverage**, **Requirements review**, and
**Verified delivery to main**. Questions in active areas count immediately; retired
questions are excluded, while deferred/delegated questions remain unanswered.

Missing definition assessments show **Not assessed**; outdated assessments show
**Assessment outdated**, without a coverage meter. Small task-sized discovery passes do
not refresh whole-area coverage. These labels do not establish missing decisions.
The overall estimate retains its existing equal-weight calculation using saved
definition coverage, review, and main delivery (unassessed coverage counts as zero).
Local completeness uses current approved-requirement assessments only; unknown,
unassessed and stale results are distinguished from missing code. Neither local
code nor manual claims certify delivery to main. This presentation change performs
no model calls, data upgrades or automatic reassessments.

The definition breakdown separates current critical gaps from previously flagged
critical areas needing rechecking. Unassessed areas say **gaps unknown**, never zero
gaps. Counts refer to critical coverage categories, not individual missing requirements
or unanswered questions; **No open questions recorded** is not a completeness claim.
Expand **Inspect definition assessment** within an assessed area to read all nine
categories, their status/importance, saved explanations and exact linked evidence.
Outdated assessments retain their original revision and are labelled as previous
findings rather than confirmed current problems. Current unresolved critical categories
say **Critical area needs clarification**; the UI does not manufacture more specific
findings than the saved explanation supports. Unavailable evidence is explicit.
Freshness still compares whole-project revisions: unrelated revisions can make an
assessment outdated. Relevant-input freshness and dedicated definition-refresh actions
remain follow-up work; this clarity change does not add inference or alter evidence.
Verification for the clarity change: type check, all 555 deterministic tests, UI
build, full browser/portable-browser checks and diff whitespace checks passed.
Browser coverage includes expanding a definition category and its linked evidence,
unknown-gap wording and mobile layout. Tests ran under Node 22.23.3; the default
Node 20 shell could not load the installed Node 22 SQLite binary.
Verification: type check, all 451 deterministic tests, UI build and full browser
checks passed on Node 22.23.3. Browser checks include separate answer/local sections,
live local-checkpoint updates without main credit and mobile progress layout.

## Moving between Design and Review

### Compact discovery and predictable review pauses (2026-10-22)

Design has one **Discover missing decisions** button, using epic workflow discovery, beside
a compact **Questions ready** input (1–50, default 5). The existing per-project
browser preference is retained. This is the project-wide unanswered-question target,
not a count of additional questions; final-package overshoot and bounded runs remain
unchanged. Details live in the tooltip and Processing & queue rather than a large
explanatory card. The question-target control and inline legacy continuation appear only in Design;
the idle header also offers the same discovery action from other tabs.
saved-job continuation also remains in Processing & queue. Review is for requirement
decisions, changes and linked clarifications, not starting gap discovery.

While discovery/scanning owns a live project snapshot, Review shows **Project
processing—decisions temporarily paused**. This is a project-wide restriction, not
a claim that each displayed requirement is being rewritten. Requirement decision
buttons and change-request submission are unavailable, while cards, evidence and
review notes stay accessible. Related queued input also pauses the affected decisions;
failed related processing is labelled **Needs attention**, not an endlessly active
update. Use **Process blocking input** or Processing & queue for the next step.

Finishing, cancelling or failing a worker releases its live-worker lock; other
clarification/input blockers still apply. Unchanged eligible items become actionable;
changed wording/evidence retains the existing comparison and note. A fresh decision
click is required. The UI no longer invites approvals to be queued during an unsafe
processing window. Existing durable submitted reviews still follow their original
storage/queue safety checks; no saved decision is erased or replayed by this UI change.
Submission-time checks remain authoritative for races between a render and a click.
Allowing unrelated decisions during active workers requires a separate enforced
write-scope/publication change and is not implemented here. Formats and fingerprints
are unchanged; see [compatibility ledger](migrations.md#compact-design-discovery-and-review-pauses-2026-10-22).

Verification (2026-10-22, Windows Node 22.23.3): type checking, all 573 deterministic
tests and the focused 23-test Review rerun passed. Production UI build, reliability,
main workspace, portable-project, legacy retrieval/navigation/pilot and epic workflow
browser runners passed, including a full `npm run test:browser:all` rerun, with
deterministic adapters and no live inference. Browser
fixtures verify paused map/Review clicks create no queued or failed attempt, retained
notes, fresh decisions after processing, Design-only controls, target persistence and
desktop/mobile layout. Screenshots: `.reqwizit-state/browser-design-controls.png`,
`browser-design-controls-mobile.png`, and `browser-review-paused.png`. Legacy browser
fixtures explicitly use the authenticated individual-check API rather than pretending
the consolidated workflow button still selects that strategy. The existing >500 kB
Vite chunk warning remains non-blocking. No data rewrite or live qualification ran.

### Shared modal behavior

Project progress, Processing & queue, and View & resolve use one shared modal
shell: centered rounded panels, consistent header/close controls and backdrop,
and a thin internal body scrollbar that cannot cover the rounded corners. Panels
retain content-appropriate widths; on mobile they fill the viewport. Processing
& queue is now centered rather than a right-edge drawer.

Close, Escape, and clicking outside dismiss the top modal and restore focus to
its opener. Inside clicks and drags starting inside do not dismiss it. Opening
View & resolve over the queue keeps the queue open and the page scroll-locked
until both are closed. Closing a modal does not stop background work.
These changes affect presentation only; saved data needs no migration.

Verification (2026-10-21): type check, all 497 deterministic tests, UI build and
full browser checks passed (tests on Node 22.23.3). Browser coverage includes all
three modal shells, backdrop/Escape dismissal, drag safeguards, fixed headers,
focus restoration, keyboard containment, mobile layout and nested scroll locks.
The existing Vite chunk-size warning remains non-blocking.

### Find and resolve processing problems

**Needs attention** in Review and **Processing & queue** is an all-project inbox,
grouped by stable requirement/question ID (notes remain separate). Its count is
affected items, not failed attempts. Entries show the current wording and current
decision blocker; previously saved diagnostics do not establish today's blocker.
The inbox and attempt history are paginated.

Each inbox item names its next step: **Answer question**, **Process blocking input**,
**Review requirement** / **Review changes**, or **Retry processing** (context-size
problems use **Review context**). These open the exact item in a focused dialog;
opening it does not submit a decision or start processing. The dialog bypasses feature,
review-status and page filters without changing the underlying view. It shows current
wording, acceptance scenarios, evidence, linked clarification editors, processing and
review/change-request actions using the existing Review checks. Related pending
refinements/resolutions are available in the same focused view. Problem activity entries
for saved responses offer the same shortcut; requirement changes in activity details
offer **View current requirement**. Job/execution-level problems retain their existing
queue/implementation recovery paths rather than inventing a requirement target.

Answer any clarification, use **Process blocking input** when automatic processing is
off, then review the updated information and explicitly submit your decision once. The
dialog does not automatically retry inference or reapply an old approval/rejection.
Review drafts survive closing/reopening the resolver within the current browser
workspace; reload clears unsent drafts. Escape, Close, or clicking the backdrop returns
focus to the previous control, including when opened over the queue drawer. Scrolling
is contained in the dialog body below the fixed header, preserving rounded corners.
Clicks inside and drags starting inside the dialog do not dismiss it. This is a
presentation-only change with no persisted-data or migration impact.
The corner/backdrop follow-up passed type checking, UI build, diff checks and the
full browser check on Node 22.23.3, including backdrop dismissal, focus/draft
restoration, inside clicks, inside-to-backdrop drags and body-only scrolling.

Once a later approval/rejection is applied with saved source evidence, earlier failed,
unapplied decision conflicts become history automatically—even opposite decisions or
attempts containing notes. No old note is applied. This does not wait for AI follow-up:
the later decision's own unfinished/failed processing remains visible separately. Later
wording changes or a new decision cannot resurrect those old failed attempts; the
current requirement can still need a fresh review. Unapplied change requests and
unfinished overlap follow-up are not automatically dismissed.

For existing stuck items, **Dismiss old attempts** at the top of the dialog dismisses
eligible failed attempts for that requirement together (up to 1,000 per action).
It preserves every note and does not change requirements, questions, saved decisions
or unfinished processing. **Undo dismissal** restores only that batch while the dialog
remains open. Neither action starts a model call. If notes still describe wanted changes,
submit them through **Request changes** rather than dismissing them as obsolete.

Expand **Saved attempts & notes** for original wording, notes, timestamps and historical
diagnostics. **Archive attempt… → Confirm archive attempt** moves only an unapplied,
conflicting review to history. It preserves the original input/diagnostic, does not
answer or retire a question, and cannot archive an applied decision or unfinished
follow-up. Remaining clarifications stay accessible in Design and the requirement.
Proven resolved attempts remain visible as **Resolved · history only**; old diagnostics
do not establish a current blocker. Reviewed history also retains original notes.

See [upgrade compatibility](migrations.md#requirement-level-attention-cleanup).

Attention simplification verification (2026-10-21, Node 22.23.3): type check,
all **497 deterministic tests**, UI build, full browser checks and diff checks passed.
Coverage includes opposite failed decisions with retained notes becoming history,
no resurrection after later edits, protected failed/unfinished follow-up, transactional
bulk dismissal/Undo across SQLite reopen, authenticated API bounds and a full Undo
batch fitting the 128 kB request limit. Browser checks exercise the next-step labels,
preserved rejection notes, one-click dismissal, Undo without restoring an earlier
individual archive, unchanged linked questions, reload, focus and mobile layout.
The final shared 1,000-attempt bound was type/test/build checked after the browser run;
the browser fixture uses three attempts. No live model calls or user-data cleanup ran.
The existing approximately 553 kB Vite chunk warning remains non-blocking.

Verification (2026-10-21, Node 22.23.3): type check, all **496 deterministic tests**,
UI build, full `npm run test:browser` and diff checks passed. New coverage includes
650-reviewed-item exact targeting, bounded 600-item attention paging, cross-feature
dialog access, retained notes across close/reopen, original correction history,
explicit archive/reload, queue-overlay Escape/focus, mobile width and inline answer →
manual follow-up → explicit updated-context acknowledgement. No live model calls or
user-data cleanup were performed. The approximately 550 kB Vite chunk warning remains
non-blocking. Screenshot: `.reqwizit-state/browser-focused-resolver.png`.

Design and Review are views of the same evolving specification, not sequential gates.
Review remains available while Design has open questions. **To review** shows scoped
readiness counts/filters: **Ready to review**, **Needs a decision**, **Updating**,
**Changed since review**, and **Needs attention**. The initial expanded card prefers
ready work on the current page; a selected card stays open as its information changes.
All items remain accessible with **All**. These labels describe deterministic decision
availability, not semantic completeness or implementation readiness.

Explicitly linked pending/deferred/delegated clarification questions can be answered
inside expanded requirement and refinement/resolution cards using the existing Design
editor, options, advisory help, draft handling and durable answer submission. Design
links remain available. A queued answer displays its processing state instead of a
second editor. Approval is disabled while an explicitly linked choice is unresolved;
reading, notes and rejection remain available under the existing safety rules.
**Process blocking input** resumes the actual blocking submissions'
feature scope, even if a linked question belongs to another feature; blockers spanning
multiple features resume the project queue. Automatic-processing preferences still apply.

An opened Review requirement captures a transient copy of its displayed wording,
scenarios and evidence basis, even before a note is typed. When relevant information
changes, the card retains the note, displays previous wording/scenarios or explains a
context-only change, and lists new relevant supporting evidence. An **Updated since you
started reviewing** warning appears immediately above the decision buttons. No separate
acknowledgement is needed: Approve, Reject or Request changes uses the currently
displayed revision and retains the note. Submission-time checks still prevent a decision
from applying to information changed after that display; old decisions are never replayed.
This is a comparison with the current browser review, not a reconstructed historical
snapshot or an exhaustive semantic evidence diff. Reloading clears these transient drafts
and comparisons; durable submitted notes/history remain recoverable as before.

Verification (2026-10-21): type check, all 512 deterministic tests, UI build and full
`test:browser` check passed (runtime checks on Node 22.23.3). Coverage includes warning
placement, wording/context-only updates, retained review/change-request notes, decisions
using the displayed revision without acknowledgement, failed-submit retention and the
focused resolver. The existing Vite chunk-size warning remains non-blocking.

Approval/rejection still require current evidence, worker ownership and transactional
storage checks. No approval is automatically reapplied after an answer. Targeted change
requests and the narrower scope rules below avoid treating independent input as a
feature-wide blocker. Independent specification publication during discovery remains
future work.
No data migration or inference replay is required; see [the migration ledger](migrations.md#inline-review-clarifications-and-readiness).
Verification (2026-10-21): type check, all **466 deterministic tests**, UI build,
full `npm run test:browser`, terminal/spike help smoke checks and diff checks passed
on Node 22.23.3. Browser coverage includes inline clarification → explicit processing
→ retained note/context comparison, linked-choice approval blocking without blocking
rejection, readiness filtering over 500 requirements, previous-wording comparison and
Project map note recovery after viewing Review without typing. The previously stale
processing-header test now expects the documented **Ready when you are** idle state;
completed no-call-reuse evidence remains checked in the queue. No live model calls
were made. The approximately 531 kB Vite chunk warning remains non-blocking.

## Request changes without approving or rejecting

Expanded active requirements in Review and Project map offer **Request changes** with
a separate, required **Requested changes** editor. **Send change request** saves that
exact feedback as its own durable review intent; it never also approves/rejects the
requirement or submits the separate optional approval/rejection note. Draft feedback
survives closing/reopening the editor, paging, and explicit acknowledgement of updated
context within the current workspace. Reload still clears unsent drafts.

The existing automatic-processing preference applies. With automatic processing off,
use **Process saved responses** (or **Resume processing** if paused) to process the saved request. While running, current worker,
pending-input and relevant-evidence checks remain enforced. Linked unanswered Design
questions do not themselves block a request for a revision; they still block approval.
Stale/conflicted feedback is retained for an explicit new submission, not auto-applied.

Follow-up is target-specific:

- An unapproved requirement can be revised in place, preserving its ID/evidence and
  remaining unapproved.
- An approved requirement keeps its existing wording and approval; its replacement is
  proposed under **To review / Refinements**. Compare **Saved change requests** and
  explicitly approve the replacement or keep current wording.
- Ambiguous intent can produce a linked clarification or an explanation of what remains
  open. The app does not manufacture a design answer or require a cosmetic revision.
- Requests cannot withdraw/reject requirements, archive features, revise unrelated
  items, reorganize the project or change global interpretation. Broader changes need
  their existing explicit decision paths. No automatic pair-check run is added solely
  for a change request.

History and Processing & queue distinguish **Changes requested · no approval or
rejection** from actual decisions. A failed follow-up retries without creating a second
feedback source. Completed requests and original notes survive reopening without model
replay. Existing approval/rejection addenda retain their earlier semantics; they are not
silently reclassified. See [upgrade compatibility](migrations.md#targeted-requirement-change-requests).

Verification (2026-10-21): type check, all **479 deterministic tests**, UI build,
full browser checks, terminal/spike help smoke checks and diff checks passed on
Node 22.23.3. Browser checks exercise separate Project map feedback drafts, required
feedback, cancel/reopen retention, updated-context acknowledgement without losing either
editor's text, unapproved revision, unchanged approved wording until explicit replacement
approval, saved-request comparison/history and mobile layout. Screenshots:
`.reqwizit-state/browser-change-request-proposed.png` and
`.reqwizit-state/browser-change-request-approved.png`. No live model calls were made;
live generation for this intent is not yet qualified. The existing approximately 536 kB
Vite chunk warning remains non-blocking.

## Narrower blockers and bounded answer follow-up

Sharing a feature no longer automatically makes **targeted** work a blocker for every
requirement there:

- **Request changes** affects its target, explicit shared-question/source relationships,
  and dependent/shared areas, not an independent same-feature sibling.
- Newly queued answers can carry a server-captured **targeted answer scope** when the
  question explicitly cites only active requirement IDs in its own non-shared feature
  (at most eight, including known consumers of earlier answers). Corrections remain
  targeted only when the prior answer has matching scoped provenance. Direct legacy
  answer paths and older unscoped responses are not retroactively reclassified.
- Unlinked/source-only questions, project/shared questions, general notes and legacy
  approval/rejection addenda remain conservative. Shared clarifications, explicit source
  ownership, dependencies, target changes and pending pair comparisons still block the
  affected decisions. No lexical/AI independence guess authorizes a decision.

For scoped answers the exact linked requirements enter mandatory context. Runtime
schemas/prompts and transactional publication limit follow-up to those records and
eligible linked questions/replacement proposals. It cannot create unrelated requirements,
retire questions, change shared/project interpretation or organize other features. New
clarifications stay in the original feature and link a target. Broader human requests
remain saved verbatim; follow-up explains that they need **Add information** rather than
silently applying them. Design, inline Review questions and Processing & queue identify
targeted answer scope. Deferral/delegation still cannot establish a confirmed preference.

An independent review can be queued while scoped inference runs and apply afterwards
without another human submission when its own evidence is unchanged. Direct writes still
wait for every live discovery/scan worker, including another process: jobs still publish
against a whole-project revision. Failure/manual pause remains a queue-level pause and
requires explicit resume; it does not authorize automatic inference retries. A failed
scoped response alone is not an unrelated requirement's decision blocker.

New evidence/check keys are scope-aware. Older review bases, proposals, pair verdicts and
individual no-change checks retain original provenance and can be reused when equivalent,
without redoing model calls solely for this workflow change. See [the compatibility
ledger](migrations.md#narrower-decision-blockers-and-scoped-answer-evidence) for formats,
legacy snapshot verification and conservative missing-provenance handling. Saved outcomes
are not upgraded into proof of semantic consistency or project readiness.

Verification (2026-10-21, Node 22.23.3): all **491 deterministic tests**, full browser
checks and the UI build passed. The browser scenario verifies targeted scope notices,
independent same-feature readiness, manual processing preferences, a review queued during
scoped inference, and application afterwards without resubmission. Screenshot:
`.reqwizit-state/browser-narrow-blockers.png`. Type checking and all **31 decision-
availability tests** passed again after the final scope-capture optimization. No live
model calls were made. The approximately 542 kB Vite chunk warning remains non-blocking.

## Typing in Design and Review

Design question cards and Review requirement/refinement cards now display their own
submission or processing errors, including on collapsed cards. Failed requirement
follow-up stays in **To review** even if its decision was already applied. Its
**Resume discovery** action retries follow-up, not the human decision; scope follows
the selected feature, and the existing queue remains available for diagnostics.
Unapplied conflicting reviews show the current blocker and **Open blocking clarification
in Design** directly on the requirement; expanded cards also offer inline clarification
answers. Answer with **My answer**, process follow-up,
then review and resubmit the retained decision/note. Deferral/delegation does not settle
that choice. If the blocker has cleared, the card says so instead of treating a saved
historical diagnostic as the current state. No decision is automatically reapplied.
Request failures retain drafts and no longer force navigation to Processing & queue.
Verification: type check, all 462 deterministic tests, UI build and diff checks passed.
Browser checks passed the new in-card error and saved-note recovery assertions, then
stopped at the previously documented unrelated processing-header expectation (**Saved
gap checks reused** versus **Ready when you are**). The full browser suite did not pass.

Review's **Anything to add?** editor keeps keystrokes local and retains the latest
draft in the queue without rerendering the whole review list on each character.
Submission reads that latest draft; paging, review recovery and automatic display
of updated requirement context preserve it. Existing submission-time stale-review checks remain.
Design answer edits reuse unchanged word/concept explanation elements instead of
rebuilding them on each character. Text updates immediately, without debouncing.
These changes address code-level rendering hotspots; no measured typing-latency
improvement on a user's live project is claimed.
Portable Node 22.23.3 ran all 453 deterministic tests successfully. The first type
check passed; a later check encountered a concurrent `findLast`/library-target
error in `src/storage/decision-availability.test.ts`. The browser run passed the
typing, latest-note submission, paging retention and stale-draft checks before an
unrelated processing-header assertion expected **Saved gap checks reused** instead
of **Ready when you are**. The complete browser suite is not recorded as passing.
System Node 20 could not load the installed Node-22 SQLite module.

## Discovery alias failures

Model-created epics, questions, requirements and research findings share one response-local
`new:` alias namespace. Exact repeated new-epic declarations are collapsed without changing
their references; conflicting epic definitions, cross-kind alias collisions and malformed
aliases reject the round before alias allocation or pending-decision updates. Diagnostics
identify the offending field and, for collisions, the original declaration, without echoing
model values. The discovery prompt explicitly describes the shared namespace.

Saved submissions remain intact. After updating/restarting the app, explicitly resume
discovery to request a corrected response; do not re-enter answers or reset project data.
No automatic live retry was performed. Type check and all 453 deterministic tests passed
on Node 22, including alias collision atomicity, identical declaration/reference handling
and explicit corrected-response retry. Live model behavior remains unverified.

## Exploring gaps in large projects

When shared project/dependency decisions exceed the normal package target, new work
can now use **staged decision review**. Exact guardrails are split into bounded
batches; drafts are checked against every batch before any questions/requirements
publish. Processing & queue shows drafting/checking progress, saved stage counts and
total attempts. Saved v1 staged contexts retain their 72k ceiling, including drafts.
New otherwise blocked indivisible leaves can use `staged-headroom-v2`: exact evidence,
stage instructions and the full 12k draft reserve must fit the existing 96k ceiling.
Above-72k requests show reduced headroom explicitly. Old stages/attempts remain intact;
old local size blockers are reconsidered on explicit Resume without resetting data.
An indivisible oversized evidence chain still blocks explicitly; nothing is silently
summarized or deleted.

One click now continues a staged package through up to **32 requests or fifteen
minutes**, instead of pausing every six calls. **Stop** preserves saved stages.
Intentional budget stops show **Paused—progress saved**, not failed analysis; Resume
continues unfinished stages. Restart never starts calls, and reloading during a live
run does not start a second worker. This removes babysitting, not model-call cost:
a sixteen-batch package still needs 32 successful stages. The request bound is per
package; existing ten-package/fifteen-minute queue-action limits remain. Staged review does not
support research or extra file loads; indispensable missing facts block, and enabled
research is explicitly rejected. Compatible saved reviews keep their old policy.

New workflow exploration proactively targets **72,000 characters** for its full
context package, including workflow instructions, within the existing 96,000-character
ceiling. It applies safe compression before splitting, including lossless sharing
of repeated phrases, and defers static file motivation when necessary. The remaining
24k is headroom for evidence growth/explicit loads, not a promise every file fits.
Runtime/schema overhead and provider token limits are separate.

**Epic workflow review** in Processing & queue shows context use, headroom and the
available evidence allowance (or largest prepared package/above-target counts for a
no-call report). Indivisible mandatory human constraints can exceed the soft target:
the reduced buffer is explicit, not hidden by dropping decisions or increasing the
hard cap. Compatible saved reviews, stages and spent attempts keep their original
context policy and are not repeated just to optimize their representation. No
automatic refill or startup model calls are introduced.

Oversized workflow contexts now try a minimum-package fallback that defers static
file contents while retaining exact requirements, scenarios and human constraints.
Omitted requirements have compact navigation previews, not evidence-authoritative
summaries. The explorer can request exact displayed file IDs within its existing
one-batch allowance; oversized explicit loads still block. All-blocked runs say
**Gap exploration blocked**, and expanded blockers include section sizes and largest
exact record IDs/sizes. Large human sources are never silently truncated or replaced
with summaries. Restart the updated app and explicitly select **Explore next gaps**
to reconsider previously local size blockers. See [workflow recovery](epic-workflow-review.md).
Blocker diagnostics respect the existing saved-report length bound and visibly mark
shortened diagnostic text. Identical failed-job/progress errors appear once in
Processing & queue rather than under both the gap outcome and last-round failure.
Distributed project-wide approval history has an additional lossless fallback:
canonical approval snapshots can reference the identical exact requirement wording
and scenarios already loaded, retaining the original decision and entire addendum.
This reduces duplication without summarizing human decisions or raising the input
limit. Unknown or mismatching historical prose remains intact. Existing completed
checks retain their evidence identities; explicitly retry exploration after restart.
For packages still just over the bound, a final fallback compacts repeated
app-authored instructions/encoding explanations and explicitly omits a long generated
advisory summary. It does not shorten human input or raise the limit. The full
workflow envelope, not just its evidence working set, must fit before inference.

**Discover missing decisions**, in Design or the idle header, starts combined, epic-scoped reviews.
It prepares exact linked evidence locally, reviews up to six related records across all
three lenses together, and permits only one extra evidence batch before final review.
Declared dependency-boundary packages follow workflow packages. Select a feature to
restrict scope. It has separate reviewed/waiting/blocked progress in **Processing & queue**
and preserves all legacy checks. Manual epic reviews leave queued responses paused;
use ordinary Resume to process them. See [epic workflow review](epic-workflow-review.md)
for grouping limits, upgrade compatibility, recovery and outstanding live qualification.
The retained API/terminal per-record path described below is unchanged; it is no
longer a competing main browser button.

After the initial interpretation, legacy individual-check exploration works from a durable task
backlog rather than loading a whole feature. Requirements offer three bounded lenses:
workflow/behavior, failures/recovery, and acceptance boundaries. Questions and human
notes offer one behavior lens. These are opportunities to investigate, not a checklist
that must all be run to finish a specification. Choose a feature to restrict the scope.
An explicitly selected empty feature can start from the original idea and its saved
purpose, without inventing a new evidence record or changing the original input.

**Design → Questions ready** selects a project-wide stopping threshold
from 1–50 (default 5), remembered per project in this browser. **Explore next
gaps** continues through sequential workflow packages
until the threshold is reached, no eligible packages remain, or the run reaches
10 packages / 15 minutes. Questions appear after each validated package publishes.
The target is not an exact quota or a hard output cap: four pending plus three
useful questions becomes seven, then scanning stops. The model is not asked to
invent questions to fill the target. Existing five-per-response schema bounds
remain; the old five-pending aggregate restriction is bypassed only for explicitly
targeted gap packages. Other discovery/follow-up can still save zero-question
results when the project already has more than five pending questions.

The feature filter restricts packages, not the project-wide pending count. Stop,
failure or stale publication ends the run without undoing earlier saved packages;
restart never restarts inference. Saved submissions take priority in ordinary
discovery; responses arriving during a package pause scanning for explicit follow-up.
No background auto-refill is enabled. API/terminal calls without a question target
retain their one-package policy. Completed checks and spent request allowances are
reused without being reset when the target changes.

Epic-review continuation was corrected on 2026-10-22: new pending questions stay
out of requirement/note grouping and boundary pairing. Workflow-specific questions
that also cite a shared source no longer act like global discovery blockers.
Directly affected workflows and genuinely unscoped/global questions still wait;
the separate human approval safeguards are unchanged. A deterministic browser
regression verifies ten selected, three questions per package, four packages and
twelve retained questions within one epic.

By default each task makes **at most three model request attempts across explicit retries** (initial
interpretation keeps its existing one-request path). Compatible completed checks are reused,
including after restart. Unresolved target-linked questions wait for a concrete answer;
deferral/delegation does not settle them. If everything in the selected scope is already
checked or waiting, the app explains that outcome **without calling the model** or
creating a specification revision. New proposals add tasks without automatically
replaying unrelated completed work. Human input conservatively reopens affected feature
and dependency scopes; an unrelated feature edit or an advisory summary/revision change
does not. Rescans reopen checks because evidence currentness may have changed.

The current-decision view preserves exact current wording/scenarios and all original
human notes. Proven superseded plain approvals can be omitted from a request, but never
deleted from history. App-generated cleanup/resolution receipts can show verified current
approval facts instead of their embedded old snapshots, only when they exactly match a
saved accepted proposal and current requirement. Source/proposal IDs remain explicit.
Older human addenda and unknown review prose stay intact, even after a later plain
approval; conflicting intent still needs clarification. Omitted history cannot be cited.

**Processing & queue → Gap exploration backlog** shows checked, pending, waiting and
context-blocked counts for that exploration's input scope/revision, plus whether a model
request was attempted. Counts are not a live completeness score. Up to twenty candidate
packages are checked locally per package-selection pass. Oversized tasks retain their evidence and are
recorded as blocked so later tasks can proceed; changing their scope reconsiders them.
Queued-response follow-up, scans, question help and Refine keep their separate policies.

These are adjacent-gap passes, not whole-feature reviews or proof of completeness.
Unrelated history is explicitly omitted/indexed and cannot support new decisions.
Global interpretation and whole-feature coverage are unchanged by partial passes.
After updating/restarting the app, retry **Explore next gaps** explicitly; upgrading
never automatically resumes a failed call or replays completed responses.

Deterministic checks include a 1,000-requirement catalog, repeated SQLite reopening,
failure/cancellation/staleness, legacy-check adoption, exact human addenda and unsupported
future formats. Browser checks exercise three lenses followed by no-call reuse, reload
and mobile layout (`.reqwizit-state/browser-gap-backlog.png`). Live semantic quality and
live-provider retrieval quality remain unqualified. The staged protocol is described below.

### Bounded exact-evidence stages

The [deterministic first-query baseline](retrieval-baseline.md) measures fixed queries over
1,487–5,987 saved records through the real service/checkpoints. It retains intentional
paraphrase, distractor, field/window/scan and oversized-load failures; completing a job does
not imply the desired evidence was retrieved. It changes no search semantics or budgets.
The [offline candidate comparison](retrieval-evaluation.md) adds field-aware/ranking/sampling
experiments and a second domain. It records regressions as well as gains; density-ranking
and sampling policies remain disabled in browser search.
The [prefix-preserving merge evaluation](retrieval-merge.md) now exercises auxiliary-field
gains through real service/checkpoints and legacy receipt reuse, without enabling the
candidate during that evaluation or changing budgets. A [default-off browser pilot](retrieval-browser-pilot.md)
now exposes explicit, tab-local manual opt-in, policy/limit/omission UI and switch-back reuse.
Terminal and automatic workflows retain default search. Independent relevance review is pending.

Gap tasks can defer saved static-file motivation instead of requiring the entire file
closure up front. Human constraints/addenda, current decisions and applicable guardrails
stay exact in **every** stage. Index labels, related-record hints and unseen source links
are navigation, not authoritative evidence. A model can request up to eight displayed,
unseen record IDs in a strict `retrieveEvidence` envelope instead of returning proposals.
The app loads exact saved records and their human dependencies in a fresh context, keeps
previously loaded evidence, and independently rejects unseen citations/changes.

Loading a shared workspace excerpt does not automatically include other requirements
merely because they cite that file. Explicitly requested requirements and their evidence,
previously loaded evidence, and mandatory human guardrails remain included. This avoids
turning a file lookup into an oversized review of unrelated requirement histories.

Before a new model request, the app can expose up to 32 additional exact saved IDs
mentioned only in quoted explanations as `quotedRecordNavigation.recordIDs`. Candidates
must exist in the saved project, be omitted from detailed evidence, and occur as whole
IDs in the current package. Existing structured handles are not duplicated. These hints
use only spare context space and never displace evidence or expand a budget. Ordinary
prose strings are not automatically retrieval handles; only the explicit navigation list
offers these references. As with search handles, exact retrieval is still required before
citation or changes. Invalid requests identify duplicate, already-loaded, unavailable or
not-offered handles; unknown model-supplied strings are not echoed as record IDs.

This does not restore attempts already consumed by a failed call. A six-request task is
still exhausted and incomplete; retry does not gain another allowance. **Explore next
gaps** skips matching six-attempt checks without a saved final response and selects another
pending check. This applies to the same target/lens/evidence key and saved model/connection;
unrelated revisions do not reset the blocker. A genuinely changed evidence/scope key can
create new work, but the original failure and six attempts remain in history.

The backlog separates **request-limit blocked** from context-size blockers and lists up
to 20 exhausted checks with their target/lens. They do not count as checked or complete.
If the selected scope contains only blocked or waiting tasks, the app reports that without
inference or a specification revision. Saved final responses still follow publication
recovery without another model call, even when their six attempts have been spent. Tasks
at three attempts keep the existing explicit **Continue exploration** option. Startup
never starts another task automatically. The navigation browser check covers routing away
from a legacy exhausted check, retained history, reload and mobile layout
(`.reqwizit-state/browser-gap-exhausted.png`). Live discovery quality remains unqualified.

If relevant handles are absent from those indexes, the model can instead return ONLY
`{searchEvidence:{format:1,query:"quartz archive",limit:8}}`. This searches omitted saved
project requirements, questions, sources and research, including historical records, not
the filesystem or internet. Query length is 1–160 characters with at most twelve literal
whitespace-separated terms; all must match, case-insensitively. Regex syntax has no special
meaning. Matching examines IDs, epic IDs and bounded prefixes of requirement statements,
question/source text or research findings, in saved order (requirements, questions, sources,
research). It does not search every field, use embeddings, or rank semantic relevance.
At most 5,000 records and 1,000,000 text characters are examined per search; each text prefix
is at most 4,096 characters. Results contain 1–8 requested maximum handles (possibly zero
matches), kind/epic and labels of at most 180 characters. Records unavailable for exact
loading in this context are not offered. Displayed results are **navigation only**:
`retrieveEvidence` must explicitly load selected handles before citations or changes.

Search and exact loading **share**, rather than extend, the two navigation stages and
three cumulative model attempts. Search → load → analysis fits. Repeated searches, failed
requests or oversized results may leave insufficient budget to load and analyze; retries
do not reset it. Mandatory human constraints remain exact even in the search-result request.
The queue shows saved search handle counts, further prefix matches omitted, unexamined
records, prefix-limited text and failure blockers. These are local bounds, not an exhaustive
search claim or a specification-completeness measure.

#### Search refinement and bounded continuation

New search results may include `page: {format:1, snapshotRevision, scopeKey, limit,
recordOffset, textOffset, moreText, inputCursor?, next?:{cursor,recordOffset,textOffset}}`.
To request the offered next window, return the strict search envelope with the **same**
query and limit plus `cursor: savedEvidenceSearch.page.next.cursor`. Only a cursor returned
by a saved stage of this task is accepted; arbitrary offsets, invented cursors or cursors
from a different query/limit/scope are rejected. No client-supplied path or network URL is
followed. Unknown/stale handles retain original receipts and explain their blocker.

Ordering is the original revision's saved order (requirements, questions, sources,
research). Continuation reads that immutable revision even after unrelated edits add or
reorder today's navigation. It advances to the first omitted prefix match or unexamined
record; after that record pass, it can advance to the next 4,096-character text window.
Earlier deferred text is retained across result pages. Whole text windows are deferred,
not partly skipped, when the one-million-character cap is reached. Previously offered
handles are not re-offered on continuation. A new query **without** a cursor refines search
from the beginning of the current snapshot instead; it still costs a navigation stage.

Every page retains the eight-result, 5,000-record and one-million-text-character bounds.
The local text-window range is at most sixteen windows (offsets 0–61,440). Matching is
within individual windows; terms split across windows, other fields and deeper text can
be missed. Queue status shows the original snapshot, record/text-window position,
continuation availability and omissions. No next cursor means only that none is offered
within these local bounds, **not** that saved evidence or the specification is complete.

There is **no additional model allowance for paging**: search → page → exact load leaves
no request for analysis under the existing three-attempt cap and is explicitly blocked.
The page's labels cannot substitute for loading. Compatible retry reuses receipts and
cumulative attempts without generating new cursors for legacy receipts. The ability to
page does not reopen completed gap checks or invalidate implementation assessments.

There are at most two completed navigation stages and three total adapter attempts,
including failed requests across retries. Context targets 48,000 characters and has a
96,000-character hard evidence cap; final saved output also has a 96,000-character cap.
Oversized human constraints or cumulative evidence block; they are never silently
summarized, truncated or forgotten. The existing five-minute job deadline still applies.
Research is opt-in under the existing permission profile (at most four tool calls per
adapter request, twelve across a three-request task); saved-record retrieval itself uses
no tools, arbitrary paths or network access. Direct-provider research remains unsupported.

#### Explicit additional exploration allowance

When a saved gap task has used all three attempts without a final response, **Continue
exploration** appears in the workspace. It first explains the cost and limits; **Allow up
to 3 more requests** grants one additional allowance for that exact saved task. The same
action is available directly beside the failure in **Processing & queue**, without closing
the dialog. When only an exhausted gap task remains, its ordinary **Resume discovery**
button is hidden to avoid repeating the unchanged blocker. Waiting responses retain their
separate Resume action. Cancel makes no request. This is distinct from following a saved search page's continuation
cursor. Ordinary **Resume** / **Explore next gaps** never grants extra calls or resets spent
attempts.

The grant raises the task's lifetime ceiling to **six attempts and five navigation stages**.
Failed/cancelled calls count, and no second grant is available. Saved navigation stages are
reused with their original revision/session/evidence; an unsuccessful, uncheckpointed
request may need to be made again. The continuation keeps its saved model, connection,
research permission and search policy. It does not process waiting submissions or
automatically start another gap task. Each explicitly started job retains its five-minute
deadline and cancellation controls. Research remains at most four tools per adapter
request (at most 24 across a fully granted task); evidence stays capped at 96,000 characters.

The API validates the expected revision, source project/task, latest failed attempt,
current evidence and model before granting. Changed evidence can still block reuse;
navigation labels never authorize decisions. Restart does not infer or grant anything.
The durable receipt and attempts survive restart; ordinary retries reuse their remaining
allowance. Reaching six requests still blocks without declaring completeness.

Deterministic tests cover legacy exhausted jobs, repeated reopening, stage reuse, spent
attempts, grant duplication, model/revision/ownership checks and authenticated requests.
The navigation browser check exercises confirmation/cancel, a successful additional exact
load/analysis, reload, retained history and mobile layout
(`.reqwizit-state/browser-gap-allowance.png`). Live continuation quality remains unqualified.

Processing & queue shows saved navigation stages, cumulative request attempts and failure
blockers. After an interruption, click **Explore next gaps** explicitly in the same scope.
The app reuses committed stages with matching authoritative evidence/model/research
permission, including across unrelated specification revisions; it does not repeat
compatible completed calls. Original wire hashes and model-call revisions stay saved. A
schema-valid, citation-checked final response is checkpointed before normal transactional
publication and can be reused after publication interruption. Publication still performs
all existing reference/revision/lease/approval checks. Invalid references never authorize
changes. Startup/reload never resumes inference. Relevant human or target changes create
a new task identity. Changes to already retrieved supporting constraints block saved-output
reuse; old results remain available, never silently applied or replayed.

Cross-revision reuse excludes only revision labels, advisory previous interpretation,
navigation indexes/hints, the navigation epic map, omitted-record counts and advisory
saved-search results. Lossless wire encodings are expanded before comparison;
exact displayed human text, records, task lens,
feature/dependency scope and retrieval policy remain binding. A previously displayed handle
can still load its exact saved record after unrelated additions move its hint out of the
bounded index; this does not authorize citations before its contents are loaded. Older
checkpoints without the new basis are adopted only after rebuilding their immutable input
revision and verifying the original exact wire hash. No startup rewrite is needed.
Search checkpoints keep their original results even when today's labels/order/matches
change; retries do not silently rerun searches or claim those labels are current facts.
Loading a returned handle uses today's exact saved evidence. Once loaded, changed evidence
still prevents reuse of later completed calls. Missing handles block rather than redirect.

Processing & queue displays source/retry revisions and the number of reused stages/final
responses. A reused result still faces current reference, pending-question-budget and
revision/lease publication checks. A rejected publication consumes no task check. Failed
attempts still count toward the three-request limit across revisions; unrelated edits and
repeated clicks do not reset it. A concurrent edit during retry still makes the worker
stale, even if that edit itself would permit another explicit compatible retry.

The loader and lexical search read saved evidence only, not uncaptured files, arbitrary
text ranges or a semantic search index. Loaded evidence is cumulative: this is **not** a way to divide
mandatory human constraints into lossy summaries or process an unbounded evidence union.
Only displayed handles are requestable. Exhausted request budgets require a meaningful
scope/evidence change, not repeated clicks. Crash-before-checkpoint model responses cannot
be recovered automatically; a later explicit retry may need another bounded attempt.
Retrieved facts never become user preferences, and finishing a lens never certifies
completeness. Browser recovery coverage includes saved-stage failure, explicit retry,
reload/no-call replay, preserved records and mobile layout (`browser-gap-retrieval.png`).
Run `npm run test:browser:retrieval` for the independently runnable deterministic
retrieval UI/API scenario (`browser-gap-retrieval-focused.png`), without the full suite's
unrelated tooltip timing dependency. It uses an in-memory database and no model calls.
`npm run test:browser:navigation` separately exercises an undisplayed handle search,
durable search interruption, cross-revision explicit retry, exact loading before analysis,
shared request budgets, omissions/blocker text, reload, preserved history and mobile width
(`.reqwizit-state/browser-gap-navigation.png`). Both focused browser checks and the full
browser suite passed on 2026-10-20 with this extension; the known tooltip timing flake was
not reproduced or fixed. Live-provider search quality and semantic entailment remain
unqualified; structural citation validation cannot establish the truth of model prose.
The continuation extension adds an isolated second browser project checking original-
snapshot paging across unrelated revisions, shared-budget exhaustion, displayed blockers,
reload without budget reset and mobile width (`browser-gap-continuation.png`). Its first
run timed out waiting for Design after a reload; an independent diagnostic-enabled rerun
passed. This is not evidence that the reload timing issue is fixed. The full browser suite
and focused exact-retrieval scenario passed on this extension; the tooltip flake did not
reproduce. Available verification at that stage still used Node 20.11 rather than Node 22.12+.

### Browser startup and verification reliability

Saved workspace snapshots no longer depend on the project list finishing first. Previously,
the initially empty sidebar list was treated as proof there were no projects, so a loaded
saved project could show the new-project form with no Design tab while listing was slow or
failed. Listing now has a separate in-memory loaded flag. A known selected snapshot renders
its tabs immediately; the automatic new-project form appears only after a successful empty
list with no selected project (or an explicit **New project** action). API errors remain
visible. No saved evidence, selection key, approvals, assessments or request budgets change.

`npm run test:browser:reliability` runs controlled startup orders rather than random sleeps:
snapshot before list, list before snapshot, a poll overtaking an older load, selection changes
while an old response is held, failed listing with a usable snapshot, cold loading and a
confirmed empty list. It verifies zero model calls and preservation of original snapshots.
This reproduced the list-dependent missing-tab state before the fix. The exact cause of
the previously uninstrumented navigation timeout cannot be established retrospectively.

Tooltip verification now distinguishes two input preconditions. Escape dismisses an open
hover, but focusing another element does not move the pointer: a second `hover()` over the
same trigger may emit no new enter event. The test explicitly leaves/re-enters. Touch uses
a current locator target instead of cached coordinates that can go stale when repository
detection moves the activity bar. A trial hover checks visibility/stability/hit testing;
the subsequent tap intentionally bypasses Playwright's enabled check for the app's
`aria-disabled` explanation button. Assertions still require disabled state, visible
explanation, keyboard/touch dismissal and **no assessment execution**. The focused check
reproduces the Escape precondition, stale coordinates after a deliberate layout shift,
blur-timer cancellation and keyboard/touch behavior. Tooltip product behavior is unchanged.

Use `npm run test:browser:all` to build once and run reliability, full workspace, exact-
retrieval, saved-navigation and default-off pilot scenarios sequentially. Do not run individual build-and-test
scripts concurrently against the same `dist/web`: Vite replaces assets that another running
fixture may be serving. No whole-test retries or longer assertion timeouts were added.
Full/reliability/navigation failures save `.json` diagnostics and `.png` screenshots under
`.reqwizit-state/browser-{full,reliability,gap-navigation}-failure`. Diagnostics retain at
most 100 browser/network failure events, selected fixture ID and rendered tabs, without
request headers, cookies, response bodies or URL queries; error messages are redacted.
Expected injected API failures may also appear in these fixture diagnostics.

Windows Node 22 verification uses an isolated clean repository snapshot and separate
dependencies, not the user's database or the checkout's Node 20 native modules. The official
portable Node **22.23.3 win-x64** archive was checked against its published SHA-256:
`2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`.
It is unpacked under the approved OpenCode temporary directory, without changing global
Node, system/user PATH or shell configuration. `npm ci` succeeded with Electron binary downloading
disabled (desktop packaging is not part of this check); all **417 deterministic tests**,
type checking and both terminal `--help` entry points passed on Node 22.23.3. UI production
build and the complete serial `test:browser:all` command also passed on that runtime.
The final outcomes and compatibility assessment are recorded in the
[migration ledger](migrations.md#browser-startup-readiness-and-verification-isolation-2026-10-20).
The initial Node 22 full browser run reproduced the touch-tooltip failure; the first
locator-tap test revision also correctly refused the intentionally disabled control until
the enabled-check exception was made explicit. Neither failed run is counted as passing.
The existing large-JavaScript-chunk warning and clean-install audit's eight moderate
dependency findings remain; no dependency upgrades or live provider probes were performed.
Specific startup/input failure modes now have deterministic regressions; these passes do
not prove that all timing failures are eliminated. The checkout's original Node 20.11
installation remains unchanged; the focused reliability check also passed there.

## Repeated questions and overlapping requirements

### Direct duplicate removal and outdated proposal recovery

**Remove as duplicate…** is available in the Review toolbar, expanded active
requirements (including Reviewed), and pending refinement/resolution cards. Select
the record to remove and the requirement to keep, compare their **current** wording,
scenarios and evidence, then confirm. This is a human decision with no model call:
the survivor remains byte-for-byte unchanged, including its approval status. Unique
scenarios on the removed record are not automatically merged into the survivor.
The removed requirement becomes rejected, retaining its stable ID, original evidence,
implementation history and a rejection source/review note referencing the survivor.
Pending proposals involving the removed record are dismissed; previous revisions
remain readable. Pending relevant human input must finish first. A changed revision
requires explicitly reviewing the updated records rather than silently submitting
against a newer snapshot.

Outdated cards explain whether the primary/related requirement or broader human/
feature context changed. They expose **Dismiss outdated proposal** and **Refresh
this comparison** (or **Refresh this requirement** for individual wording). Refresh
checks only that pair/requirement using current evidence; it does not run broad
candidate retrieval or repeat other completed tasks. Successful non-blocked results
retire old stale proposals in the same transaction as publication. Failed, cancelled,
stale, malformed and blocked checks retain the old proposal for retry/dismissal.
Saved jobs/results survive restart; inference never automatically resumes on startup.
Distinct/no-change outcomes appear in saved job history and Processing & queue, not
as an invented replacement proposal. Existing completed-check reuse is unchanged.

Freshness remains conservative: feature/dependency human input can contain broader
product constraints. This change explains that invalidation and provides local
recovery; it does not ignore those decisions or change persisted fingerprint semantics.
Deterministic tests cover direct removal, revision/input guards, exact survivor/history
preservation, repeated SQLite reopen, and targeted refresh publication/failure/cancellation/
staleness. Browser checks exercise stale-pair refresh, explicit dismissal availability,
model-free removal and mobile layout. These checks use fixtures, not live inference.

### Automatic targeted checks after answers and reviews

When an ordinary concrete answer or requirement review finishes discovery, the queue
compares affected/new/changed requirements with related active requirements across
features. It schedules at most three strongest uncached lexical candidates per response,
not every project pair. Proposed and needs-review requirements can participate, but
their AI wording is not confirmed human intent. Rejected records and archived features
are excluded; a proposed replacement for a rejected record can still be checked.
Notes, deferrals and delegations do not trigger this additional stage.

Checks use the same resolution proposals and targeted clarification questions as Refine.
No resolution changes either original until **Approve resolution**. Processing & queue
and submitted-review history show checked/skipped/remaining counts and additional
unscheduled candidates. A skipped pair is not a new semantic verdict; lexical retrieval
can miss differently worded conflicts, and this is not a completeness guarantee.

Discovery and its original review response are saved before pair calls. Failure,
cancellation or interrupted-worker recovery pauses for **Resume discovery**, retaining
human decisions and completed pair work without replaying successful discovery.
Automatic-processing preferences still apply: saved responses get these checks when
their follow-up is processed, not simply when viewing Review. Legacy completed responses
are not backfilled or reprocessed. No live semantic-quality qualification is claimed.

### Resolve candidates through Refine

Use **Review → Refine requirements** for both wording cleanup and duplicate/conflict
resolution. The separate **Check approved requirements for duplicates and conflicts**
section was removed. Choose **All project areas** for project-wide checks; a selected
feature limits Refine to pairs touching that feature, including cross-feature
counterparts and their full evidence. Only approved requirements in active features
participate in pair resolution; proposed, rejected, needs-review and archived-feature
records are excluded from that explicit stage (unlike automatic targeted checks above).
Refine checks candidate approved pairs first,
then unfinished individual wording tasks, using bounded AI requests.

- **Resolution proposed** appears under **To review / Refinements**. Compare both
  originals, both sets of scenarios, the proposed wording and cited supporting decisions.
- **Approve resolution** applies exactly the reviewed changes together. Consolidation
  retains one stable requirement ID with combined behavior/evidence and rejects the
  redundant record; its ID, original wording, evidence and history remain. Coordinated
  corrections replace both requirements and keep both approved.
- **Keep both unchanged** dismisses the proposal without editing either requirement.
  A changed target, relevant human input, clarification or dependency context makes an
  old proposal outdated; it cannot be approved. Pending human input must be processed first.
- If intent is ambiguous, AI asks one targeted question in **Design** instead of choosing
  between human preferences. A concrete queued answer automatically returns to that
  pair check when processing runs (or when resumed if automatic processing is off).
  Resulting fixes still require approval. Deferred/delegated answers do not settle intent.

Each Refine action runs at most **20** unchecked pair calls; progress explains how to
continue with another Refine action. Candidate retrieval retains at most 200 eligible
pairs per pass; previously completed/pending/dismissed pairs are filtered before that
bound so subsequent actions can reach later candidates. A current pending resolution
prevents competing pair proposals or fresh independent cleanup against either record.
Approve/dismiss pending work, answer clarification questions, then refine again for
remaining overlaps. Unchanged completed pair checks and dismissed fixes are reused;
failed/cancelled work resumes only explicitly. No-change individual cleanup checks
from earlier app versions remain valid and are not replayed for this workflow change.

**Processing & queue** now shows refinement stage counts and a measured progress bar:
**Step 1 of 2 · Checking overlaps**, then **Step 2 of 2 · Wording cleanup**. Counts
advance after successful saved checks, not when requests start; model activity does
not replace the stage counts. Percentages describe the current stage of **this run**,
not an exhaustive audit or a time estimate. Preparation is indeterminate; ineligible
work can be skipped and further overlaps can remain after the 20-call cap. Stopped,
failed and blocked outcomes retain partial counts without marking unfinished checks
complete. These counters are in-memory telemetry: page reloads can recover them from
the running server, but server restart discards them. Durable check reuse and explicit
retry behavior remain unchanged.

Verified with the 296-test deterministic suite and Playwright browser checks, including
live 0/3 → 1/3 → 3/3 wording counts, accessible progress values and the completed outcome.
No live model calls were needed for these presentation/orchestration checks.

Checks preserve exact pair evidence, applicable human guardrails and linked clarification
history within the existing hard context bounds. Missing/oversized evidence blocks the
task rather than dropping decisions. Five pending questions remains the project-wide
limit; blocked clarifications explain the prerequisite and remain retryable. Lexical
retrieval can still miss paraphrases; model reconciliation is advisory, not a guarantee
of complete or correct conflict resolution. Live resolution quality is not yet qualified.

Resolution proposal citations use an explicit basis-specific **source-ID allowlist** in
both the prompt schema and publication checks. Requirement IDs motivate clarification
questions but cannot substitute for source IDs on a proposed fix. Superseded evidence,
deferrals/delegations, unknown/out-of-context IDs and repeated citations are rejected;
workspace observations cannot establish a human-decision basis. Diagnostics identify
the offending `resolution.evidenceIDs` entry and reason without echoing source text.
After a stopped resolution check, restart an older running app to load updates and use
**Refine requirements** again. Saved approvals/input and compatible completed checks are
retained; no data reset or automatic repeat model call is required.

Verification (2026-10-20): type checking, all **268 deterministic tests**, the UI
build, Playwright browser checks and diff checks passed. Resolution checks cover
atomic consolidation/coordinated correction, both-target/context staleness, missing or
out-of-task evidence, pending human review, cancellation/context bounds, question limits,
clarification-answer routing, bounded/resumable calls, legacy/new proposal reopening and
rejection of future formats without overwriting saved jobs, and source-only citation
allowlists/diagnostics with explicit retry. Browser checks exercise Refine as the sole
check action, all-feature scope, dismissal, reviewed consolidation and ambiguous
intent → Design answer → proposed fix → approval. Screenshot:
`.reqwizit-state/browser-resolution.png`. Tests used the available Node 20.11 environment;
the development baseline remains Node 22.12+. No live model calls were made.

### Discovery safeguards and individual comparisons

Discovery now retrieves up to twelve related-record navigation hints from the whole
saved project, including older answered, retired and rejected records outside the
recent index. Ranking uses at most 24 current task/working-record texts; it is lexical,
not embedding-based semantic search. Hints use only spare context space (at most
8,000 additional characters), never displace mandatory evidence or authorize new
citations, and are omitted when they cannot fit. Suspected already-covered decisions
should wait for focused discovery rather than be inferred from incomplete labels.
New decisions should explain their distinct scope or changed/conflicting evidence.
Question help, refinement-only passes and scan prompts keep their existing context
policies; this retrieval applies to ordinary discovery and queued follow-up.

Duplicate wording checks now ignore repeated whitespace and terminal sentence/question
punctuation as well as case. Internal punctuation, operators, numbers and negation
are preserved. Near matches are **not** automatically blocked, merged or deleted:
opposite rules can look almost identical. New close matches produce advisory notices
with record IDs under **Design → Latest changes**. The expanded requirement in
**Review** shows **Possible overlaps or conflicts**, with up to three cross-feature
comparisons, statuses, scenarios and supporting decisions. This also works for
existing records under Reviewed without repeating model calls. Use review notes to
request a correction or clarify a conflict; existing review/revision safeguards apply.

Limits: lexical matching can miss paraphrases and flag legitimate related rules.
There is no semantic conflict verdict, automatic project-wide cleanup or guarantee
against repetition. Exact duplicates still reject a discovery round atomically;
saved human responses are retained. Historical data and approval/freshness remain
unchanged; see [compatibility details](migrations.md#discovery-wording-similarity-safeguards-2026-10-20).

Verification (2026-10-20): type checking, all **247 deterministic tests**, UI build
and Playwright browser checks passed. New deterministic checks cover old
out-of-index retrieval, hard budgets/citation boundaries, opposite rules, unchanged
evidence, Review rendering and repeated SQLite reopening. No live model calls were
made, so reduction in actual model repetition has not yet been measured. Browser
checks also open opposite-rule comparisons, verify mobile width and reload, and
assert that comparison does not mutate the saved project.

## Operation availability and disabled-action explanations

### Keeping waiting review items current after processing

Successful response completion now reconciles the existing waiting review list in the
same SQLite transaction as publication. Changes are visible on the next browser poll;
each affected item shows **Updated after processing**, **Supporting context updated**,
or **Proposal withdrawn after processing**, with a reason, job, saved-response IDs and
revision under **Why this changed**. Activity also records the per-item outcome.

The existing response call may return version-1 `pendingChanges` to revise an unanswered
question or an unapproved requirement in place, or withdraw a **never-approved** proposed
requirement. Revised wording still needs human review. A withdrawn requirement keeps its
ID/text/evidence and rejected storage lifecycle, but Review labels it **Proposal withdrawn**,
not a human rejection. Previously confirmed behavior cannot be withdrawn by this path;
approved/rejected requirements keep the existing human-review protections. Ordinary plain
approvals, deferrals, delegations and workspace facts alone cannot authorize these changes.
Multi-requirement comparison clarifications keep their exact wording/routing; they are
answered or retired through the comparison workflow rather than repurposed in place.
Each change must cite current concrete human input from this batch in detailed context;
original supporting links are retained separately. Competing operations, invented/out-of-context citations and
updates/retirements against unfinished human responses reject the round atomically.

The queue retrieves at most **four** related pending candidates from explicit links or
lexical similarity and adds them to the current response's context only if their entire
evidence fits. Shared project notes can retrieve across features; other responses stay
within their feature/dependencies unless explicit links identify another feature. This
does not combine submissions, add a separate model call or force oversized optional work
into the response. Omitted candidates cannot be changed. Lexical selection can miss
paraphrases and model decisions remain advisory, not a completeness/correctness guarantee.

A deterministic completion pass also notices changed supporting context, including human
input applied **before** inference began. It withdraws affected outdated refinement or
resolution suggestions from actionable review while keeping them under **Reviewed** with
an explicit automatic-withdrawal explanation. Human dismissals remain distinguishable.
Known generated comparison questions can retire when a newer comparison supersedes them
or their exact pair leaves active scope, but only with original job provenance and no
unfinished/saved answer. Generic questions are not retired simply because related records
changed; context notices do not establish that a human choice is resolved.

Question and requirement editing drafts remain intact. Changed question wording **or
options** requires **Use draft with updated question** before submitting; current browser
answers reference the reviewed saved revision, letting storage check the exact question
fingerprint so an old tab cannot silently answer newly changed options. Retired questions
with unsaved drafts remain visible as **Draft retained**
and can be saved as a project note. Failures, cancellation, expired leases, stale results
and blocked pair outcomes do not perform completion reconciliation. Startup/reload does
not retrospectively sweep old work or repeat model calls. See the
[compatibility ledger](migrations.md#completion-linked-pending-review-reconciliation-2026-10-20).

Verification (2026-10-20): type checking and all **343 deterministic tests** passed.
The UI build and Playwright browser checks also passed, including completion-time
updates/withdrawals, retained question drafts, changed-question acknowledgement and
reload without repeated inference. Screenshot: `.reqwizit-state/browser-review-completion.png`.
The build retains a non-blocking approximately 508 kB main-chunk warning.
Live-model reconciliation quality remains unverified; these fixtures establish workflow
and validation behavior, not semantic completeness.

### Decision safety during queued work

#### Earlier failed attempts resolved by later reviews

Failed plain approval/rejection attempts no longer remain actionable under **Submitted**
when a later completed human review of the same story and decision is still current.
They appear under **Reviewed** as **Resolved · history only**, explain **Already approved
by a later completed review** (or rejected), and offer **View approved story** instead
of asking the user to approve again. Processing & queue excludes them from attention
counts and retains them under replaced-response history. Merely navigating to Reviewed
does not change a decision. Existing matching attempts reconcile on reload; new ones
reconcile as the successful follow-up completes.

The shared read-only check requires the later review's real, non-superseded human
source, completed follow-up, current matching statement/rationale/scenarios/feature,
matching decision and durable later submission order. A later explicit review can
replace a plain failed attempt at older wording; the original attempt is never
represented as having approved the new wording. Notes, opposite decisions, applied
failed follow-up, unsupported fingerprints, changed current requirements or missing
provenance remain actionable. No records, warnings or input are deleted or rewritten.
Startup does not pause an otherwise idle queue merely for these resolved attempts;
existing explicit pauses/failures are not cleared and no model work is resumed.

Verification (2026-10-20): type check, all **367 deterministic tests**, UI build and
Playwright browser checks passed. Coverage includes duplicate failed approvals for two
stories, current/historical wording, rejection, genuine notes, SQLite repeated reopen
with exact payload preservation, startup without inference, browser polling/reload,
attention counts, viewing the approved story and mobile layout. Screenshot:
`.reqwizit-state/browser-resolved-reviews.png`. User data was inspected read-only:
the three reported attempts classify as resolved, leaving zero actionable reviews.
This does not fix the separate oversized whole-feature **Explore next gaps** context.

#### Current blockers and retained review recovery

Submitted conflicting reviews now show a read-only **Current review recovery** check.
Their original warning remains under **Previous attempt diagnostic (saved history)**,
not as a claim that an already-answered question is still unresolved. When the blocker
has cleared, **Review current requirement with saved note** opens the current record
and restores the retained note without overwriting an existing draft. The user must
explicitly approve/reject again; recovery never applies the old decision automatically.
This also opens originals normally hidden behind a matching refinement.

Unresolved clarification warnings name the question, status and feature. Review cards
and submitted-review recovery offer **Open blocking clarification in Design**, selecting
the question's feature, appropriate filter and page even for deferred/delegated questions.
Failed pending-item updates now distinguish omitted detailed context from unfinished
human input and identify the exact target ID. Validation protections are unchanged;
these diagnostics do not establish that an invalid model proposal was safe to apply.

Recovery verification (2026-10-20): type check, all **350 deterministic tests**, UI
build, Playwright browser checks and diff checks passed. Browser checks open a linked
clarification from Reviewed, distinguish cleared blockers from historical diagnostics,
and restore a saved review note without applying its decision. No live model calls or
user-data repairs were performed. The existing approximately 511 kB Vite chunk warning
is non-blocking. The original failed model proposal's exact invalid operation was not
recovered; clearer future diagnostics do not constitute a live-model behavior fix.

Requirement review, refinement/resolution approval and duplicate removal share explicit
relationship checks in `src/core/decision-availability.ts`. Relevant work includes the
target(s), linked clarification/evidence, feature/shared input and transitive dependency
input. Applied responses with unfinished or failed follow-up still count as pending;
retained conflicting/superseded responses do not permanently block replacement decisions.
For approval, an explicitly linked unanswered/deferred/delegated clarification must be
answered and processed first. Ordinary requirement rejection does not require answering
questions about the behavior being declined: reject with a note to request a replacement
such as beacon respawning instead of partner revival. Rejection retains those questions
unchanged; normal follow-up can propose replacements and retire obsolete questions with
provenance. Explicitly linked questions are prioritized among the bounded, budget-checked
review follow-up candidates rather than relying only on wording similarity; oversized
optional candidates still cannot block the original review. Pending human input, changed evidence, stale revisions and active-worker
protections still apply to rejection. Earlier blocked rejections remain unapplied history;
use **Review current requirement with saved note** and explicitly reject again. These are
deterministic safeguards, not semantic proof of consistency.

- Direct reviews, cleanup approvals, duplicate removals and cleanup dismissals cannot
  change a live discovery/scan snapshot, including a worker in another local process.
  Even focused jobs currently publish against a whole-project revision. Advisory help
  does not hold this lock; existing implementation ownership checks remain in force.
- Answers and notes remain saveable. Ordinary review responses also remain saveable,
  but related pending input or changed evidence retains the review as **needs-attention**,
  with its exact note/decision and no applied approval/rejection. After processing related
  work, review current information and resubmit; resuming never applies that conflicted
  review automatically. Plain independent same-feature approvals and unrelated feature
  input do not invalidate one another solely because the project revision changed.
  Nonblank review addenda are conservatively feature-level input because their follow-up
  can request wider changes; their saved decisions also enter that feature's guardrails.
- New queued reviews capture a versioned relevant-evidence basis. Browser requests also
  identify the revision actually reviewed, so an old tab cannot approve against newer
  evidence merely because the requirement wording still matches. Storage rechecks this
  basis and pending work transactionally when applying the queue. New individual wording
  proposals capture the same basis and become outdated on relevant evidence changes;
  resolution proposals retain their existing exact pair/context checks.
- Review and Project map retain editing notes when supporting context changes and ask
  the user to acknowledge the updated information. Refinement/duplicate-removal actions
  explain their blockers. Completed or conflicting historical work alone does not pause
  fresh follow-up after a focused queue run.

Legacy reviews/proposals without a captured basis retain their original target-only
provenance checks; the upgrade does not invent an earlier evidence snapshot or require
replaying completed work. See the [migration ledger](migrations.md#human-decision-availability-and-evidence-bases-2026-10-20).

Verification (2026-10-20): type checking, all **321 deterministic tests**, the UI build,
Playwright browser checks and diff whitespace checks passed. Browser coverage includes
retaining an unapplied review while a related answer runs, preserving its note and
explicitly resubmitting afterwards, and re-review after a feature-level addendum finishes.
Screenshot: `.reqwizit-state/browser-decision-safety.png`. Tests used Node 20.11; the
development baseline remains Node 22.12+. No live model calls were made. Vite reports
a non-blocking warning for the approximately 505 kB minified main UI chunk.

### Implementation ownership

Assessment, main verification and coding hold a stable specification from startup
through completion. Answers, notes and ordinary requirement reviews can still be
submitted: they remain durable waiting submissions and do not change that snapshot.
Discovery, scans and refinement cannot start while that worker is active. Direct
specification mutations (including refinement approval, organization, model changes,
manual implementation progress and folder rebinding) are blocked at storage as well
as in the browser. Advisory question help and browsing remain available.

When the worker completes, queued automatic follow-up can continue, preserving manual
pause and per-submission automatic-processing preferences. A failed, cancelled or
expired worker leaves waiting work paused for explicit **Resume discovery**. Reloading
or reopening never repeats model work automatically. Processing & queue distinguishes
saved responses waiting on implementation from manually paused discovery.

Buttons that are unavailable explain the current blocker on hover, keyboard focus
or tap. They remain focusable with `aria-disabled` and an accessible description;
activation cannot submit the action. Escape dismisses an open explanation first,
including inside the queue dialog. Local prerequisites (blank responses, folder
selection, pending reviews, stale refinements and unconfigured implementation) have
their own explanations. Frozen settings keep their fields disabled and explain their
save action. The shared UI implementation is `src/ui/action-button.tsx`.

New-requirement prompts enumerate only current eligible source IDs present in the
detailed round context. Missing, superseded, deferred, delegated and duplicate citations
identify the proposal and source in validation diagnostics. Rejection remains atomic;
saved input is retained and invalid citations are never silently replaced.

Discovery omits individual malformed glossary annotations from otherwise valid-size
concept arrays, as well as annotations with missing/ambiguous/overlapping phrase
references. Valid explanations and question wording/options are retained, and the
saved round changes report omission counts. Invalid containers or oversized arrays
still fail validation. Substantive schema failures identify the failing field paths
and expected shape without echoing model values; the entire round remains unapplied
and saved human input is preserved. Cleanup adds no model calls.

Verification (2026-10-19): type checking and all 228 deterministic tests passed, as
did the UI build and Playwright browser checks. The browser checks cover hover,
keyboard focus and touch explanations, accessible descriptions, blocked activation,
waiting-state feedback and Escape dismissal inside the queue dialog. The existing
500-requirement DOM/navigation check also passed. No live model calls were made.

## Project activity

**Activity → Changes & outcomes** defaults to **Highlights**, with **25 entries per
page** and Newer/Older controls at the top and bottom. Highlights include item changes,
saved human decisions, stopped discovery/help/scan jobs, submissions needing attention,
and assessment/coding/delivery outcomes. Routine revisions without recorded item changes
are hidden; **All activity & revisions** exposes every revision plus retained outcomes.
Implementation progress is grouped by run outcome rather than each worker checkpoint.
Problems remain highlights regardless of whether they changed the specification.

Entries show affected item names, change counts, decision excerpts and feature names.
**View changes & details** reveals original revision reasons, stable IDs, before/after
text and links to current features. Details mount only on expansion. Historical names
and evidence are retained even if the current feature is renamed or archived.
The feature selector now filters activity; type and literal text search run across the
whole saved history, not only the displayed page. Applying search/filters starts at
the latest page; changing feature resets the activity controls. Empty results and
failed requests have explicit feedback and retry controls.

Paging uses a fixed activity-sequence anchor. Polling only checks a lightweight head
when project/job/submission/execution state changes; **New activity available** refreshes
explicitly, so new work does not shift the list while reading older entries. Requests
are aborted on filter/project changes to prevent stale responses replacing the page.
The legacy `/history` API remains available; the UI uses `/activity` and `/activity-head`.

Upgrade **database 2 → 3** builds a transactional, additive activity index from original
snapshots and currently retained outcomes. Historical revision dates were not recorded
and remain explicitly undated. Backfilled outcomes are recorded after revision entries;
their original run start dates are shown when present, without claiming a reconstructed
cross-source chronology. New events are ordered by local recording sequence. The index
records new decision/job/submission event dates as **Recorded**, separately from known
run **Started** dates. Historical undated entries are not assigned upgrade dates. It
does not alter specification/execution revisions, evidence, freshness or workspace files;
see [migration details](migrations.md#project-activity-index-v1-2026-10-19).

Verification (2026-10-19): type checking, all **233 deterministic tests**, UI build
and Playwright browser checks passed. The activity exercise uses 1,000 routine
revisions plus 64 highlights, checks bounded 25-entry rendering, anchored navigation,
new-work notification, full-history search, disclosures, type/feature filters and
mobile width. Screenshot: `.reqwizit-state/browser-activity-mobile.png`. Checks used
the available Node 20.11 environment; the documented development baseline remains
Node 22.12+. No live model calls or production-data resets were performed.

## Large-project responsiveness

### Design, Review and Implementation paging

Question filters, requirement/refinement review (including submitted/reviewed history),
and the filtered Implementation requirement list use shared Previous/Next controls,
item ranges and page counts. Pages default to **25 items**, with **10/25/50** choices;
main multi-page lists repeat controls at the bottom. Feature/status/search filters apply
before paging, across the full dataset. Implementation retains feature headings and
existing ordering; a feature spanning pages shows only that page's rows, while its
progress totals and **Implement epic** action still cover the whole feature.

Question drafts, review notes, and planning dependency/order/notes edits live outside
paged rows. Explicit answer links and review auto-advance reveal the target page.
Background refreshes use stable item IDs for navigation and clamp pages when a list
shrinks. Work packages, execution order, dismissed questions, previous plans and
assessment/implementation runs are paged as well. Closing lazy history drawers resets
their local navigation on reopening. Page size/position are in-memory UI state, not
project settings, and reset when their owning view is remounted.

Paging bounds rendered rows, not initial snapshot size or engine evaluation. Assessment,
planning, execution, progress and review counts retain their existing full scope. No
saved-data format, assessment fingerprint or freshness rule changes; existing evidence
does not need migration or reassessment. See [compatibility](migrations.md#workspace-list-paging).

Verification (2026-10-20): type checking, all **291 deterministic tests**, the UI
build, Playwright browser checks and diff checks passed.
Paging checks cover bounded 500-item rendering, unchanged full-list counts and evidence,
empty lists, partial final pages and clamping after shrinkage. Browser checks cover
cross-page navigation, global search, retained answer/review/planning drafts and dependency
choices, review auto-advance/focus, answer links to later pages, and mobile width.
No live model calls were
made; checks used the available Node 20.11 environment (baseline remains Node 22.12+).

### Processing refreshes (2026-10-20)

The browser sends bounded, per-section content tokens on its existing authenticated
snapshot request. The server omits unchanged sections from the JSON body; unchanged
polls return `{}`. Progress-only refreshes do not retransmit or parse the specification,
coverage or execution evidence. Tokens cover actual section content, not only revision
or execution counters, so worker interruption, help jobs, queue state and workspace
outcomes remain visible without a specification change. Tokens live only in memory.
Clients without the new header still receive the original full snapshot.

Each response merges against its own request's baseline, retaining equal section
identities and removing vanished optional fields. Aborted, old out-of-order, wrong-project
and older revision/version results cannot replace newer accepted state. Background
refreshes retain React transitions. Implementation and overall-progress components skip
unrelated progress-only renders; disabled-action preparation retains unmodified element
branches rather than cloning every element. Existing accessibility/blocking behavior is
preserved. The project map and overall-progress header share one memoized score calculation.

The server keeps a bounded 16-entry immutable revision/coverage cache and reads job
history once per snapshot. Volatile sections are still evaluated on every request;
workspace synchronization/conflict detection and recovery are intentionally unchanged.
Execution checkpoint changes still transfer the whole execution section, and synchronous
storage/filesystem work is not moved to a worker by this pass.

Processing & queue mounts completed/replaced submission history and recent background
details only when expanded. Completed/replaced responses have 25-item pages, newest
first; active and waiting submissions remain visible. Closing a history disclosure
unmounts its contents; reopening starts at the newest page.

Compatibility: no persisted data, schema, assessment semantics, freshness fingerprints
or workspace formats change; no reset, migration or repeated model call is required.
See the [migration ledger](migrations.md#processing-refresh-transport-and-rendering-2026-10-20).

Verification (2026-10-20): type checking, all **288 deterministic tests**, UI build,
Playwright browser checks and diff checks passed. The 500-requirement fixture exercises
checkpoint/progress refreshes, typing and focus retention, expanded details, prerequisite
drafts, scrolling and navigation. Queue checks cover unmounted collapsed history,
25-item pages and access to older entries. In one local run, the initial JSON body was
**154,695 bytes**, versus **41 bytes** for a progress-only body (excluding HTTP headers),
with no observed browser long tasks during the instrumented interactions. This is a
deterministic synthetic check, not a before/after end-to-end latency benchmark or live
provider/desktop qualification. No model calls were made. Checks used the available
Node 20.11 environment; the development baseline remains Node 22.12+.

### Earlier large-project rendering work

Implementation feature drawers, requirement bodies, assessment details and run history
mount their contents on expansion rather than constructing hidden evidence/log trees.
Under **Implementation settings → Requirement prerequisites**, choose one requirement
to edit its prerequisites. Only that requirement's candidate list is mounted; choices
for other requirements remain in the settings draft. Closing/reopening the prerequisite
drawer and assessment polling retain the draft.

Snapshot polling waits for the preceding poll to finish and aborts its outstanding
request when leaving the project. Equal snapshot sections retain their object identity,
and unchanged responses do not replace the rendered state. Independent job progress,
worker interruption and workspace outcomes still update, including changes without a
specification revision or execution-version increment. Background refreshes use React
transitions. Implementation plans, freshness summaries and progress scores are memoized
against their snapshot inputs; evaluation-scoped indexes reuse relevant-decision
fingerprints without retaining them across changed snapshots.

Compatibility: these are rendering, polling and in-memory evaluation changes. SQLite,
workspace files, settings/dependency payloads, saved assessments, fingerprints and
freshness semantics keep their existing formats. No forward migration or reassessment
is required; existing valid evidence remains valid.

Verification (2026-10-19): type checking, all 215 deterministic tests, the UI build and
Playwright browser checks passed. The browser fixture covers 500 approved requirements
across ten features, a collapsed Implementation DOM below 500 elements, one mounted
prerequisite selector, retained edits across target/drawer changes and polling, lazy
requirement bodies, checkpoint updates while searching/scrolling, and tab navigation.
The observed initial Implement tab switch was 87 ms in that run (Playwright wall time,
not a cross-machine benchmark or a before/after measurement). Existing checks also
exercise concurrent assessments, relevant-decision invalidation and progress dialogs.
No live model or GitHub calls were used; the user's running desktop session has not
been profiled by these checks.

## Running-work feedback

Active operations show a spinner and a slim progress bar. The header's **Processing
& queue** control stays visible in Settings as well as the project workspace, and
its drawer shows separate indicators for concurrent background tasks. Foreground
work (loading, project creation, saving responses/settings, folder browsing/preview,
repository inspection and connection operations) also appears beneath the header
title while it runs. Routine snapshot polling does not trigger activity indicators.

Folder scans use saved batch counts, and assessment/coding bars use assessed or
verified requirement counts for the current run. These measure that operation's
work, not delivery to main or overall project completion. Unknown-duration work
uses an indeterminate bar; concurrent background tasks each retain their own bar
in the drawer. Stopped, failed, blocked, completed and awaiting-merge tasks do not
continue animating. Indicators respect the current theme and reduced-motion
preferences, with accessible progress labels and counts.

Deterministic queue tests cover progress counts and startup/terminal-state behavior.
Browser checks exercise header/drawer indicators, Settings visibility, measured
assessment checkpoints, concurrent help/assessment, interrupted-task cleanup,
sign-in feedback, reduced motion and mobile sizing.

## Project progress summary

The top-right **Overall progress** card shows a percentage and status. Click it to
open **Project progress**, then expand **Questions / Definition**, **Requirements
review**, or **Implementation** for epic-level percentages, statuses and counts.
The summary always covers the whole project, independently of the Feature filter.
Escape or **Close progress** closes the modal and restores focus to the card.

- **Definition** retains the evidence-gated coverage rubric: equal weight per active
  epic plus project-wide information, excluding an empty inbox. Unknown areas stay
  at zero; freshness, open questions, critical gaps and scope confidence remain visible.
- **Requirements review** counts approved/rejected decisions over identified
  requirements in active epics. A matching pending refinement makes its target
  awaiting review again; stale suggestions do not reopen current wording. Saved
  decisions count immediately, without waiting for AI follow-up.
- **Implementation** counts current, repository-matching verified delivery to main
  over all non-rejected requirements in active epics. Unapproved requirements remain
  in the denominator. Manual progress, static assessments and unmerged PRs earn no
  delivery credit. Changed requirement fingerprints invalidate previous delivery;
  new delivery evidence also checks relevant human context and dependency guardrails.
  The Implementation breakdown separately shows **local code completeness**, with
  project/epic meters and counts for complete, partial, missing, unknown, not-assessed
  and stale working-folder results over approved requirements. These update during
  assessment; a main-only finding cannot raise local completeness. The stage and overall
  percentages continue to use verified delivery rather than this local-only measure.
- **Overall** is an equal-weight average of the three stages. Empty stages count as
  0%; empty epic rows explain their missing scope. Review/implementation percentages
  cannot round up to 100% with outstanding items, and overall is capped at 99% until
  all stages reach 100% without stale definition assessments, open questions, critical
  gaps or pending organization review. This describes tracked scope, not proof of
  exhaustive completeness or readiness. New scope can lower these estimates.

Scoring lives in `src/core/progress.ts`; the browser derives it from the current
project, coverage and execution snapshot without changing persisted project state.
Verified with deterministic scoring tests (empty/archived scope, refinements,
repository/fingerprint invalidation, delivery-only credit and completion gates),
plus browser dialog expansion, focus restoration, Escape/close and mobile width.
The mobile screenshot is `.reqwizit-state/project-progress-mobile.png`.

The main workflow tabs are **Design → Review → Implement**.
**Implement**, beside Review, is an integrated local build pilot (DEC-023).
It shares the existing tabs, feature filter, expandable rows/groups and appearance
preferences. Its badge counts accepted active requirements not verified as delivered
to main. See [implementation-workspace.md](implementation-workspace.md) for assessment,
local OpenCode execution, automatic commits, four GitHub strategies and remaining
live-qualification gaps.

Implementation settings detect the GitHub owner/repository from the connected Git
root's `origin` remote automatically. Detection is local/read-only, supports HTTPS and
SSH, and can be refreshed with **Detect again**. Manual edits are retained; detected
changes to a saved repository require saving settings before starting execution.

The same local inspection suggests verification commands from recognized root project
metadata (package scripts, Rust, Go, .NET, pytest or Godot). New settings prefill these
commands; saved commands and edited drafts are preserved. **Use suggested commands**
replaces a draft explicitly. Suggestions identify their source and have not been run.

Implementation epic drawers start closed. Expand one to inspect its requirements.
Each header shows local assessed/completeness counts plus a separate verified-main
fraction, updating after each checkpoint. Counts cover the full approved epic even
while search/status filters hide rows; unknown is assessed, not complete. Stale local
findings appear as needing reassessment rather than inflating the completion count.
Search matches epic/requirement text, IDs and acceptance scenarios and combines with
the Feature selector and status filters. Missing, not assessed and needs-reassessment
filters help narrow the list; matching counts and a clear-filters empty state are
shown. These controls filter presentation without changing saved execution scope.

Assessment/verification show explicit run state, selected/completed counts, code
assessment totals and **Assessment details** with command exit codes/output, capture
scope and progress. Failed or zero-assessed runs do not imply missing implementation.
**Complete in code** filters existing code separately from confirmed main delivery.
The Implement tab shows three main actions: **Check progress**, **Prepare plan**, and
**Start implementation**. The last becomes **Resume implementation** for an unfinished
run or **Verify delivery** when awaiting a merge. A next-step message explains what is
needed, and Stop stays visible while working. **Check options** hides the less-common
**Preview changes** and **Recheck everything** / **Recheck feature** controls by default.
Check scope follows the selected feature; plan scope is explicitly all approved
requirements. These labels preserve existing operations and saved-data compatibility.

**Check progress** performs local assessment followed by remote-main verification
in one action, automatically choosing the strongest supported status. Local/main
evidence is retained separately; failed remote access or checks preserve local results
and previous dated delivery evidence. Only complete, verified main counts as implemented.
Unchanged assessments are reused independently per scope on explicit retry; main checks
still run each time.
This includes missing, partial and unknown results: being assessed is separate from
being complete. **Recheck everything**, **Recheck feature** (with a Feature filter), and the
per-requirement **Reassess** button bypass reuse explicitly. Run details show reused
versus freshly assessed counts and forced attempts. Completed checkpoints survive
restart; failed/cancelled retries retain older dated evidence. Freshness reasons identify
requirement, decision/guardrail, workflow/skill, model and latest captured-code changes.
Code snapshot invalidation is conservative across the captured scope, not just cited files.
You can keep submitting answers during assessment: submissions wait until both phases
finish before changing the starting specification snapshot. Unrelated answers preserve
current results and reuse when applied afterward. Changed
supporting decisions, feature/project notes or dependency guardrails mark affected
results **Needs reassessment** and invalidate new delivery evidence's current credit,
even when requirement wording is unchanged. Retry **Check progress** against
current decisions; assessment does not require archiving a coding run.

Coding and assessment process one requirement at a time with independent contexts.
The owned OpenCode profiles now load bundled, versioned role-specific skills; details
retain the assessment skill version, and context preflight includes its content.
Assessment still uses only supplied captured evidence; skills do not grant filesystem,
shell or research tools to that profile. See [bundled skills](implementation-workspace.md#bundled-opencode-skills).
Even epic PRs use separate coding sessions per requirement. Assessment sends focused
captured-evidence windows and may request up to two additional bounded windows for the
same target. Details show per-requirement context/session counts and context blockers.
Full-request preflight includes instructions/schema, reserved overhead and saved
session history; oversized mandatory input pauses before inference without truncating
human decisions or advancing to another requirement.

Status: first playable local browser application. It shares the existing SQLite
projects with the terminal client. No desktop installation is required.

## Requirement cleanup

Use **Review → Refine requirements** to check existing requirements, including approved
ones, for code-level wording or incidental gameplay tuning. Discovery also checks the
requirements in its detailed working set. The feature filter scopes the explicit
cleanup run; All project areas selects all eligible requirements. The run processes
one requirement at a time with its linked evidence and applicable human constraints,
instead of loading an entire feature's approval history. Completed checks (including
no-change outcomes) are saved as revision-linked jobs. After failure, stop or restart,
click **Refine requirements** again to continue unchecked work. Completed unchanged
tasks are skipped; changed requirements or applicable constraints permit a new check.
A genuinely oversized individual task still stops before inference, retaining earlier
results. Suggestions remain subject to review; this is not proof of completeness.

Refinements are individual expandable review items, alongside new/revised requirements
under **To review** and in a dedicated **Refinements** filter. The Review count includes
these pending decisions. A matching pending refinement replaces its original's pending
row to avoid reviewing the same wording twice; keeping that original wording restores
its ordinary review row if it still needs approval. Stale suggestions do not hide newer
requirement wording.

The **Refinement proposed** badge describes the pending work; the current requirement's
approval status is displayed separately. Expanding an item shows original and proposed
wording/scenarios, supporting evidence and the reason. **Approve refinement** makes the
new wording approved under the same ID; **Keep current wording** remembers the dismissal.
Successful decisions advance and focus the next item; failed saves retain the current
item. Both outcomes remain under **Reviewed** as expandable comparisons, including after
reload. **Refine requirements** is a Review toolbar action; processing progress stays in
the header's **Processing & queue** drawer. A pending
human review must finish before replacement approval. Changed/archived targets cannot
accept stale suggestions; dismiss the old suggestion and refine the current wording.
Current exports continue using active wording until approval. Implementation progress
linked to the older requirement fingerprint then needs review.

Verified with deterministic service/API/UI tests and the browser fixture: mixed review
items/counts, feature/refinement filters, expansion, approved-target proposals, reload,
approval, dismissal, auto-advance/focus, failed-save retention, history and mobile width. Prompt rules retain
explicit constraints and meaningful numeric product rules; live model cleanup quality
has not been qualified.

## Existing-project initialization

Source-folder initialization is available during creation: choose **Existing project**,
select a folder first, review editable local name/description/type suggestions, and
choose **Create & initialize existing project**. Preview uses no AI calls. Connected projects also offer **Initialize from
folder**, or **Rescan folder** after the first scan, on the Project map and in workspace
Settings. Review inferred requirements before explicitly starting **Explore next gaps**.
Last-scan details expose inspected files/evidence, changes and omissions. See
[initialization and rescanning](project-workspaces.md#initialize-definitions-and-rescan)
for source transmission, limits, exclusions and verification status.
Scans save validated results in small sequential batches and automatically continue
across execution windows while running; progress reports the continuation and saved
batch count. **Stop** retains checkpoints for explicit resume. Interrupted scans offer
**Resume scan** to reuse saved batches and the displayed file snapshot, or **Start new
scan** to read current files. Older failures without checkpoints offer **Retry initialization**.
Ordinary discovery stays blocked until initialization succeeds. Expanded questions include **Unrelated / dismiss** beside
**Save response**. **Design → Bulk question actions & history** provides batch dismissal
and evidence-grounded replacement, retaining answered/queued input
and retirement history. Godot project/configuration/scenes and larger source excerpts
are supported with explicit inspected ranges and omissions.

## Run

```powershell
npm ci
npm run app
```

Open **http://127.0.0.1:4317** (or the address printed by the app). Keep the terminal
running; Ctrl+C stops the local service and cancels its active discovery work.

On Windows, exit running Reqwizit CLI/app sessions before `npm ci`: they can lock
SQLite's native module. During this iteration, a clean reinstall encountered that
lock in an existing interview process. `npm install` restored the dependency tree
successfully without stopping the user's session; the final clean-install check
remains blocked until that session exits. Project data is separate from dependencies.

Optional development store/port:

```powershell
npm run app -- --data-dir .reqwizit-state --port 4318
```

Default storage is the same user-local `reqwizit/projects.sqlite` used
by the CLI, so existing projects appear in the project list. If the new data
directory does not exist, an existing `requirement-wizard` directory is reused
in place, including protected provider credentials. Browser preferences migrate
to `reqwizit-` keys while preserving values already stored under the new name.
Old snapshots gain
project-wide and inbox areas on read without losing record IDs, original input,
or revision history. New fields are saved on subsequent mutations; the SQLite
table schema is now version 2 for transactional execution-data upgrades, with separate
execution JSON schema versions and retained original payloads. See [migrations.md](migrations.md).

**Settings → AI connections** now supports in-app direct ChatGPT sign-in, saved
accounts, account-specific model catalogs, explicit connection tests, reconnect,
and disconnect. Open Settings using the gear icon in the sidebar, also available
before creating your first project. Settings has its own `#/settings` page with
**Back to workspace** navigation and browser Back/Forward support. Opening the
Settings URL directly or reloading it keeps Settings open; the back button also
works when there is no previous workspace entry. Within the current page session,
returning preserves your selected project, workspace tab, feature filter, and drafts.
Choose a direct account/model and **Save model** to switch an existing project;
new projects use the selected connection. Direct discovery/help need no OpenCode
executable but remain live-unqualified. Direct web research is unavailable and
disabled in the UI. See [direct-providers.md](direct-providers.md) for details.

Connecting an account and applying it to a project are separate actions. The header
shows the project's **Active connection** and model. Unsaved connection/model changes
show a notice and disable **Explore next gaps** until **Save model** applies them.
Sign-in success describes an account connection, not a completed project switch.

Existing projects retain their OpenCode selection until explicitly changed. For
that route, use `opencode auth login` if needed; Settings still accepts an explicit
OpenCode model ID. There is no automatic provider/model/account fallback.

## Workflow

The project header spans the available width beside the sidebar and stays pinned to
the top while scrolling. Between the project title/connection and definition progress,
it centers a clickable processing summary between equal-width side columns: current task (submitted response/review,
feature exploration, requirement cleanup, scan batch, implementation check, coding,
verification, Git delivery or question help), stage, waiting count and
items needing attention. Clicking opens **Processing & queue** in a right-side modal
drawer over the workspace. Beside the summary, **Stop discovery** is available while
discovery is active, **Resume processing** when paused, and **Process saved responses**
when saved or queued responses can be processed. **Discover missing decisions** is
available when idle without pending processing; **Continue exploration** opens saved
allowance review when available. These controls reuse the workspace/drawer's
actions, selected feature scope and disabled states without opening the drawer;
they wrap on narrow screens. Implementation and question-help cancellation remain
task-specific controls inside the drawer, which also retains discovery controls.
This is a presentation-only change; persisted data and pause/resume semantics are unchanged.
Closing with
Close, Escape or the backdrop restores focus to the header and leaves work running.
The drawer uses the full screen on narrow viewports and keeps keyboard focus inside.
OpenCode stages distinguish runtime startup, model/session preparation, awaiting the
model, receiving output and validation; research reports tool requests. Direct ChatGPT
reports request/response stages too. These are application/runtime observations, not
an AI-generated account of internal reasoning or a completion percentage. The status
wraps below the title/progress on narrow screens, and completed/stopped/error states
remain in the header. Progress messages are transient; saved jobs retain their results
and diagnostics as before.

Header discovery controls verified (2026-10-20): type checking, all 296 deterministic
tests, the UI build and Chromium browser checks passed. Browser checks exercise
processing saved responses directly from the header, keyboard stopping, paused-state
reload and resuming without opening the drawer, with header controls fitting 1440px
and 390px viewports. No live model calls were used.

The drawer aggregates the selected project's background work across all features.
Concurrent work has separate task cards and cancellation controls; the header reports
the active task count. Implementation checks show the local assessment followed by
main verification, with assessed/selected counts, current requirement and saved stage.
Coding reports its current stage and verified/selected count. Question help is listed
even when discovery is idle. **Stop implementation** and **Stop question help** target
their own workers. Discovery pause/resume only affects discovery. Recent background
work retains assessment/execution/help outcomes and diagnostics; awaiting merge is a
waiting outcome, not an active worker. Snapshots restore activity after page reload.

Shared-queue verification (2026-10-19): type checking, all 208 deterministic tests,
the UI build and Chromium browser checks passed; the final queue/implementation
changes also passed 20 targeted tests. Browser fixtures cover simultaneous assessment
and help, the local/main phase transition, task-specific cancellation requests,
reload, interrupted/failed/completed outcomes and mobile width. The mobile capture is
`.reqwizit-state/queue-implementation-mobile.png`. These fixtures use snapshot overlays;
they do not qualify live model or GitHub delivery behavior.

Verified with deterministic service/API tests and Chromium at 1440px and 390px:
task/stage rendering, one status display, full-width header edges, sticky position
after scrolling, drawer controls/focus/dismissal and no horizontal overflow. Header and
drawer screenshots are saved as `.reqwizit-state/{header,queue}-{1440,390}.png`. No live model calls were used
for these checks; provider streaming remains subject to the runtime's emitted events.

### Appearance and dropdowns

Open **Settings → Appearance** to change the entire browser/desktop workspace:

- Six light presets: Sage (default), Paper, Cloud, Ocean, Lavender, and Sand.
- Six dark presets: Forest, Charcoal, Midnight, Deep Ocean, Aubergine, and Espresso.
- **Customize current preset** copies its accent, background, surface, and text
  colors into a custom palette. **Custom theme** reopens your saved palette without
  replacing it when switching presets. Borders, secondary text, selection, and hover
  colors are derived automatically. Low body-text contrast displays a hint.
- **Interface font** offers system sans, Inter/modern sans, humanist sans, book serif,
  and monospace stacks. Fonts resolve locally with fallbacks; there are no network
  font downloads, and Inter is used only when already installed.
- **Text size** scales interface typography from a 12–20px base (14px default).
- **Reset appearance** restores Sage, the default font stack, text size, and custom
  palette. Changes apply immediately and are saved under `reqwizit-appearance` in
  local browser storage, independently of project revisions and exports. Preferences
  persist across reloads in that browser profile or desktop installation; browsers,
  separate origins, and the desktop shell have independent local preferences.

Dropdowns share theme-matched borders, spacing, focus/disabled states, and chevrons.
Browsers supporting `appearance: base-select` also render themed rounded option
menus with selected/hover states and scrolling. Other browsers retain their native
option menus with themed closed controls. Native keyboard navigation, type-to-select,
and screen-reader semantics are retained. Forced-color mode uses native controls.

Deterministic Chromium checks cover preset application, custom palette/font/size
persistence, reset, contrast hints, actual picker keyboard selection/dismissal, and
390px mobile layout at 20px text size. Appearance screenshots are written to
`.reqwizit-state/appearance-{dark,mobile,dropdown}.png` by `npm run test:browser`.

Projects can connect to a local folder during creation or through **Settings → Project
workspace**. Generated requirements/progress files update after app and CLI changes;
the header shows their saved revision or sync conflict. **Project map → Manual
implementation records → Implementation progress** records manual build status and verification evidence independently of
requirements review. See [local project workspaces](project-workspaces.md) for file
layout, folder browsing, reconnect/retry, conflict resolution, and recovery behavior.

1. Create a named project with an idea; **Create & explore** starts its first round.
2. Start in **Design**. Use the feature filter to focus on an area if needed.
3. The first unanswered question opens automatically. Choose an option or type an
   answer, then save; the response moves to Submitted and the next question moves
   to the top and opens automatically. Other compact rows can be opened manually.
   Only one question is expanded at a time; unsaved answer drafts survive switching
   questions and background polling within the current page. No IDs are needed.
4. By default, submitted responses queue a follow-up organization/discovery round.
   Keep answering while discovery runs; waiting answers are processed individually after the active job.
   In **Settings**, disable **Automatically explore queued answers** to save without starting another
   round, then choose **Explore next gaps** when ready.
   Research and automatic-follow-up preferences are retained in this browser.
5. Expand **Add information** for free-form ideas/corrections. Original text is retained.
6. Open **Review** beside Design to approve/reject requirements one at a time,
   optionally adding direction for AI follow-up. **Project map** still exposes acceptance
   scenarios, supporting decisions, and confirmation/rejection controls. Review
   changes to confirmed information before applying reorganization proposals.
7. Use **Activity** for processing history, revisions, research sources, and technical
   context diagnostics. **Definition progress** is collapsed under the map/activity
   views; selecting a feature exposes its detailed assessment categories and evidence.

### Requirement review queue

**Review** shows a project-wide count of proposed/needs-review requirements not already
submitted. The feature filter scopes its cards. **To review** opens the first pending
requirement and advances after submission; **Submitted** shows durable processing,
saved/paused work, conflicts and failures; **Reviewed** includes approved/rejected
requirements and completed AI responses. Approval and rejection need no rationale.
An optional **Anything to add?** note is retained verbatim with the reviewed wording
and acceptance scenarios. Drafts survive tab changes and polling within the page;
submitted decisions survive reload/restart. Unsaved drafts are not persisted on reload.

Reviews use the answer queue, single-submission follow-up, automatic-processing preference, cancellation,
and explicit resume. While discovery runs, reviews wait for the next revision-bound
round without mutating its snapshot. An exact requirement fingerprint rejects changed
wording, acceptance, membership, evidence or status; unrelated project revisions do
not invalidate a review. A conflicting review retains its decision/note for resubmission.
An applied decision survives failed AI follow-up and is not duplicated on retry.

Each current review receives an AI response describing changes or remaining uncertainty.
Discovery prompts explicitly list the current batch's authorized review source IDs,
and their response schema restricts review responses to that list. Historical reviews
remain evidence but do not request another response; rounds without queued reviews
require an empty review-response list. Publication independently validates the batch.
Wider changes have a separate allowlist containing only current-batch reviews with
nonempty addenda. Their schema restricts change source IDs to that list, or requires
`reviewChanges: []` when no addenda exist. Approval/rejection is already saved before
AI follow-up and must not be replayed as a wider change.
With a nonempty addendum, discovery can revise an existing requirement (same ID,
**Needs review**), reject explicitly unwanted related requirements, or archive an
explicitly removed feature with its requirements rejected and open questions retired.
The change must cite a current review source in that exact batch. Whole-feature
retirement requires full detailed context and cannot discard waiting answers.
History, original input, prior revisions and answered questions remain. New requirements,
features and questions use the existing proposal path. Ambiguous direction calls for
targeted questions rather than assumed scope removal. Wider requests outside the bounded
working set require a focused follow-up. Ordinary reorganization of confirmed material
still uses organization review.

Deterministic checks cover optional notes, duplicate/stale decisions, atomic invalid
follow-up rejection, stable-ID revisions and feature archival. Chromium exercises
auto-advance, draft retention across tabs, approval with an addendum, rejection without
one during active discovery, reload, AI responses, new review items and mobile width.
Screenshot: `.reqwizit-state/browser-review.png`. These checks use fixtures, not live inference.

### Compact workspace and revising responses

The main header contains the project name, active connection, and project-wide
**Definition progress** percentage and bar across workspace views. The estimate
stays project-wide when filtering by feature and flags stale coverage as **Review
needed**. Settings opens from the sidebar gear icon, including on mobile.
The previous hero, statistics strip, permanent epic column, and permanent
health column are replaced by a single content column with expandable details.
User-facing feature groups correspond to the existing epic records. Reserved groups
are labelled **Shared project decisions** and **Items to organize**.

Question rows show their feature and, when available, a validated coverage category
(for example **Permissions**). New discovery prompts request the category and a
feature-specific rationale; older questions without a category remain valid and are
not heuristically classified. Expand **About this feature** for its saved purpose.

Use **Previous answers**, **Deferred / delegated**, or **Submitted**, then **Edit
answer** to change a response. Save confirmations also offer an immediate editing
shortcut. **Cancel** discards that question's draft and restores its saved response.
Saved answers retain their supersession lineage; linked requirements are marked for
review when a changed answer is applied. The map also provides answer-editing links.

A waiting response can be replaced atomically through the submission's optional
`replaces` ID. The replaced response stays in processing history as **superseded**
and is never applied. Replacement rejects responses that have already been applied,
started processing, or belong to another question/project. Retry uses the same
submission ID. A response already processing remains editable: the correction queues
against its current answer source for the next round, leaving the active snapshot
intact. Races/conflicts retain the draft and report an error instead of overwriting
newer information. Drafts are in-page state, not persisted across reloads.

**Project map** is an epic-level overview. Each active epic shows its saved purpose
without expansion, lifecycle status, delivery percentage/count, and outstanding
requirements/questions. **Open Design**, **Open Review** and **Open Implement** select
that epic in the destination tab. Shared project decisions and unorganized items appear
after the named epics with their own labels; empty special areas and archived epics
are omitted, while named epics without requirements remain visible.

Delivery reuses the same `projectProgress` calculation as Overall progress: current
verified delivery to the configured repository's main branch divided by all identified,
non-rejected requirements, including those awaiting approval. Manual assessments,
unmerged work and complete local code do not earn delivery credit. An empty epic says
**Scope not defined yet** rather than showing a misleading 0% bar; an area containing
only rejected requirements says **No active implementation scope**. Status labels are
Defining, No active scope, Needs review, Approved to build, In progress and Delivered.
Approved to build indicates reviewed scope, not runtime configuration/readiness.
Started coding, current partial/complete local evidence, or partial delivery make an
epic In progress. Outstanding reviews/questions remain visible alongside that status.

**View details** mounts requirement lists, acceptance scenarios, supporting evidence,
feature editing, dependencies, notes and organization controls only when opened.
Definition coverage remains a separately labeled estimate, with local assessment
counts distinguishing complete, partial, missing, unknown, unassessed and stale work.
The sidebar's **Definition progress** also retains its existing calculation; neither
definition measure certifies completeness or build readiness. Source scan controls
follow the overview. **Manual implementation records** retains the existing manual
editor behind a lazy disclosure, separately from automatic delivery tracking.

This is a presentation-only upgrade: persisted project/execution formats, stable IDs,
manual notes, assessment/delivery evidence and freshness rules are unchanged. Existing
projects display the overview directly without migration or additional model calls.

Verification (2026-10-19): type checking, all six progress calculation tests, the UI
build and deterministic Chromium browser checks passed. The map checks cover visible
purpose text, scoped navigation, lazy requirement/manual editors at 500 requirements,
empty and archived epics, mobile width, manual records earning no delivery credit,
33%/100% delivery and removal of stale delivery credit through polling. Screenshots:
`.reqwizit-state/browser-map.png` and `.reqwizit-state/browser-map-mobile.png`.
These checks ran on the available Node 20.11 environment; the documented development
baseline remains Node 22.12+. No live model calls were made.

Each round is bounded and stops for the human. It does not autonomously run an
unlimited sequence of calls: automatic follow-ups run only for new saved submissions.
Model calls consume subscription allowance and can
take a minute or more for detailed assessments/research.

### Processing and queue

Click the processing summary in the project header from any workspace tab to open
**Processing & queue**. Counts and contents cover all project areas regardless of
the feature filter. Idle, paused, stopped and attention states remain accessible.
The drawer shows the current task/stage, diagnostics and:

- **Currently processing**: full question text, exact submitted response, response
  type, submission time, and batch identifier for the active discovery round.
- **Waiting next**: durably saved submissions in submission order. These do not
  change the active round's revision; they are applied together at its boundary.
- **Saved · awaiting discovery**: applied answers/notes awaiting a manual round when
  automatic discovery was disabled.
- **Recent completed work**: submissions whose discovery result was successfully applied,
  collapsed by default.
- **Replaced responses**: superseded waiting answers retained only for history,
  collapsed by default.
- **Needs attention**: unsuccessful batches or responses whose question/previous
  answer changed before application. Original submitted text remains available.
- **Context blocked**: applied input whose compacted follow-up cannot fit even as a
  single response. Its answer/approval is saved; preflight records the revision,
  characters/budget, selected areas and largest sections without starting an AI job.

Questions and notes remain usable while discovery runs. Submitted questions move out
of the main question list and previous-answer forms while queued/processing; their
full text and responses appear in **Submitted** and **Processing & queue**. The Design tab counts
the remaining questions to answer. Other question drafts survive polling and
background round completion. Completed answers return to the previous-answer view;
responses needing attention become available for review again. Submitted responses
can be edited from the Submitted filter even while a round is active.
The queue and active-job view survive page reload. Each saved response receives its
own AI job, processed sequentially with fresh context at the latest committed revision.
Context includes the target and its linked evidence, project/dependency guardrails and
feature notes. Unrelated same-feature answers/reviews/requirements are explicitly
omitted or indexed; they are not pulled in just because they share an area. These
partial follow-ups cannot assess/reorganize the whole feature or change omitted records.
Progress reports one active response and how many are waiting.
An indivisible oversized response is isolated so fitting responses can continue.
The round status and Review submission history distinguish context-blocked follow-up
from a failed model call. After fitting work completes, blockers keep the queue paused.

Stop, a failed/stale round, or interruption pauses automatic processing. Open the
queue and choose **Resume discovery** (or **Explore next gaps**) to explicitly retry
applied responses and include waiting inputs, without adding duplicate human sources.
Conflicting unapplied responses need review and resubmission against the current
question; a retired question's retained response can be copied into a note. Restart
retains pending submissions and requires explicit resume rather than repeating model
calls. Context planning uses no model calls. Completed items stay completed when
a later item fails; resume retries only unfinished work and reuses saved sources.

A focused resume applies and analyzes only that area's queued/saved responses,
one response at a time. The drawer explicitly names the discovery scope inherited
from the workspace feature filter. Other areas stay pending, and the queue
pauses again if unrelated work remains. Select **All project areas** to let the
queue process remaining responses across areas sequentially. An indivisible queued
task whose mandatory human constraints still exceed the budget stops at preflight
with its budget summary retained on the submission; review that area's notes/dependency
scope or split its work, then resume to recheck. Unchanged retries do not create failed
batches, and corrected scope reuses the existing human source. Saved human input is
preserved. Direct service jobs still retain attempted manifests for oversized contexts.

## Epic organization

Epics have stable identities, purpose, dependencies, and question/requirement/note/research
membership. **Project-wide** holds cross-cutting information. **Unorganized ideas**
is a provisional inbox, including old projects awaiting organization.

AI organization supports create/edit, move, split, and merge operations. New records
use temporary aliases in model output; application code assigns durable IDs and
validates references. Splits must account for every source record. Merges preserve
records and redirect dependencies. Dependency cycles are rejected atomically.

Only questions, requirements, research findings, and notes are movable records.
Original ideas and answer/review evidence remain provenance sources; organize the
related question or requirement instead. Discovery context explicitly lists movable
IDs. Invalid organization references reject the round atomically with a diagnostic
identifying the operation and ID, including undeclared aliases and evidence sources
mistaken for records. Saved human responses remain intact; use **Resume discovery**
or **Explore next gaps** to explicitly retry a failed round.

Routine organization of unconfirmed work is applied automatically. Changes moving
answered/delegated questions or confirmed requirements, or changing their epic's
definition, are queued for human review. Outdated proposals cannot be approved over
newer edits; reject and rerun discovery to obtain a fresh proposal.

Use **Add feature** in Project map, **Edit feature** inside a feature group,
and the requirement's feature selector to move a requirement explicitly. **Restore map
before this round** in **Latest changes** restores earlier membership/epic structure while retaining all
current human answers, requirement decisions, and research. New records move to the
inbox; coverage assessments are cleared for re-evaluation. It is a map undo, not a
rollback of human input.

## Definition coverage

Every active epic has nine fixed coverage areas:

1. Purpose and scope
2. Users and workflows
3. Behavior and rules
4. Data and lifecycle
5. Permissions
6. Dependencies
7. Failure behavior
8. Quality and operations
9. Acceptance scenarios

The model proposes statuses, importance, explanations, and evidence IDs. The
application validates references and computes the score:

| Status | Credit |
| --- | --- |
| Unknown / needs review | 0 |
| Partial | 0.5 |
| Defined | 1 |
| Not applicable | Excluded only with resolved human evidence |

Importance weights are critical **3**, important **2**, minor **1**. Missing areas
remain in the denominator with weight 2. A detailed unconfirmed proposal cannot
earn defined credit; unsupported partial/N/A assertions with no evidence earn none.
Research alone cannot resolve a user's product preference. Superseded/rejected
evidence invalidates affected checks; versioned question-answer links detect changed
responses. Each assessment is tied to its project revision and marked stale after
subsequent changes.

Project coverage uses equal weights for active epics plus the project-wide component.
An empty inbox is excluded; an inbox with active questions, non-rejected requirements,
notes, or research findings is included.
Epics without assessments count as zero. Split/merge operations do not inherit old
assessment credit. Structural discovery can legitimately lower the estimate.

The UI shows the current estimate, critical assessed gaps, open decisions, scope
confidence, and the change from before the most recent successful round. Confidence
is qualitative, not a statistical probability. Even **100% is only coverage of the
identified checks**, not proof that every feature is known or the release is build-ready.
Semantic evidence relevance and check importance are model judgments, not mechanically
proven entailment. Open a coverage area to inspect the actual supporting records.

## Question explanations and decision support

Discovery proactively requests explanations of technical terms, acronyms, and
context-dependent wording, with up to eight saved annotations per question.
Newly generated questions may include subtly underlined concepts in the question,
its rationale, and suggested answer labels/consequences. Hover, focus with the
keyboard, or tap to read **What it means** and **What it changes**. Escape, moving
away, or tapping outside dismisses the tooltip. Tooltips use saved annotations and
need no model call. Existing questions without annotations still work normally.
Invalid phrase/option references are omitted without failing the round; the round
changes report the count, and valid explanations and question wording are preserved.
Option selection has a separate **Choose** control so opening an explanation never
selects an answer. Users' own answer text is preserved as entered.

Click or keyboard-focus and activate any other word in an expanded question,
rationale, or suggested answer, then choose **? What do you mean by this?**.
This opens the question-help panel and asks the selected model to explain that
word with its exact surrounding text and project context, including for older
questions without annotations. The word tooltip stays open with a spinner while
the job runs, then shows a brief summary from the explanation's opening paragraph.
New requests ask for a one- or two-sentence opening summary; long openings are
excerpted to 420 characters. The full explanation remains in the help history below.
Reopening the word reuses its saved explanation without another model request,
including after reload. Earlier-revision summaries are labelled as earlier project
context, and any assumptions are flagged for review in the full explanation.
Word shortcuts share the saved concept tooltips' theme colors, typography, spacing,
borders, and shadow. Use **×** to close a word popup (keyboard focus returns to the
word), or **Canceled** to stop its pending/running clarification.
Closing the popup leaves an active request running; cancellation is explicit.
Escape or a click outside also dismisses the word shortcut; on mobile it appears
at the bottom of the viewport. The shortcut uses the same saved advisory history,
cancellation, and error handling as other follow-ups and never chooses an answer.

Expand **Help me with this question** on a question card to:

- **Rephrase simply** while preserving the original question and options.
- **Explain why it matters** for the project.
- **Show an example** with hypothetical details labelled as examples.
- **Help me decide** through contextual tradeoffs, conditional recommendations,
  assumptions, and a small follow-up when relevant information is missing.
- **Ask a follow-up** in your own words.

Each request uses the selected model allowance with research disabled. The original
question and current answer draft remain available. Responses, assumptions, follow-up
prompts, and request messages are saved locally as advisory job history and survive
reload/restart. Help never selects, saves, or delegates an answer and never confirms
a requirement. Save product decisions explicitly through the answer controls.

The panel shows loading, **Stop clarification**, and failed/cancelled/interrupted/
stale requests. Retry using a help action. One help request per project may run at a
time; discovery and answering remain available. Project changes during generation
make the result stale rather than presenting it as current advice. Saved earlier
exchanges show their context revision. Up to six recent completed exchanges join
new focused context, with an explicit omitted-history count; older exchanges are
dropped from the request as needed to fit. All exchanges remain stored. Help reserves
12,000 characters of the 48,000-character package for its request/history and can use
question evidence plus project guardrails independently of a large epic. Oversized
mandatory context fails before inference. Like other jobs, interrupted work
is recovered after its lease expires without automatically repeating model calls.

## Context management

Every round creates a fresh, revision-bound working set instead of replaying an
ever-growing OpenCode chat. It includes:

- Original human idea and project-wide notes; focused notes and any exact source
  records needed by selected requirements/answers. Notes added inside an epic are
  scoped to it; AI can reclassify notes while preserving their original text.
- A compact epic map and the previous interpretation, marked stale when appropriate.
- Full records/evidence for focused and project-wide areas, plus transitive dependencies.
- A recent-record index (up to 100 labels, clearly marked as excerpts).
- Relevant research excerpts, assessments, and pending organization proposals.

Before rejecting an oversized working set, the engine compacts avoidable overhead:
it omits AI-authored concept-tooltip annotations from question records and removes
recent-index labels that duplicate records already included in detail. It preserves
exact question wording, rationale, options, answer links, human sources, requirements,
assessments, and dependency scope. Tooltips remain saved and available in the UI.
The package explicitly describes these omissions; its manifest records the original
character count and counts of omitted annotations/duplicate labels. Section sizes
and the final budget check use the actual compacted JSON. This is deterministic
metadata removal, not AI summarization or truncation of human decisions.

Without an explicit focus, small projects initially include all active areas. If
that context is too large, selection retries with a submitted-response area, a
pending-question area, or the first ordinary epic. Larger projects start focused;
submitted-response areas take precedence over unrelated pending questions. Every
area required by the current batch and all selected dependencies remain included.
Without an explicit question target, the five-pending-question limit is project-wide. Discovery prompts report the global
pending count and remaining slots even when some questions are outside the working
set. The response schema caps new questions at the available slots plus detailed
pending questions eligible for evidence-backed retirement; deferred retirements free
no slots. A full batch can still receive summary, requirement and assessment updates
with no new questions, including when targeted gap runs already saved a larger
backlog. Explicit targeted gap packages instead have a per-response bound and may
exceed the project-wide soft stopping target; see Questions ready above.
Input detail normally targets **48,000 characters**. If full detail still does not fit,
the deterministic task planner switches to an explicitly partial working set:

- Pin current input records, all current human sources in selected discovery areas
  (including project-wide and transitive dependency decisions), non-proposed
  requirements, related proposals, and exact task/unconfirmed-requirement evidence.
- For historical answered questions pulled in by retained human answers, keep exact
  wording, options, answer links, and provenance links, but make workspace excerpts
  that only motivated those questions optional. A task question (or its current
  answer source) still pins its files; unconfirmed requirements still pin their source
  files. Human evidence links continue to resolve. `tasks-v3` packages explicitly
  list omitted historical question/file links and prohibit citing those omitted
  files or claiming their implementation was reviewed.
- An accepted background requirement with current human confirmation keeps its exact
  statement, acceptance scenarios, provenance links and all human evidence, while
  workspace excerpts used only to motivate it are optional. `tasks-v6` packages list
  those links in `omittedRequirementWorkspaceEvidence`; omitted files cannot be cited
  or treated as reviewed/current implementation. A requirement/review being processed
  now, or cited directly as motivation by the current question, still pins its files.
  Any other included evidence needing a file pins it too. Needs-review/unconfirmed
  requirements and missing, superseded or mismatched approvals keep full file evidence.
  Approvals still persist and receive queued follow-up; this changes evidence selection.
- Keep question wording, options, status, and answer links exact. Remove generated
  concept annotations and `whyItMatters` outside task questions. Human text is never
  summarized or truncated. Previous assessments and organization proposals stay saved.
- Broad discovery can fill remaining space with fitting related proposals, open questions,
  and research. Isolated queued follow-up does not refill unrelated feature detail.
  A separate index of up to 60 excerpted labels is navigation only. Its oldest
  labels are dropped as needed to fit exact evidence and optional detail; an
  oversized navigation index cannot cause a mandatory-evidence budget failure.
- Preserve project summary, goals, actors, assumptions, scope confidence, and existing
  assessments when applying partial results. Partial passes cannot perform organization
  operations or replace whole-area coverage assessments.
- Process each queued submission with its own exact evidence closure and guardrails,
  regardless of how many other responses could fit. Each commits independently and
  the next replans at the latest revision. No job claims multiple submissions.

This continues finite submitted work, without autonomously generating discovery
rounds beyond the queue. After context selection and compaction, a discovery task whose
mandatory evidence exceeds 48,000 characters can use a **96,000-character hard
fallback bound**. This fallback retains exact human constraints and linked evidence,
adds no optional detail, and records the expanded budget and selection reason in
the job manifest with a visible progress message. Before rejecting a package above
that hard bound, discovery also removes task questions' AI-generated `whyItMatters`
explanations. The package lists affected question IDs and the manifest records the
omission; exact question wording, options, answers, and linked evidence remain.
Saved question help remains available in the UI. Lossless sharing now targets the
normal **48,000-character** bound for oversized mandatory-only discovery packages,
even if they already fit below 96,000. A compacted package that fits keeps the normal
budget and does not refill the recovered space with optional detail. Discovery shares
repeated text fields and exact repeated lines of at
least 80 characters (including ordinary short requirement review statements)
through a `sharedText` table. This lossless wire encoding also handles wording embedded
in saved review snapshots: records retain their IDs and links, and text fields use
references or ordered literal/reference parts. Expanding them reproduces the exact
text, including whitespace. The prompt explains the encoding and requires citations
to record IDs, never text-table keys. `tasks-v2` manifests record original/final sizes,
shared-text/reference counts, and final section sizes. The table is used only when
it reduces the package size; saved records and UI text remain intact.
If repeated text is insufficient to reach the normal target, another pass shares repeated record and
scope IDs through `identifierTable`. Integer values in identifier fields (`id`,
names ending in `ID`/`IDs` except `sharedTextID`, and `dependencies`, including array
elements) reference the table's exact original strings. Other numbers and human
prose are unchanged. The prompt requires expanded original string IDs in all output
and citations; validation and manifests retain original IDs. `tasks-v4` manifests
record identifier/reference counts and pre/post sizes. This pass is retained only
when it saves space and does not raise the hard bound.
If the package is still above the normal target, `tasks-v5` replaces repeated field
names with record tables: ordered `columns` and `rows`, plus `absent` coordinates
for missing fields. Source/question/requirement records and nested options can use
these tables. Values, whitespace, record order, and provenance are preserved exactly;
the prompt requires table expansion before resolving ID/text references. Both each
table and the complete pass must save space. Manifests record table/row counts and
original/final sizes. Stored/UI data keep their original object representation.
Question help and scan planning keep their separate bounds. Mandatory evidence beyond 96,000 characters still fails
before inference and may require a scope/dependency split.
Omitted records and excerpted indexes are explicitly reported; references to evidence
outside the working set are rejected. Each job records a versioned context manifest,
revision, focus, included/omitted IDs, character count, and section sizes. Task packages
also record partial scope, task/indexed IDs, selection reason, and submission IDs.
Activity technical details distinguish task-sized passes and their response counts.
Oversized
failures also retain their attempted manifest and report the actual size, budget,
number of included areas, and largest sections before any model call.

This is a conservative working-data character budget, not an exact model tokenizer,
total prompt-size limit (instructions/schema are additional), or dynamic provider
context-window calculation. Persisted source records remain authoritative;
epic descriptions and AI interpretations do not replace them.

Partial passes also use a smaller task-specific prompt and response schema. They
return fixed valid placeholders for global summary/scope and empty global arrays,
whose values are not applied to the project. Full organization/coverage instructions
and schemas stay available to complete passes. Research-disabled calls require empty
research findings, and a zero-question budget has no question-item payload schema.
App-authored table explanations define lossless decoding without duplicating all
those instructions in every prompt. These changes reduce input/output overhead while
storage independently enforces scope, evidence, and stale-revision rules.

## Research

Targeted research is enabled by default in the browser and can be disabled before
creation or in **Settings**. Sources appear under **Activity → Research sources**. The CLI remains opt-in:

```powershell
npm run reqwizit -- analyze --project "project-id" --expected-revision 1 --research
```

The research profile exposes only `websearch` and `webfetch`. The prompt requests at
most four calls; event monitoring cancels unexpected tools or budget overruns, and
the final stored tool trace is checked before applying proposals. This is a monitored
budget, not a guaranteed pre-dispatch billing ceiling for parallel tool calls.

Findings must cite URLs observed in successful tool output. Fetched pages and search
snippets are distinguished. Links merely appearing inside a fetched page are not
treated as retrieved pages. Sources retain retrieval dates, excerpts, and findings;
full runtime tool output remains associated with the recorded OpenCode session.
Citation validation proves retrieval provenance, not the truth or entailment of every
model-authored claim. Retrieved content is evidence, not a user's product decision.

## Local service boundary

The server binds only to 127.0.0.1, validates Host, requires a per-launch session token
for APIs, checks same-origin mutations, bounds request bodies, and serves only built
UI assets. OpenCode/provider credentials remain in the runtime. Browser clients never
access SQLite or provider credentials directly.

Discovery runs as background work in the foreground service process, so closing or
reloading the page does not cancel it. Shutdown cancels owned work. After an unclean
exit, expired leases are classified without repeating model calls or stealing live
leases. CLI processes still use the shared store/service in process; automatic
daemon discovery and CLI-to-HTTP attachment are not implemented.

## Verification and known limits

October 15, 2026:

- Inline summary follow-up: type checking, all 76 deterministic tests, production
  UI build, and Playwright checks passed. Browser coverage verifies the word
  tooltip stays open through loading and completion, shows only the opening
  summary while retaining the full response below, dismisses with Escape even
  after its request button is replaced, and reopens saved summaries on mobile
  and after reload. Earlier project context is labelled. No live model calls
  were made for this follow-up.

- Proactive concept/word-help update: type checking, all 76 deterministic tests,
  the production UI build, and Playwright browser checks passed. New browser
  coverage exercises question and suggested-answer word shortcuts, keyboard
  activation/Escape, immediate and running-job spinners, preserved drafts and
  option choices, persisted clarification history after reload, and mobile layout.
  No live model calls were made; the more proactive annotation prompt's live
  explanation frequency and quality remain unqualified.

- Compact-workspace checks passed type checking, deterministic tests, the UI build,
  and Playwright browser checks. Browser coverage includes collapsed question rows,
  feature/category context, editing/cancelling saved answers, waiting-answer
  replacement with retained history, the grouped map and requirement confirmation,
  explanation tools, draft preservation across question switching and round completion,
  queue reload persistence, and mobile layout without horizontal overflow. API checks
  exercise corrections during processing and the next round's authoritative answer.
  These checks use deterministic adapters; no live model call was made for this UI change.

- Deterministic core/API checks cover organization, evidence validation, scoring,
  backward compatibility, context bounds, CSRF/session checks, revisions, and jobs.
- Resume-overflow regression checks cover failed-job size diagnostics, zero adapter
  calls on overflow, focused recovery of answers/notes without duplicate sources,
  retained submissions in other areas, and size-aware automatic context selection.
  In this fix's verification run, the type check and relevant deterministic tests
  passed and the UI built. The full browser check stopped at the existing mobile
  concept-tooltip tap assertion (`src/web/browser-check.ts:79`), before queue checks;
  this run does not establish a passing end-to-end browser result.
- Follow-up compaction checks passed type checking and 34 relevant deterministic
  core/service/API tests. They verify oversized focused contexts can fit by removing
  explanatory metadata and duplicate labels, exact saved records remain intact, the
  adapter receives the compacted JSON, and still-oversized inputs remain blocked.
  No live project/model verification was performed for this follow-up.
- Question-help checks cover exact concept references, advisory-only persistence,
  history across SQLite reopen, malformed responses, cancellation, failures, stale
  revisions, expired leases, concurrent-request guards, and input/context bounds.
  Browser checks cover tooltip hover/focus/tap/Escape, separate answer selection,
  rephrasing, follow-ups, cancellation, saved history, and draft preservation.
  These checks use deterministic adapters; live model explanation quality and
  semantic preservation of rephrasing have not yet been live-qualified.
- Playwright exercised project creation, epic selection, option-based answering,
  confirmation, answering during deliberately held background rounds, processing/
  waiting views, draft preservation across round completion, queue reload persistence,
  and a 390px mobile layout without horizontal overflow. This uses a synthetic adapter
  with no model calls. Deterministic storage/API tests also verify batched contexts
  across epics, idempotent submissions, conflicting answers, failure pause/retry, and
  explicit resume after service shutdown/restart.
- A real ChatGPT `gpt-6.1-sol` round fetched the official RSS 2.0 specification and
  Atom RFC 4287 through two webfetch calls. It saved four source-backed findings,
  two functional epics, three questions, two proposals, and coverage assessments.
  The resulting project estimate was **27%**. Job:
  `0a810ac4-d98f-4ea9-948d-5aca908c38a8`; pre-rename local demo store: `.wizard-state/browser-live`.
- The preceding research attempt hit an unintended 90-second HTTP deadline and
  preserved revision 1. The shared HTTP wrapper was fixed to retain SDK Request
  cancellation and allow a five-minute prompt deadline; the retry completed.
- Live webfetch is verified. Websearch exposure/extraction is implemented but live
  websearch, adversarial permission enforcement, and over-budget cancellation have
  not yet been live-qualified. No claim of a general tool sandbox is made.

Historical-question evidence follow-up (2026-10-16): read-only planning against the
reported saved batch `3f545e12` at revision 75 reproduced the 105,552-character
failure even after shared-text compaction. Eight workspace excerpts were included
only through historical answered-question motivation, with no links from included
requirements. Making that motivation optional reduced this exact task package to
78,576 / 96,000 characters, retaining human decisions, questions/options, requirements,
and required file evidence. This was local planning only, with no inference or changes
to saved project/submission state. Regression coverage also checks that making an old
question or its answer the current task restores mandatory file evidence.
`npm run check`, all 141 deterministic tests, and `npm run build:desktop` passed.
The rebuilt desktop planner was also checked read-only against this same saved batch;
all previously included human sources and requirements, plus question wording/options/
answer links, were verified exact. The saved requirement remains accepted; its failed
AI follow-up awaits explicit resume. The build emitted Node engine warnings under
the available Node 20.11 host; Node 22.12+ remains the development baseline.

Queue preflight guards (2026-10-16): `npm run check`, 49 targeted core/storage/API
tests, `npm run test:browser` and `npm run build:desktop` passed. Regression coverage
isolates an oversized first answer while a second feature completes, retains blockers
across queue restart, verifies repeated unchanged resumes create no failed jobs, and
checks successful scoped recovery without duplicated human input. The browser check
approves a requirement against oversized unique guardrails and verifies that acceptance
is saved, Review/round/queue show the context blocker, reload preserves it, repeated
resume adds no job, and diagnostics fit mobile width. Screenshot:
`.reqwizit-state/browser-context-blocked.png`. The desktop build succeeded after closing
the app to release SQLite's native file lock; the Node 20.11 host emitted engine warnings
and Node 22.12+ remains the development baseline. A compiled-desktop queue fixture
also verified two unchanged over-budget resumes create zero jobs/model calls and only
one copy of the human source. No live model call was made.

Review-related context follow-up (2026-10-16): read-only planning against failed
answer batch `c3ee3fb3` at revision 118 identified 22 accepted requirements pulling
five workspace excerpts (32,566 characters of file text) into later task context.
Making only confirmed background requirements' workspace motivation optional reduced
the package from **98,165 to 86,032 / 96,000 characters**. Two excerpts were omitted;
three remained required by the current question and its motivating requirement.
All previously included human sources, requirement records and question wording/options/
answer/evidence links were reconstructed exactly. The saved answer “Adopt 3D graphics
for this release” remains intact. No inference, retry or project/submission mutation
was performed. New regression coverage checks current review/requirement/approval-linked
question file restoration and retention for unconfirmed, superseded or wrong-owner
approval evidence. Live response quality remains unverified.
`npm run check`, all 147 deterministic tests, desktop TypeScript compilation, and
`git diff --check` passed. The compiled desktop planner also produced 86,032 characters
for this batch in a read-only check.

Prompt/planning optimization follow-up (2026-10-16): on saved batch `0418c5e0` at
revision 108, the full discovery prompt shrank from 100,237 to **93,457 characters**
while the evidence package remained exactly 82,048 characters. Instructions/schema
overhead fell from 18,189 to 11,409 characters. Read-only warm planning samples were
roughly 33 ms before versus 14–16 ms after incremental index sizing; this is a local
microbenchmark, not a model-latency claim. Partial response placeholders are checked
against the normal Analysis contract and preserve global interpretation in storage.
New checks cover no-research/zero-question schemas and exact escaped/Unicode index
size accounting. Live token usage, model interpretation, and output-latency savings
remain unverified; no inference or queue retry was performed.
`npm run check`, 46 targeted core/service/research/API tests, desktop TypeScript
compilation, and `git diff --check` passed. The compiled desktop prompt was also
checked read-only at the same 93,457-character total.

Proactive compaction follow-up (2026-10-16): the same saved batch at revision 108
now plans at **82,048 / 96,000 characters**, down from 104,810 before lossless sharing
and 87,994 with text/ID sharing alone. Tables save a further 5,946 characters; exact
source, requirement, question/options/evidence-link, and task-ID reconstruction was
verified read-only, with no model call. Deterministic coverage also verifies early
compaction within the normal budget and five saved responses sharing a mandatory-heavy
background in one call. Large-context live use of record tables remains unverified.
`npm run check`, 43 targeted core/service/API tests, and desktop TypeScript compilation
passed. The compiled desktop planner also produced 82,048 characters in the read-only
saved-batch check. No inference or queue retry was performed.

Identifier-sharing follow-up (2026-10-16): read-only planning against saved batch
`0418c5e0` at revision 108 reproduced its 102,952-character shared-text package
(104,810 before text sharing). Lossless identifier sharing reduced it to
87,994 / 96,000 characters. Decoding both tables reproduced the included sources,
requirements, exact question wording/options/answer/evidence links, and task IDs.
Saved project state was unchanged; no model call or automatic queue retry was made.
`npm run check` and 30 targeted working-set/discovery/help tests passed, including a
synthetic package that exceeds the hard bound after text sharing alone and exact
round-trip coverage for both encodings together. `npm run build:desktop` passed
after closing the running app to release its native SQLite file lock; the rebuilt
desktop planner also produced 87,994 characters for this saved batch in a read-only
check. The Node 20.11 host emitted engine warnings; Node 22.12+ remains the baseline.
Large-context live output quality
and successful model use of the new identifier encoding remain unverified.

Single-submission queue correction (2026-10-16, DEC-021): queue inference now processes
one submission per job, with isolated context from the start rather than grouping
saved responses or importing unrelated feature history. Read-only checks against
revision 264 reproduced all 12 saved blockers individually at roughly 96,100–96,400
characters under the old planner: grouping alone was not the cause. The isolated
planner fits each at **45,839–46,627 / 48,000 characters**. Exact included sources,
requirements and question wording/options/links were verified, and other waiting
review sources were excluded. The compiled desktop planner produced the same bounds.
The database was unchanged and no live inference or queue retry was performed.
`npm run check`, all 152 deterministic tests, `npm run test:browser` (including the UI
build), desktop TypeScript compilation and `git diff --check` passed. Regression
coverage includes 12 separate review jobs, serial processing across reloads, fresh
revisions, guardrail/file retention, blocked-item skipping, failure/cancellation,
explicit restart/resume and no replay of completed work. Earlier grouping/compaction
measurements below describe their dated implementations, not current queue policy.

Hard-bound review fallback (2026-10-16): read-only planning reproduced the spark-emitter
review submission `cdaf000e` at revision 261 at **120,493 / 96,000 characters** after
lossless sharing. A final `tasks-v7` pass explicitly omits generated rationales for
currently human-confirmed background requirements and unselected historical option
consequences, reducing this package to **95,544 / 96,000 characters**. It retains exact
human sources, requirement wording/scenarios/links, question wording, all option labels
and selected consequences. Option consequences are omitted only for a unique exact
current answer-label match; freeform, ambiguous, superseded and current-task-linked
answers retain all consequences. Current task requirements and unconfirmed requirements
retain their rationales. This pass runs only after the encoded mandatory package still
exceeds 96,000 characters; the cap remains unchanged and oversized human evidence still
blocks inference. Omissions are named in context and must not justify new decisions.
No model call, queue retry, or project/submission mutation was performed.

Verification: `npm run check`, all 151 deterministic tests, and desktop TypeScript
compilation passed. Read-only decoding of this saved package verified 87 source
records exactly, 57 requirements with only the named background-rationale omissions,
and 28 questions with only the named unselected-consequence omissions. The spark-emitter
task's full requirement remains present. Project and submission payloads were unchanged.

Lossless context-sharing verification (2026-10-16): `npm run check` and all 140
deterministic tests passed. Regression coverage includes a 105,552-character mandatory
package, exact reconstruction of shared review/requirement evidence, unchanged stored
records, adapter/prompt delivery, persisted diagnostics, and a genuinely oversized
unique-evidence package that still stops before inference. No live model call or
verification against the reported project's saved data was performed.

Automatic context management verification (2026-10-15): `npm run check` and all
62 deterministic tests passed, including a 50,777-character post-compaction fixture,
multi-area and single-area grouping, dependency/confirmed-evidence retention,
partial-result guards, later-group failure/cancellation, restart/resume, and bounded
question help. `npm run test:browser` passed with Chromium and includes the production
UI build. These checks use deterministic adapters; large-context live model output
quality has not been qualified by this change.

Remaining work includes deeper scenario/conflict review, readiness baselines, richer
requirement editing, tokenizer/model-capacity calibration and live qualification of
large-context task passes,
provider auth onboarding and portable handoffs. The [Electron desktop wrapper](desktop.md)
now reuses this workspace and adds native folder selection and quit/cancel lifecycle.

### Browser check setup

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.reqwizit-state/browsers"
npx playwright install chromium
npm run test:browser
```

Browser checks build the UI and write ignored screenshots under `.reqwizit-state/`.
The rename checks verify the Reqwizit page title and branding, migration of legacy
browser preferences, and preservation of newer preference values. Existing
Playwright installations can be reused by setting `PLAYWRIGHT_BROWSERS_PATH` to
their installation directory.
Routine checks: `npm run check`, `npm test`, `npm run build:ui`, `git diff --check`.
