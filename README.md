# Requirement Wizard

A local-first application that helps people turn a software idea into a reviewed
specification and an actionable AI build plan.

Describe an idea, answer adaptive questions, investigate uncertainties, and review
the resulting requirements. Use either a desktop or terminal interface, with
GitHub Copilot and ChatGPT subscription access initially provided through OpenCode.

## Project status

The first executable runtime spike is available. ChatGPT JSON responses, local schema
validation, streaming, cancellation, and completed-session recovery have been exercised.
Copilot is reported connected but live calls are currently blocked by account quota.
Desktop and terminal application interfaces are not implemented yet.

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

Desktop and terminal clients share project state. Requirements retain their
sources, decisions retain their rationale, and build packages reference the exact
specification revision used to generate them.

The initial release ends with portable build packages. A subsequent integrated
Build workspace will launch and monitor OpenCode against a target project.
