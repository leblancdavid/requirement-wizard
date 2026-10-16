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
Keep answering while discovery works: responses are durably queued and waiting
answers are batched into the next round. Oversized batches are automatically divided
into smaller revision-linked working groups, with exact human evidence retained and
completed groups checkpointed. Expand **Processing & queue** to inspect the questions
and submitted answers being processed, waiting, or completed in **Activity**.
The default **Questions** view uses compact expandable rows with feature/category
context. Use **Previous answers** or **Submitted** to edit responses, including
waiting answers. **Project map** groups requirements under expandable features;
definition progress and supporting evidence open on demand. Model/research and
automatic-processing preferences live in **Settings**.
Question cards offer **Help me with this question** for simpler wording, examples,
tradeoffs, and follow-ups. Clarifications are saved without selecting an answer.
Underlined concepts in newly generated questions explain meaning and impact on
hover, keyboard focus, or tap.

ChatGPT discovery has been exercised through `gpt-6.1-sol`. Copilot is outside the
current release scope. The local browser API is implemented; a desktop wrapper and
automatic background-service discovery remain later work.

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

Browser and terminal clients share project state; a desktop wrapper is planned. Requirements retain their
sources, decisions retain their rationale, and build packages reference the exact
specification revision used to generate them.

The initial release ends with portable build packages. A subsequent integrated
Build workspace will launch and monitor OpenCode against a target project.

Existing-project discovery is also planned as a follow-on after review and handoffs:
select a local source folder, reconstruct evidence-backed requirements, review the
findings, and use that baseline for new feature work. Initial scope is a one-time,
read-only analysis of documentation, source, and tests, with change-focused handoffs
and explicit preservation scenarios. See [M7 in the milestone backlog](docs/milestones.md#m7--existing-project-discovery-and-feature-planning-follow-on).
