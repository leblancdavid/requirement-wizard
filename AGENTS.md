# Agent guidance for Reqwizit

## Project purpose

Reqwizit is a local-first application that turns a rough software idea
into a reviewed specification and phased AI build packages through adaptive
questions, targeted research, and scenario walkthroughs.

- Serve technical and nontechnical users with adjustable explanation depth.
- Prioritize the local browser workspace; retain terminal compatibility and a later
  desktop wrapper. All clients share the same project state and engine.
- Prioritize ChatGPT subscription connections through OpenCode. Copilot support is
  deferred; do not treat Copilot verification as a release or milestone blocker.
- Initial release: discovery, specification review, planning, and portable handoffs.
- Integrated coding execution is a follow-on milestone.

## Start here

Check `git status` before editing and preserve existing user changes. Read the
documents relevant to the task:

- `README.md` — current capabilities and entry points.
- `docs/product-specification.md` — requirement IDs and acceptance criteria.
- `docs/architecture.md` — component boundaries and proposed source layout.
- `docs/milestones.md` — ordered work and milestone exit checks.
- `docs/decisions.md` — confirmed product choices, technical proposals, open questions.
- `docs/runtime-spike.md` — tested runtime behavior, commands, and outstanding gaps.
- `docs/terminal-discovery.md` — persistent terminal commands, storage, and verified flows.
- `docs/browser-workspace.md` — browser startup, epic organization, scoring, context, and research.

Distinguish confirmed decisions, proposed architecture, implemented behavior, and
verified results. Update the relevant documents when those states change.

## Current implementation

Executable application code now includes:

- `src/core/model.ts` — schemas, source provenance, proposal/reference rules.
- `src/core/epics.ts`, `round.ts`, `coverage.ts`, `context.ts` — organization operations,
  material review, deterministic completeness estimates, and bounded context.
- `src/storage/store.ts` — SQLite revisions, expected-revision writes, and durable jobs.
- `src/storage/workspace.ts` — local folder bindings/artifacts, conflict checking, and revision-linked progress files; see `docs/project-workspaces.md`.
- `src/storage/scan.ts` — bounded read-only file capture for initialization/rescan; scan jobs propose definitions and pause for review before gap discovery (DEC-018).
- `src/storage/folder-preview.ts` — local metadata/document identity suggestions for explicit existing-project creation (DEC-019), with fingerprinted preview provenance.
- `src/service/discovery.ts` — in-process orchestration and adapter contract.
- `src/runtime/` — owned OpenCode server, provider validation, and JSON-text discovery.
- `src/providers/` — app-owned ChatGPT OAuth/credentials, browser connection management,
  account catalogs/probes, and selection-routed direct discovery/help.
- `src/terminal/cli.ts` — persistent project commands and readline interview menu.
- `src/web/server.ts` — token-authenticated loopback browser API and job lifecycle.
- `src/ui/` — React browser workspace; `vite.config.ts` builds it to ignored `dist/web`.

The compatibility spike remains under `src/spike/`:

- `cli.ts` — provider/profile inspection, model probes, session recovery.
- `runtime.ts` — re-export of the shared owned-server lifecycle.
- `contract.ts` — spike output schema and re-exports of shared runtime validation.
- `contract.test.ts` — deterministic contract checks.

SQLite, terminal commands, the browser workspace/API, Electron desktop shell, and epic/coverage/context
loops are implemented. See `docs/desktop.md` for packaging. Richer Ink UI, daemon discovery/CLI attachment,
readiness baselines, and handoffs remain future work. The integrated Implementation
pilot (DEC-023) adds separate assessment/execution/delivery state, isolated OpenCode
worktrees, sequential verification/commits and GitHub strategies. See
`docs/implementation-workspace.md`; a small live sandbox coding/completed-session
continuation check passed, but in-flight recovery and full coding/GitHub delivery
are not yet qualified. Manual progress does not establish delivered-to-main completion.
Milestones remain partially
complete where their exit criteria are unverified. The repository is not a monorepo.

This project is independent of the earlier Lykoi research in `D:\Dev\axiom`.
Useful concepts include provenance and behavioral decision discovery; there is no
dependency on its compiler or experimental runtime.

## Implementation conventions

- Use strict TypeScript, ESM, and the existing NodeNext configuration. Relative
  TypeScript imports use `.js` extensions.
- Use npm and keep `package-lock.json` consistent with dependency changes.
- Node.js 22.12+ is the development baseline (current Electron tooling requires it).
  The shared engine was previously verified on Node 20.11; the desktop bundles Node.
- Windows is the first verified platform. Keep commands and process handling
  compatible with Windows and preserve portability where practical.
- Keep requirements logic, storage, and runtime integration outside UI components.
- Validate model output and references before applying project changes. Preserve
  original human input, stable record IDs, and reviewable revisions.
- Keep AI proposals, research findings, human decisions, and delegated choices
  distinguishable. A retrieved fact does not establish a user's product preference.
- Use expected-revision checks for updates and reject stale results rather than
  silently overwriting newer decisions.
- Keep exported work packages tied to a specification revision and acceptance scenarios.
- Preserve unknown coverage dimensions; do not let detailed AI proposals count as
  confirmed decisions. Scores are estimates, not proof of completeness/readiness.
- Validate epic split/merge/move operations atomically. Preserve IDs and evidence;
  changes affecting confirmed information require organization review.
