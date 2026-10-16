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
area is defined. Review requirements and coverage evidence without entering IDs.
SQLite retains project state, original answers, revisions, and jobs across restarts.
Connect a local folder for each project to automatically save versionable requirements
and progress files. Choose it during creation or use **Settings → Project workspace**.
Folder scans process small sequential batches and save checkpoints; **Resume scan**
continues interrupted work using the saved file snapshot without repeating completed batches.
Track manual implementation status and verification evidence under **Project map →
Implementation progress**. See [local project workspaces](docs/project-workspaces.md).
Keep answering while discovery works: responses are durably queued and waiting
answers are batched into the next round. Oversized batches are automatically divided
into smaller revision-linked working groups, with exact human evidence retained and
completed groups checkpointed. Expand **Processing & queue** to inspect the questions
and submitted answers being processed, waiting, or completed in **Activity**.
**Review** beside Questions shows requirements awaiting approval, with optional notes,
auto-advance, durable background follow-up, and submitted/reviewed history. AI can
propose additional requirements/questions, revise wording for another review, or
archive features when explicitly requested in a review note.
The default **Questions** view uses compact expandable rows with feature/category
context. Use **Previous answers** or **Submitted** to edit responses, including
waiting answers. **Project map** groups requirements under expandable features;
definition progress and supporting evidence open on demand. Model/research and
automatic-processing preferences live in **Settings**.
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

The initial release ends with portable build packages. A subsequent integrated
Build workspace will launch and monitor OpenCode against a target project.

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
