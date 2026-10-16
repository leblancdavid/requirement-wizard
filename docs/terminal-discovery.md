# Terminal discovery prototype

Status: M2 terminal slice with browser-compatible epic records. Local persistence,
revision-safe mutations, durable analysis jobs, and command-driven interviews work.
The terminal still uses Node readline; the browser now provides an ID-free visual
workflow and an authenticated local API. See [browser-workspace.md](browser-workspace.md).

## Start a project

Development now requires Node.js 22.12+ and npm for the Electron toolchain. Legacy selections require OpenCode for model calls;
projects switched to a direct connection in browser Settings use that same protected
account from the terminal, without launching OpenCode. Custom data directories use
their own `providers` subdirectory. Direct research is currently unsupported, and
direct live access remains unqualified; see [direct-providers.md](direct-providers.md).
The `new` and `model` commands accept `--connection <account-id|opencode>`.
Model changes retain the project's existing connection unless explicitly changed.
`better-sqlite3` 11.10.0
remains pinned for browser/terminal storage; its Windows native module was originally
verified on Node 20.11. Provider connection instructions are in
[runtime-spike.md](runtime-spike.md).

```powershell
npm ci
npm run reqwizit -- new --name "My project" --idea "An app for tracking home renovation jobs" --provider openai --model gpt-6.1-sol
```

Copy the displayed project ID. Creation saves the original idea and model choice;
it does not make a model call. The model ID must be valid for your account when
you analyze. List current models with `npm run spike -- providers`.

```powershell
$projectID = "paste-the-project-id-here"
npm run reqwizit -- interview --project $projectID
```

The interview offers explicit actions:

- **a — Analyze:** generate questions, candidate goals/actors, assumptions, and
  requirement proposals using the saved provider/model.
- **q — Answer:** select a displayed question ID, then answer, defer, or delegate.
  For a normal answer, enter an option number or your own text. Delegation text
  records its scope; it does not manufacture an answer to the product question.
- **r — Review:** accept or reject a requirement by ID with your rationale.
- **x — Exit:** reopen the project later to continue.

Answers and review actions are saved immediately, independently of the next model
call. Analysis is explicit, so a failed provider call cannot lose a response.
Ctrl+C requests cancellation during analysis. New proposals do not automatically
become accepted requirements. The screen marks an interpretation as needing
re-analysis after a project mutation.

## Command-driven use

