# Browser workspace, epics, and estimated completeness

Status: first playable local browser application. It shares the existing SQLite
projects with the terminal client. No desktop installation is required.

Source-folder initialization is available during creation: choose **Existing project**,
select a folder first, review editable local name/description/type suggestions, and
choose **Create & initialize existing project**. Preview uses no AI calls. Connected projects also offer **Initialize from
folder**, or **Rescan folder** after the first scan, on the Project map and in workspace
Settings. Review inferred requirements before explicitly starting **Explore next gaps**.
Last-scan details expose inspected files/evidence, changes and omissions. See
[initialization and rescanning](project-workspaces.md#initialize-definitions-and-rescan)
for source transmission, limits, exclusions and verification status.
Scans save validated results in small sequential batches. Interrupted scans offer
**Resume scan** to reuse saved batches and the displayed file snapshot, or **Start new
scan** to read current files. Older failures without checkpoints offer **Retry initialization**.
Ordinary discovery stays blocked until initialization succeeds. Expanded questions include **Unrelated / dismiss** beside
**Save response**. **Questions → Bulk question actions & history** provides batch dismissal
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
table schema remains version 1.

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
the header shows their saved revision or sync conflict. **Project map → Implementation
progress** records manual build status and verification evidence independently of
requirements review. See [local project workspaces](project-workspaces.md) for file
layout, folder browsing, reconnect/retry, conflict resolution, and recovery behavior.

1. Create a named project with an idea; **Create & explore** starts its first round.
2. Start in **Questions**. Use the feature filter to focus on an area if needed.
3. The first unanswered question opens automatically. Choose an option or type an
   answer, then save; the response moves to Submitted and the next question moves
   to the top and opens automatically. Other compact rows can be opened manually.
   Only one question is expanded at a time; unsaved answer drafts survive switching
   questions and background polling within the current page. No IDs are needed.
4. By default, submitted responses queue a follow-up organization/discovery round.
   Keep answering while discovery runs; waiting answers are batched into the next round.
   In **Settings**, disable **Automatically explore queued answers** to save without starting another
   round, then choose **Explore next gaps** when ready.
   Research and automatic-follow-up preferences are retained in this browser.
5. Expand **Add information** for free-form ideas/corrections. Original text is retained.
6. Open **Project map**, expand a feature, then a requirement to review acceptance
   scenarios, supporting decisions, and confirmation/rejection controls. Review
   changes to confirmed information before applying reorganization proposals.
7. Use **Activity** for processing history, revisions, research sources, and technical
   context diagnostics. **Definition progress** is collapsed under the map/activity
   views; selecting a feature exposes its detailed assessment categories and evidence.

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

**Project map** is a grouped feature outline with confirmed/to-review/open-question
counts. Requirement details, acceptance scenarios, supporting evidence, feature
editing, notes, and organization controls open on demand. **Definition progress**
uses the existing coverage calculation and plain-language assessment labels; it is
an estimate of identified work, not completeness or build readiness.

Each round is bounded and stops for the human. It does not autonomously run an
unlimited sequence of calls: automatic follow-ups run only for new saved submissions.
Model calls consume subscription allowance and can
take a minute or more for detailed assessments/research.

### Processing and queue

In **Activity → Revisions & processing**, expand **Processing & queue** to see
(the panel also appears in other views when processing is paused or needs attention):

- **Currently processing**: full question text, exact submitted response, response
  type, submission time, and batch identifier for the active discovery round.
- **Waiting next**: durably saved submissions in submission order. These do not
  change the active round's revision; they are applied together at its boundary.
- **Saved · awaiting discovery**: applied answers/notes awaiting a manual round when
  automatic discovery was disabled.
- **Completed batches**: submissions whose discovery result was successfully applied.
- **Replaced responses**: superseded waiting answers retained only for history.
- **Needs attention**: unsuccessful batches or responses whose question/previous
  answer changed before application. Original submitted text remains available.

Questions and notes remain usable while discovery runs. Submitted questions move out
of the main question list and previous-answer forms while queued/processing; their
full text and responses appear in **Submitted** and **Processing & queue**. The Questions tab counts
the remaining questions to answer. Other question drafts survive polling and
background round completion. Completed answers return to the previous-answer view;
responses needing attention become available for review again. Submitted responses
can be edited from the Submitted filter even while a round is active.
The queue and active-batch view survive page reload. A fitting working group is
analyzed together; oversized batches are divided automatically before inference.
Progress reports the current group's response count and how many are waiting.

Stop, a failed/stale round, or interruption pauses automatic processing. Expand the
queue and choose **Resume discovery** (or **Explore next gaps**) to explicitly retry
applied responses and include waiting inputs, without adding duplicate human sources.
Conflicting unapplied responses need review and resubmission against the current
question; a retired question's retained response can be copied into a note. Restart
retains pending submissions and requires explicit resume rather than repeating model
calls. Context planning uses no model calls. Completed groups stay completed when
a later group fails; resume retries only unfinished work and reuses saved sources.

A focused resume applies and analyzes only that area's queued/saved responses, in
multiple working groups when necessary. Other areas stay pending, and the queue
pauses again if unrelated work remains. Select **All project areas** to let the
planner group remaining responses across areas automatically. An indivisible task
whose mandatory human constraints still exceed the budget stops before inference
with its attempted manifest retained; review that area's notes/dependency scope or
split its work. Saved human input is preserved.

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
Input detail is bounded to **48,000 characters**. If full detail still does not fit,
the deterministic task planner switches to an explicitly partial working set:

- Pin current input records, all current human sources in selected discovery areas
  (including project-wide and transitive dependency decisions), non-proposed
  requirements, related proposals, and exact recursively linked evidence.
- Keep question wording, options, status, and answer links exact. Remove generated
  concept annotations and `whyItMatters` outside task questions. Human text is never
  summarized or truncated. Previous assessments and organization proposals stay saved.
- Fill remaining space with fitting related proposals, open questions, and research.
  A separate index of up to 60 excerpted labels is navigation only. Its oldest
  labels are dropped as needed to fit exact evidence and optional detail; an
  oversized navigation index cannot cause a mandatory-evidence budget failure.
- Preserve project summary, goals, actors, assumptions, scope confidence, and existing
  assessments when applying partial results. Partial passes cannot perform organization
  operations or replace whole-area coverage assessments.
- Split saved-response batches greedily into fitting groups, including within one
  epic when its task-specific detail is too large. Each group commits independently;
  the next one replans against the latest revision. Only its submissions are completed.

This continues finite submitted work, without autonomously generating discovery
rounds beyond the queue. A single task plus mandatory human constraints that still
does not fit fails before inference. This conservative constraint can still require
a scope/dependency split for areas containing too much human evidence.
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
