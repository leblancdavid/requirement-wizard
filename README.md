# Requirement Wizard

A local-first application that helps people turn a software idea into a reviewed
specification and an actionable AI build plan.

Describe an idea, answer adaptive questions, investigate uncertainties, and review
the resulting requirements. Start with the local browser app or terminal interface, with
ChatGPT subscription access initially provided through OpenCode. GitHub Copilot
support is deferred.

## Project status

A playable browser workspace is available. AI organizes your idea into epics, asks
clickable questions, researches relevant uncertainties, and estimates how well each
area is defined. Review requirements and coverage evidence without entering IDs.
SQLite retains project state, original answers, revisions, and jobs across restarts.

ChatGPT discovery has been exercised through `gpt-6.1-sol`. Copilot is outside the
current release scope. The local browser API is implemented; a desktop wrapper and
automatic background-service discovery remain later work.

```powershell
npm ci
npm run app
```

Open **http://127.0.0.1:4317**. Existing CLI projects appear automatically when using
the same default data directory. Discovery uses your OpenCode ChatGPT connection.
If needed, connect it first with `opencode auth login`.

See the [browser workspace guide](docs/browser-workspace.md) for research controls,
epic organization, scoring, context management, verification, and current limitations.

The terminal client is also available:

```powershell
npm run wizard -- new --name "My project" --idea "An app for managing renovation jobs" --provider openai --model gpt-6.1-sol
# Copy the displayed ID, then:
npm run wizard -- interview --project "your-project-id"
```

See the [terminal discovery guide](docs/terminal-discovery.md) for command-driven
use, storage locations, revision checks, verification, and remaining M2 work.

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
