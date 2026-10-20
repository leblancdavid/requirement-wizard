# Browser workspace, epics, and estimated completeness

## Repeated questions and overlapping requirements

### Resolve candidates through Refine

Use **Review → Refine requirements** for both wording cleanup and duplicate/conflict
resolution. The separate **Check approved requirements for duplicates and conflicts**
section was removed. Choose **All project areas** for project-wide checks; a selected
feature limits Refine to pairs touching that feature, including cross-feature
counterparts and their full evidence. Only approved requirements in active features
participate in pair resolution; proposed, rejected, needs-review and archived-feature
records are excluded from that stage. Refine checks candidate approved pairs first,
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
drawer over the workspace; **Stop** is available inside while active. Closing with
Close, Escape or the backdrop restores focus to the header and leaves work running.
The drawer uses the full screen on narrow viewports and keeps keyboard focus inside.
OpenCode stages distinguish runtime startup, model/session preparation, awaiting the
model, receiving output and validation; research reports tool requests. Direct ChatGPT
reports request/response stages too. These are application/runtime observations, not
an AI-generated account of internal reasoning or a completion percentage. The status
wraps below the title/progress on narrow screens, and completed/stopped/error states
remain in the header. Progress messages are transient; saved jobs retain their results
and diagnostics as before.

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
The five-pending-question limit is project-wide. Discovery prompts report the global
pending count and remaining slots even when some questions are outside the working
set. The response schema caps new questions at the available slots plus detailed
pending questions eligible for evidence-backed retirement; deferred retirements free
no slots. A full batch can still receive summary, requirement and assessment updates
with no new questions.
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
