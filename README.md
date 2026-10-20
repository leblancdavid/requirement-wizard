# Reqwizit

A local-first application that helps people turn a software idea into a reviewed
specification and an actionable AI build plan.

Describe an idea, answer adaptive questions, investigate uncertainties, and review
the resulting requirements. Start with the local browser app or terminal interface, with
ChatGPT subscription access through app-owned sign-in (direct preview) or an existing
OpenCode connection. Direct live compatibility is not yet qualified. GitHub Copilot
support is deferred.

## Project status

A playable browser workspace is available. AI organizes your idea into epics, asks
clickable questions, researches relevant uncertainties, and estimates how well each
area is defined. The top-right **Overall progress** card expands into Definition,
Requirements review and Implementation scores, with epic-level breakdowns.
Review requirements and coverage evidence without entering IDs.
SQLite retains project state, original answers, revisions, and jobs across restarts.
Connect a local folder for each project to automatically save versionable requirements
and progress files. Choose it during creation or use **Settings → Project workspace**.
Generated requirements are split by stable feature ID with a linked overview and shared
evidence files; unchanged outputs are not rewritten. Existing folders migrate on sync.
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
Ordinary answers and requirement reviews also trigger up to three targeted
duplicate/conflict pair checks for affected requirements, including new proposals.
Fixes await your approval; ambiguous intent prompts a clarification. Discovery is
saved before these checks, so a failed check resumes without repeating discovery.
Additional unscheduled candidates are shown in Processing & queue; **Refine** remains
the manual entry point for approved-pair checks, not an exhaustive correctness audit.
During assessment or coding, answers, notes and reviews are saved as waiting submissions;
processing starts after the worker finishes. Conflicting actions explain their blockers
on hover, keyboard focus or tap. Failures, cancellation and expired-worker recovery keep
waiting follow-up paused for explicit resume.
Expand **Processing & queue** to inspect the questions
and submitted answers being processed, waiting, or completed in **Activity**.
Context preflight checks queued follow-up before starting an AI batch. Responses that
still cannot fit are marked **Context blocked** with their answers/approvals saved;
fitting responses can continue, and unchanged retries create no failed batches.
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
