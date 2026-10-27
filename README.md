# Reqwizit

A local-first application that helps people turn a software idea into a reviewed
specification and an actionable AI build plan.

Describe an idea, answer adaptive questions, investigate uncertainties, and review
the resulting requirements. Start with the local browser app or terminal interface, with
ChatGPT subscription access through app-owned sign-in (direct preview) or an existing
OpenCode connection. Direct live compatibility is not yet qualified. GitHub Copilot
support is deferred.

OpenCode-backed requests now use the **V2 API** (`@opencode/client@2.1.4`). On
Windows, Reqwizit discovers the desktop-installed V2 CLI instead of preferring a
stale npm V1 executable. Provider sign-ins stay in OpenCode's V2 store; no token
copying or project reset is needed. See [runtime compatibility](docs/runtime-spike.md).

## Project status

The workspace now has one home for requirements (**Specification**, including
feature organization), unfinished work (**Processing & queue**) and technical
details (**Application menu → Logs**). See [workspace responsibilities](docs/workspace-navigation.md)
for diagnostic retention and verification limits.

User-facing guidance is being kept at product-owner level: plain explanations first,
with internal processing details available separately. See the
[language conventions](docs/user-facing-language.md) for scope and compatibility.

**Coordinated workflow (preview)** adds **Continue project** to sequence saved input,
questions and specification checks with a shared bounded allowance and decision
inbox in Processing & queue. Opt-in per project; saved work and advanced actions
remain. Passed checks lead to planning, not automatic coding. See
[coordinated workflow](docs/coordinated-workflow.md) for consent and limitations.
Unresolved definition behavior can now produce targeted questions; answers trigger
affected rechecks using the same allowance.
Partial assessment categories are not individual human input tasks. In Specification,
**Clarify in Design** can turn an area's findings into focused questions with answer
options, or explain that no new decision is needed, after explicit AI-usage confirmation.
Large clarifications use saved exact-evidence read/check batches; Design offers
**Continue clarification** after a pause without repeating completed steps.

Oversized targeted review follow-ups and requirement-scoped answers also use saved
evidence batches when needed. Resume processing the retained response; no duplicate
submission is required, and changes publish only after every batch is verified.
Oversized individual wording refinement now uses exact batches too; **Processing &
queue → Continue refinement** resumes that saved requirement only. Full target
support stays exact, and wording proposals still need approval. Oversized pair
comparisons also use saved batches; both stories and their supporting evidence stay
exact, and Continue refinement resumes that comparison only.

**Specification** now replaces routine Review: explicit answers, notes and targeted
change requests can maintain current requirements without another approval. Design
shows what changed; **Needs your decision** retains genuine exceptions and existing
proposals. Original answers, earlier approvals and history are preserved; no coding
starts automatically. See [continuous specification](docs/continuous-specification.md)
for the implemented first slice and its limits. Older Review references below describe
legacy/manual exception workflows.

The top-left application menu contains **New project**, **Open project**, **Recent
workspaces**, and **Settings**, replacing the persistent sidebar. The header follows
your accent color. Desktop users also get **Quit**, with the same safe shutdown as
closing the window; regular browsers do not show it.
The desktop uses a branded Q/checkmark icon. On Windows, a slim draggable title bar
matches the app accent and integrates native minimize, maximize/restore and close
controls. See [desktop](docs/desktop.md) for builds and verification limits.