- Keep context bounded and revision-linked. Do not silently truncate human decisions
  or use omitted evidence to justify new requirements/assessments.

## Data compatibility and forward migrations

- For every app change that may affect persisted data, assess upgrade compatibility
  as part of the change. This includes SQLite tables and JSON payloads, workspace
  artifacts, settings, saved jobs, assessments/check results, delivery evidence, and
  fingerprint or freshness rules that could invalidate saved work.
- Implement any necessary forward migration alongside the change. Preserve original
  evidence, stable IDs, history, and valid completed work across upgrades. Do not
  require users to reset data or repeat assessment/model calls solely because an
  equivalent representation or compatible app workflow changed.
- Keep schema/migration versions separate from optimistic-concurrency counters.
  Make migrations ordered, transactional where possible, and safe to reopen or retry
  after interruption. Reject unsupported future formats without overwriting them.
- Do not manufacture missing provenance or mark genuinely stale results current.
  When semantic changes require reassessment, retain previous dated evidence and
  explain the specific incompatibility.
- Document the migration plan and implemented behavior in the relevant docs, including
  source/target formats, compatibility impact, and recovery considerations. Add
  meaningful upgrade tests using older saved data, covering preservation, repeated
  startup, and failure recovery as appropriate. Report checks actually run and any
  remaining upgrade gaps.
- Maintain `docs/migrations.md` as the forward-migration ledger. Record compatibility
  decisions there when changing schema versions, assessment semantics or fingerprints.

## OpenCode integration

The SDK is pinned to `1.18.32`, matching the runtime tested in the spike. Use
`@opencode-ai/sdk/v2/client` and inspect installed types when changing integration
code; public examples may use different argument and response shapes.

Observed behavior is documented in `docs/runtime-spike.md`:

- ChatGPT `gpt-6.1-sol` worked with explicit `--format text-json` and local validation.
- Native schema mode failed with `StructuredOutputError`; recovering its stored
  messages also failed. Keep this distinct from the working JSON-text path.
- Copilot was reported connected, but a live probe returned `You have no quota`.
  This is historical evidence for a deferred provider; do not repeat its probes
  unless Copilot support is explicitly brought back into scope.
- Catalog-listed models can still be rejected by the account at request time.
- Completed JSON-text session recovery, streaming, cancellation, and fresh work
  after cancellation were exercised; same-session resumption remains unverified.
- Tool registry/configuration inspection does not prove effective permission
  enforcement or successful source-backed research.
- A browser-loop live round verified webfetch against two official specifications.
  Live websearch and adversarial tool-budget/permission behavior remain unverified.

These are dated observations, not permanent capability guarantees. Record new
checks accurately; do not label blocked or unexecuted checks as passing.

For the OpenCode adapter, let OpenCode own credentials and supported authentication
flows. Never copy credentials into project records, logs, fixtures, or exports. Inspect only
necessary configuration fields and redact diagnostics. Do not silently switch
provider, model, or output format after an error.

Direct-provider migration is approved under DEC-015. `src/providers/` contains a
ChatGPT OAuth/catalog/streaming implementation with app-owned protected credentials,
browser Settings UI/API, and direct discovery/help dispatch. It never reads OpenCode
credentials. See `docs/direct-providers.md` for commands and verification gaps;
direct live access is not yet qualified. Old selections retain OpenCode; direct
selections do not launch it and currently reject research. Keep tokens out of project snapshots/exports
and serialize rotating-token refreshes across processes.

The OpenCode spike owns its server and uses ignored `.spike-workspace/` state.
Preserve that lifecycle boundary; do not terminate unrelated OpenCode processes. Discovery tool
permissions and later coding execution are separate profiles requiring verification.

## Verification

From the repository root:

```powershell
npm ci
npm run check
npm test
npm run spike -- --help
npm run reqwizit -- --help
npm run build:ui
git diff --check
```

Run `npm ci` when dependencies need installing. For code changes, run the type
check and relevant tests. Add meaningful tests for behavioral changes, especially
malformed output, stale revisions, failures, cancellation, and recovery. The current
`npm test` script names test files explicitly; update it when adding test files.
Documentation-only changes generally need consistency/link review and a diff check.

Run `npm run app` for the browser. For UI changes, run `npm run test:browser` when
Playwright Chromium is installed; it uses a deterministic adapter and no model calls.
Browser setup and screenshot paths are documented in `docs/browser-workspace.md`.
Keep API tokens, host/origin checks, input bounds, and renderer/service separation intact.

Metadata inspection (no model inference):

```powershell
npm run spike -- providers
npm run spike -- profile
```

Live model calls consume provider allowance. Run them when relevant to integration
work, with an explicit provider/model and bounded timeout. Use the commands in
`docs/runtime-spike.md`; do not repeat paid probes without a concrete verification
need. Deterministic fixtures do not establish live subscription compatibility.

Application data defaults to the user's local `reqwizit` directory, reusing an existing
`requirement-wizard` directory when the new directory does not exist. Use
`--data-dir .reqwizit-state` for repository-local development; it is ignored by Git.
Keep demonstration projects and model-call outputs out of committed fixtures unless
they are deliberately curated and free of credentials. Expired-job recovery must
preserve other workers' live leases and must not automatically repeat model calls.

Report what changed, checks actually run, and unresolved blockers. Keep milestone
status accurate. Commit or push only when explicitly requested.