The CLI also connects local workspace folders and records manual implementation
progress using the `workspace` and `implementation` commands. `new` accepts `--path`
and `--create-directory`. Files update through the shared store for browser and
terminal changes. See [local project workspaces](project-workspaces.md#terminal) for
commands, generated artifacts, conflict handling, and verification evidence.

To initialize definitions from the connected source folder, or rescan after changes:
`npm run reqwizit -- scan --project "project-id" --expected-revision 3`.
Use the actual inspected revision. This sends eligible source files to the saved
AI connection, reports progress, and stops for proposal review before `analyze`.
It uses read-only bounded capture with retained file evidence and atomic application;
see [initialization and rescanning](project-workspaces.md#initialize-definitions-and-rescan).
Completed batches are checkpointed. Resume an interrupted/failed scan with
`npm run reqwizit -- scan --project "project-id" --expected-revision 3 --resume-job "scan-job-id"`.
Resume reuses captured files and skips saved batches; omit `--resume-job` to capture
current files. Project/model/folder-connection changes require a new scan.

All noninteractive mutations require the revision you inspected. A stale revision
fails instead of overwriting another process's work.

```powershell
npm run reqwizit -- list
npm run reqwizit -- show --project $projectID
npm run reqwizit -- analyze --project $projectID --expected-revision 1
npm run reqwizit -- show --project $projectID --json

# Use IDs and the current revision printed by show.
npm run reqwizit -- answer --project $projectID --expected-revision 2 --question "question-id" --text "Owner only on one computer"
npm run reqwizit -- review --project $projectID --expected-revision 3 --requirement "requirement-id" --decision accept --text "Essential to the first release"

# Switch the saved model explicitly for subsequent analysis.
npm run reqwizit -- model --project $projectID --expected-revision 4 --provider openai --model gpt-6.1-sol

# Inspect immutable snapshots and job state without model calls.
npm run reqwizit -- show --project $projectID --revision 1 --json
npm run reqwizit -- jobs --project $projectID
npm run reqwizit -- recover
```

Examples illustrate revision increments; inspect the current project rather than
assuming a revision number. Use `--kind deferral` or `--kind delegation` with answer
to retain those dispositions separately. Re-answering a question appends a new
source that supersedes the previous response; linked requirements need review.
Accepting a requirement records new human confirmation while retaining its source
links and previous snapshots.

For scripts needing clean JSON, invoke the installed runner directly, avoiding
npm's script banner:

```powershell
node --import tsx src/terminal/cli.ts list
```

## Storage and job behavior

Default storage is `%LOCALAPPDATA%\reqwizit\projects.sqlite` on Windows,
or `~/.local/share/reqwizit/projects.sqlite` without LOCALAPPDATA. Existing
`requirement-wizard` installations are reused in place when the new data directory
does not exist, preserving both project state and protected credentials. Use
`--data-dir <directory>` on every command to select an alternative store. For
repository-local experiments, `.reqwizit-state/` is ignored by Git.

SQLite transactions save a project revision and its snapshot together. Independent
processes can read/write using SQLite locking and expected-revision checks. The
current service is an in-process application facade, not a network server.

Analysis jobs retain the input revision, provider/model, OpenCode session ID,
validated result, status, and reported usage/cost when available. The runtime's
reported zero cost is not an authoritative subscription billing amount.

- An analysis has a combined five-minute cancellation bound and a six-minute worker lease.
- If the project changed, valid output is retained on a **stale** job but not applied.
- Invalid schemas/references fail without applying partial project updates.
- A cancelled request cannot apply its eventual result.
- `recover` marks only expired running jobs **interrupted**, preserving another
  process's live lease. It does not automatically repeat a model call.
- Pending jobs have not been dispatched. Retry analysis explicitly using the current
  revision; prior jobs remain available for inspection.

Restart recovery currently classifies local job state; it does not resume an
interrupted OpenCode inference or recover its output automatically.

## Verification performed

October 15, 2026, Windows, Node 20.11.0, OpenCode/SDK 1.18.32:

- Type checking and deterministic tests cover file-backed reopen, independent
  connections, stale edits/results, atomic reference rejection, answer supersession,
  deferred/delegated evidence, question retirement, batch bounds, duplicate
  requirements, malformed output, provider failure, cancellation, and expired leases.
- A synthetic contractor demonstration was created through the CLI, then analyzed
  through ChatGPT `gpt-6.1-sol`. Three questions and two requirement proposals were saved.
- A sample answer and an acceptance review were saved in separate CLI processes.
  A second live analysis respected the answer and accepted requirement, preserved
  unanswered questions, and proposed an additional owner-only requirement.
- The project reached revision 5; a fresh process could still read revision 1.
  Pre-rename local demonstration state is ignored under `.wizard-state/`.
- Jobs `c245dc6e-0e5c-4e33-85d6-3a747e2bed2d` and
  `4d76b4a0-7bc2-469f-9ecf-e85319d2fde0` completed with reported usage of
  2193 input/1034 output and 3352 input/984 output tokens respectively. The second
  call also reported 98 reasoning tokens. Both reported runtime cost 0.

These sample answers are demonstration data, not product decisions for Reqwizit.
The interactive TTY menu has not been manually exercised in this tool
environment; live verification used the same application's scriptable commands.

## Remaining M2 work

- Automatic local-service discovery and CLI client attachment.
- Richer terminal presentation, explanation/recommendation requests, and requirement editing.
- Refined reviewable change sets beyond whole-revision snapshots.
- Dedicated decision records and richer workflow modeling as the engine expands.

Browser API lifecycle is implemented; automatic CLI attachment remains future work.
Scenario review, release readiness, and portable build-package exports remain later
work. The [Electron desktop client](desktop.md) now shares the same project store.
The CLI now supports `analyze --research` for opt-in source-backed retrieval and
`--focus-epic <id>` for a bounded working set. Ordinary CLI analysis keeps tools disabled.
Adversarial enforcement/inherited-instruction verification remains an outstanding M1 check.