A playable browser workspace is available. AI organizes your idea into epics, asks
clickable questions, researches relevant uncertainties, and estimates how well each
area is defined. The top-right **Overall progress** card expands into definition
coverage, requirements review and verified main-delivery scores, with epic breakdowns.
The breakdown separates saved questions answered and local code findings from
definition coverage and verified delivery to main. Missing/outdated definition
assessments display **Not assessed** / **Assessment outdated**, rather than a misleading
zero. Unassessed areas have unknown gaps; outdated critical flags are separate from
current gaps. Expand an area's definition assessment in the breakdown for category
explanations and linked evidence. Local code findings do not earn main-delivery credit.
Review requirements and coverage evidence without entering IDs.
Use **Overall progress → Refresh definition coverage** for a complete current-area
assessment, separate from gap discovery. Relevant evidence changes—not every project
revision—make it outdated. The dialog also separates discovery blockers from assessed
definition gaps. Large areas use resumable exact evidence batches; indivisible
evidence and stage-limit blockers stay explicitly unfinished. See
[definition coverage](docs/definition-coverage.md) for bounds and upgrade behavior.
Definition refresh now continues through all selected pending areas until finished
or paused, with no shared fifteen-minute or ten-area cutoff. Requests consume your
AI allowance; **Pause assessment** saves completed work. Individual request timeouts,
evidence/attempt limits and stale-result protection remain. Restart requires explicit
continuation. Automatic maintenance and coordinated workflow keep separate allowances.
Successful evidence gathering is separate from failed requests. **Refresh definition
coverage** continues saved work and asks inline if repeated failures need one extra
request; there is no separate recovery screen or silent allowance reset.
SQLite retains project state, original answers, revisions, and jobs across restarts.
Definition refresh now coalesces portable folder export until finish/pause while
SQLite checkpoints stay immediate; pause before sharing its latest `.reqwizit/` state.
The queue shows cumulative refresh requests and area progress. See
[refresh efficiency](docs/definition-coverage.md#refresh-efficiency-and-evidence-references-2026-10-27).
Use **Settings → Project settings
→ Automatic maintenance** to opt in to definition updates after relevant decisions change: edits settle for
20 seconds, then at most eight requests/five minutes/three areas run per burst.
No initial bulk sweep or automatic approvals/coding; app restart requires resume.
Affected areas still receive full evidence review, not delta-only assessment. See
[guided maintenance](docs/guided-maintenance.md) for controls, costs and limits.
Queued areas, blockers and pause/resume controls live in **Processing & queue**.
Design, Specification and Overall progress retain their existing workflow actions;
there is no separate “What’s next?” summary card duplicating those views.
**Discover missing decisions** (in Design or the idle top process bar) reviews related workflows and their declared dependency
boundaries. The compact **Questions ready** input configures how many unanswered questions to
keep ready (1–50, default 5). Gap exploration continues through bounded packages,
showing results as they save. The target is a stopping threshold, not a quota or
hard cap: useful questions from the final package are kept even above the target.
Both buttons start the same discovery action: related
records are reviewed together across behavior, recovery and acceptance, with exact
linked evidence prepared locally and no model-driven search/paging. Select a feature
or work epic by epic; dependency-boundary packages follow. Existing saved checks are
preserved separately. Oversized shared decisions can use checkpointed exact batches:
draft gaps publish only after every batch checks them. One action continues staged
packages automatically, up to 32 requests per package within a fifteen-minute action.
Stop saves progress; budget stops say **Paused—progress saved**. Explicit Resume keeps
completed stages without replay; app restart never starts calls automatically.
See [epic workflow review](docs/epic-workflow-review.md) for
bounded packages, blockers, recovery and verification limits.
New workflow reviews use a [graph-backed current-specification context](docs/discovery-efficiency.md)
to traverse exact evidence and reduce redundant generated background, while keeping
human history saved and compatible completed reviews reusable. Benchmark locally with
`npm run benchmark:discovery`; live model speed/quality gains are not yet established.
To investigate a real run, use **Processing & queue → Export discovery diagnostics**.
New runs record bounded timings/context counts; older timings remain unknown. Review
the metadata-only JSON before sharing; original text, paths and credentials are excluded.
Queue **Resume processing** stays on workflow discovery when no human input is
waiting; saved responses are processed separately without falling back to legacy
gap checks. Compatible saved workflow stages and spent attempts are preserved.
Workflow startup prepares only through the next eligible package in an owned CPU
worker. **Preparing workflow evidence…** shows progress before inference; initial
preparation can be stopped and has a two-minute deadline. Partial package counts are
labelled explicitly rather than presented as a whole-project assessment.
Explicit retries retain compatible local groups and partition probes across
bookkeeping-only revisions; unchanged size blockers remain visible rather than
being counted as reviewed. See [planning recovery](docs/discovery-efficiency.md#workflow-preparation-retry-fix-2026-10-27).
Gap discovery can request additional exact saved evidence in up to three bounded stages,
retaining human constraints and checkpointing completed calls for explicit retry. Navigation
hints cannot support citations; oversized evidence blocks rather than silently truncating it.
Compatible saved stages also survive unrelated specification revisions; original model-call
provenance is retained and publication still checks the latest revision.
Gap tasks can also search bounded saved-record prefixes for handles outside displayed
indexes, then explicitly load exact evidence. Search labels are navigation only and
share the existing request budget; omissions and blockers remain visible.
Snapshot-bound continuation handles can advance result/text windows or queries can be
refined. Paging does not add requests: another search page can leave insufficient budget
to load its exact evidence and analyze it.
For an exhausted saved gap task, **Continue exploration** offers an explicit one-time
allowance of up to three additional requests (six cumulative attempts maximum), retaining
saved stages and spent calls. Ordinary Resume does not reset the limit or grant calls.
After six attempts without a final response, unchanged checks remain request-limit blocked;
legacy individual-check exploration moves to other pending checks rather than repeatedly selecting them.
The [deterministic retrieval baseline](docs/retrieval-baseline.md) records first-query
hits, intentional misses and exact-use blockers on large synthetic saved projects.
An [offline candidate evaluation](docs/retrieval-evaluation.md) compares bounded retrieval
approaches across two domains; density-ranking and sampling policies are not enabled in the app.
A [prefix-preserving merge experiment](docs/retrieval-merge.md) tests auxiliary-field gains
through actual service/checkpoints. A [default-off browser pilot](docs/retrieval-browser-pilot.md)
retains explicit legacy API/recovery testing; the workflow button does not use search,
and terminal and automatic discovery keep default search.
Connect a local folder for each project to automatically save versionable requirements
and progress files. Choose it during creation or use **Settings → Project workspace**.
Generated requirements are split by stable feature ID with a linked overview and shared
evidence files; unchanged outputs are not rewritten. Commit `.reqwizit/` with your code
and use **Open Reqwizit project** after cloning to restore decisions, reusable assessments,
plans and continuation checkpoints into a local database without model calls. Imported
work starts paused. Existing `.requirement-wizard/` folders migrate safely on sync;
active implementation workers defer publication. After pulls, use **Open shared
checkpoint** in workspace Settings; divergent local work blocks adoption. See
[portable team state](docs/project-workspaces.md#share-and-continue-a-project-dec-029)
for coordinated editing, Git baselines, retention and current recovery limits.
Use `npm run --silent reqwizit -- export --project "your-project-id" [--json]` for a
combined specification on demand.
Folder scans process small sequential batches and save checkpoints; **Resume scan**
continues interrupted work using the saved file snapshot without repeating completed batches.
**Project map** shows each epic's purpose, lifecycle status, delivery percentage,
outstanding reviews/questions, and links into Design, Review and Implement. Expand
**View details** for requirements and evidence. Historical/manual build notes remain
under **Manual implementation records → Implementation progress**; they do not count
as delivered. See [local project workspaces](docs/project-workspaces.md).
**Implement**, beside Review, adds evidence-backed assessment, dependency order,
per-requirement/epic execution and resumable local OpenCode runs. Verified work is
committed automatically using GitHub PR-per-requirement, PR-per-epic, named-branch or
direct-main delivery. Its count only decreases for verified delivery to main; PRs
wait for your merge. See the [implementation pilot](docs/implementation-workspace.md)
for setup, deterministic verification and remaining live-qualification gaps.
The Implement tab groups **Check progress**, **Prepare plan**, and **Start implementation**
(or **Resume implementation** / **Verify delivery** for a saved run). A next-step message
guides the workflow; **Check options** holds **Preview changes** and **Recheck everything**
(**Recheck feature** for a selected feature). Checks follow the feature selection;
planning covers all approved requirements.
**Prepare plan** proposes requirement-linked work packages, hard
prerequisites, preferred ordering, technical steps and verification. Review dependency
reasons, resolve questions and adjust ordering before approval; deterministic ordering
keeps prerequisites first. Interrupted planning retains completed packages for explicit
retry. Planning uses one bounded OpenCode request per approved requirement.
Implementation checks reuse current saved assessments; **Recheck everything**, **Recheck
feature** and individual **Reassess** controls explicitly bypass reuse. Owned OpenCode assessment/coding sessions
load bundled role-specific skills, while Reqwizit owns state and Git delivery.
**Preview changes** shows pending/reusable requirements and reasons without
model calls. Reviewed code boundaries can be applied per feature/requirement in
Implementation settings to avoid rechecking unrelated changes; blank boundaries keep
repository-wide checking. Equivalent-content commits reuse evidence, and optional
local/main semantic reuse still runs main verification. Individual **Mark for
reassessment** queues known changes while preserving previous results.
Execution data upgrades use transactional forward migrations with original-payload
backups. Compatible assessment workflow changes preserve saved results; see the
[migration ledger](docs/migrations.md) for supported formats and recovery behavior.
Keep answering while discovery works: responses are durably queued and processed
one at a time, each in its own revision-linked context. Each follow-up includes its
target and supporting evidence, project/dependency guardrails and feature notes;
unrelated feature history is explicitly omitted. Completed items stay completed.
Queued requirement-linked answers can have enforced target-only follow-up, so unrelated
same-feature reviews need not be blocked or resubmitted. Shared/general input and live
worker snapshot protections remain conservative. Older saved evidence/checks remain
usable through compatibility checks without startup model replay.
Unscoped concrete answers and ordinary approval/rejection reviews may trigger up to three targeted
duplicate/conflict pair checks for affected requirements, including new proposals.
Fixes await your approval; ambiguous intent prompts a clarification. Discovery is
saved before these checks, so a failed check resumes without repeating discovery.
Additional unscheduled candidates are shown in Processing & queue; **Refine** remains
the manual entry point for approved-pair checks, not an exhaustive correctness audit.
During assessment or coding, answers, notes and reviews are saved as waiting submissions;
processing starts after the worker finishes. Conflicting actions explain their blockers
on hover, keyboard focus or tap. Failures, cancellation and expired-worker recovery keep
waiting follow-up paused for explicit resume.
Requirement decisions also check related queued input, clarification and dependencies.
Reviews with changed evidence are retained for another human review, not applied
silently; direct approvals cannot invalidate a live discovery snapshot. See
[decision safety](docs/browser-workspace.md#decision-safety-during-queued-work).
A later saved approval/rejection clears older failed decision conflicts automatically,
keeping original notes in history. For obsolete stuck attempts, **Dismiss old attempts**
clears them per requirement with **Undo dismissal**; genuine unfinished processing stays
visible. Attention items name the next step rather than asking you to repeat decisions.
Completed response rounds also reconcile related waiting review items: revise
unapproved wording/choices, withdraw obsolete proposals, and retire questions when
justified. Changes explain their processing source, preserve drafts/history, and
never imply human approval. See [completion reconciliation](docs/browser-workspace.md#keeping-waiting-review-items-current-after-processing).
Expand **Processing & queue** to inspect the questions
and submitted answers being processed, waiting, or completed in **Activity**.
Context preflight checks queued follow-up before starting an AI batch. Responses that
still cannot fit are marked **Context blocked** with their answers/approvals saved;
fitting responses can continue, and unchanged retries create no failed batches.
**Explore next gaps** uses a durable workflow/failure/acceptance task backlog after
initial interpretation. It reuses compatible saved checks, waits for unresolved linked
decisions and avoids model calls for exhausted scopes. Current-decision context retains
human addenda while avoiding proven historical review duplication. Processing & queue
shows task counts—not a completeness score. See [large-project discovery](docs/browser-workspace.md#exploring-gaps-in-large-projects).
**Review** beside Design shows requirements awaiting approval, with optional notes,
auto-advance, durable background follow-up, and submitted/reviewed history. AI can
propose additional requirements/questions, revise wording for another review, or
archive features when explicitly requested in a review note.
**Review → Refine requirements** proposes behavior-focused replacements for technical
wording and incidental tuning constants, including in approved requirements. Discovery
also checks for cleanup opportunities. Refine now checks overlapping approved requirements
and proposes consolidations/coordinated fixes under **Refinements**; choose **Approve
resolution** or **Keep both unchanged**. Ambiguous intent produces a targeted Design
question whose processed answer returns to resolution; approved wording never changes
without review. Choose **All project areas** to refine across the project, or select a
feature to limit the work. The separate duplicate/conflict check section was removed;
Refine is the single entry point.
**Processing & queue** shows completed-check counts and a progress bar for each
refinement stage (overlap checks, then wording cleanup). Percentages cover this run's
current stage, not an exhaustive audit or a time estimate.
Refinements appear as individual expandable
**Refinement proposed** items in **To review**, with a **Refinements** filter. Compare
original/proposed wording and scenarios, then choose **Approve refinement** or **Keep
current wording**. Review advances to the next item; both outcomes and their comparisons
remain under **Reviewed**. Active requirements stay unchanged until
approval; IDs, original evidence and revision history are retained. Cleanup checks
requirements individually across the selected scope; select a feature to limit it.
Completed checks are saved, including checks needing no changes, so retrying after an
interruption continues unfinished work without replaying unchanged completed tasks.
The workspace follows **Design → Review → Implement**. The default **Design** view uses compact expandable rows with feature/category
context. Use **Previous answers** or **Submitted** to edit responses, including
waiting answers. **Project map** groups requirements under expandable features;
definition progress and supporting evidence open on demand. Model/research and
automatic-processing preferences live in **Settings**.
**Activity** opens to meaningful highlights with 25 entries per page. Filter by
feature/type or search the full history; expand entries for before/after evidence.
**All activity & revisions** retains routine revisions, and new work offers a refresh
without moving an older page. Existing histories upgrade automatically without model calls.
**Settings → Appearance** offers six light and six dark themes, a custom-color
editor, five local font stacks, and adjustable text size. Preferences apply across
projects and persist locally. Dropdowns coordinate with the selected theme.
Question cards offer **Help me with this question** for simpler wording, examples,
tradeoffs, and follow-ups. Clarifications are saved without selecting an answer.
Underlined concepts in newly generated questions explain meaning and impact on
hover, keyboard focus, or tap.

ChatGPT discovery has been exercised through `gpt-6.1-sol`. Copilot is outside the
current release scope. The local browser API and Electron desktop wrapper are
implemented; automatic background-service discovery remains later work.

### Desktop app

Use **Node.js 22.12+** for development. Launch the Electron workspace with:

```powershell
npm ci
npm run desktop
```

The app opens its own window, uses native folder selection, and shares existing
projects with the browser/terminal. Closing the window cancels active work and quits.
Build a Windows installer with `npm run package:desktop`; output is under
`dist/installers`. See [desktop setup and packaging](docs/desktop.md) for isolated
data directories, runtime requirements, verification, and release limitations.

### Browser app

```powershell
npm ci
npm run app
```

Open **http://127.0.0.1:4317**. Existing CLI projects appear automatically when using
the same default data directory. Open **Settings → AI connections** to sign in with
ChatGPT, select an account/model, and test the connection. Save the selection for an
existing project, or use it when creating a new one. Existing OpenCode selections
continue to work; connect that route with `opencode auth login` if needed.

See the [browser workspace guide](docs/browser-workspace.md) for research controls,
epic organization, scoring, context management, verification, and current limitations.
Windows engine and browser checks are verified on **Node 22.23.3**. Use
`npm run test:browser:all` to build once and run the fixture browser checks sequentially,
without model calls. See [startup reliability and verification](docs/browser-workspace.md#browser-startup-and-verification-reliability)
for the controlled regressions, failed-run history and remaining qualification limits.

The terminal client is also available:

```powershell
npm run reqwizit -- new --name "My project" --idea "An app for managing renovation jobs" --provider openai --model gpt-6.1-sol
# Copy the displayed ID, then:
npm run reqwizit -- interview --project "your-project-id"
```

See the [terminal discovery guide](docs/terminal-discovery.md) for command-driven
use, storage locations, revision checks, verification, and remaining M2 work.

New installations store data under the user-local `reqwizit` directory. Existing
`requirement-wizard` installations are reused in place when no `reqwizit` directory
exists, retaining projects and protected credentials. Browser preferences are
migrated to the new name automatically. Explicit `--data-dir` paths still work.

The runtime compatibility runner is also available:

```powershell
npm ci
npm run spike -- providers
npm run spike -- probe --provider openai --model gpt-6.1-sol --format text-json
```

Model IDs depend on the connected account. Probes consume provider allowance.
See the [runtime spike guide and results](docs/runtime-spike.md) for prerequisites,
commands, tested versions, native structured-output failures, and remaining checks.

## Project documents

Direct ChatGPT connection management is available in Settings and through the
independent compatibility runner: `npm run provider -- --help`. See
[direct providers](docs/direct-providers.md) for sign-in, model selection, commands,
and migration status. Direct discovery/help are implemented but live subscription
access is not yet verified; direct research remains follow-on work.

- [Product specification](docs/product-specification.md): scope, requirements,
  acceptance criteria, and release readiness.
- [Architecture](docs/architecture.md): shared engine, local storage, interfaces,
  and the OpenCode runtime boundary.
- [Milestone backlog](docs/milestones.md): ordered work packages and exit checks.
- [Decisions and open questions](docs/decisions.md): confirmed direction,
  proposed technical choices, and unresolved implementation details.
- [Runtime spike](docs/runtime-spike.md): executable compatibility checks and live results.
- [Terminal discovery](docs/terminal-discovery.md): persistent interview prototype and commands.
- [Browser workspace](docs/browser-workspace.md): interactive epic map, research, coverage, and context.
- [Local project workspaces](docs/project-workspaces.md): connected folders, automatic repo files, and implementation tracking.
- [Desktop application](docs/desktop.md): Electron startup, close/cancel behavior, Windows installer, and verification.

## Planned experience

```text
Idea → Adaptive interview ↔ Research
                ↓
       Living specification
                ↓
      Release readiness review
                ↓
       Phased OpenCode handoff
```

Desktop, browser, and terminal clients share project state. Requirements retain their
sources, decisions retain their rationale, and build packages reference the exact
specification revision used to generate them.

Portable build packages remain planned. An integrated Implementation workspace pilot
now launches local OpenCode against isolated repository worktrees; its live runtime
and GitHub qualification remain outstanding.

Existing-project initialization is available: on **New project**, choose **Existing
project** and select the folder first. A local metadata/document preview suggests an
editable name, description and project type without using the AI connection. Choose
**Create & initialize existing project** to reconstruct its features. Existing projects offer **Initialize from folder**
after connection, and **Rescan folder** on the Project map or in workspace Settings.
Scans propose feature definitions and requirements from bounded source/documentation/test
evidence, then stop for review before gap discovery. Rescans report file changes and
preserve accepted decisions. Eligible files are sent to the saved AI connection;
inspected scope and omissions remain visible. See [workspace scanning](docs/project-workspaces.md#initialize-definitions-and-rescan).
Failed initialization offers an explicit retry before gap discovery. **Unrelated /
dismiss** sits beside **Save response** in each eligible expanded question. **Questions →
Bulk question actions & history** can dismiss unanswered questions or replace them with
questions grounded in the scanned baseline, preserving answers and history.
Broader change planning/handoffs remain [M7 follow-on work](docs/milestones.md#m7--existing-project-discovery-and-feature-planning-follow-on).
