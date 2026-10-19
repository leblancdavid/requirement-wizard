# Implementation workspace

Status: integrated pilot implemented October 18, 2026 (DEC-023). Deterministic tests
use local Git repositories and injected model/GitHub responses. A bounded live
ChatGPT/OpenCode sandbox check created a file and continued the same saved session
after the owned runtime restarted. In-flight interrupted recovery, end-to-end coding/
assessment and real GitHub delivery/installer integration remain unqualified.

## Browser workflow

**Assess project** currently requires a connected workspace and saved Implementation
settings (OpenCode model, delivery strategy and at least one verification command),
even though the static assessment does not execute those commands. Detecting the
repository fills the form but does not save it. When an action is disabled, a message
below the buttons identifies missing settings, active discovery/implementation work,
an in-progress save or a changed repository for delivery. Local assessment does not
fetch origin or require remote-main access. Dependency-order errors block execution
planning but do not prevent an otherwise configured assessment.

**Implementation** sits beside **Review**, using the existing tabs, feature filter,
compact expandable rows, feature groups, buttons, themes, fonts and text sizes.
Its badge counts accepted requirements in active epics without current verified
delivery to `main`. Manual assessments do not reduce this count. Tabs wrap on mobile.

Epic drawers start collapsed; expand a drawer to see its individual requirements.
**Search epics and requirements** matches epic names/purposes, requirement text/IDs,
rationales and acceptance scenarios, case-insensitively. All search terms must match
the combined epic/requirement text. Search combines with the Feature selector and
status filters (including missing, not assessed and needs reassessment). Group headers
show matching counts; empty results offer **Clear search and status filter**. Stale
assessments do not appear as current partial/missing work. Filtering changes the list,
not the scope of **Implement epic** or the saved execution plan.

1. Connect the Git repository root in Settings. Execution and main verification require
   `origin` to match the configured GitHub `owner/repository`, with an existing remote
   `main`. Working-folder assessment only needs the local Git working tree and HEAD.
2. Expand **Implementation settings**. The app checks the connected folder's local Git
   metadata and fills `owner/repository` from its `origin` remote (GitHub HTTPS, scp-style
   SSH or `ssh://git@github.com/...`). No network request or model call is involved.
   Detection reports missing Git/origin, unsupported remotes and folders below the Git
   root. **Detect again** refreshes it without replacing a manually edited draft.
   A changed origin requires saving the updated settings; saved runs retain their frozen
   repository. Set the delivery strategy, explicit
   OpenCode model and verification commands (one shell command per line). Commands
   are suggested from bounded root project metadata and prefilled for new settings.
   Review the suggestions, then save settings. Saved commands and manual edits are
   retained on redetection; **Use suggested commands** explicitly replaces the draft.
   Add
   requirement prerequisites where needed; existing epic dependencies also apply.
3. **Assess project** captures bounded file evidence from the working folder and
   assesses approved requirements sequentially. It does not execute checks or establish
   main delivery. Each scenario needs evidence; omitted scope stays unknown. A real
   run reports its stage, selected/completed counts and code-status summary. Empty
   approved scopes are rejected rather than reported as successful zero-item scans.
4. **Verify main & refresh delivery** fetches main, creates a detached worktree, runs
   configured checks and assesses requirements. It can recognize existing implementation
   predating Reqwizit's coding runs.
5. Use **Implement**, **Implement epic** or **Continue implementation**. Individual/epic
   actions freeze that scope. Continue resumes it; after completion, another Continue
   plans remaining approved requirements.
6. Expand **Execution & delivery details** for worktree/session IDs, commits, check
   results, PR links and progress. Stop/app closure retains checkpoints; restart never
   automatically repeats work. **Archive run & replan** retains history, branches,
   worktrees and sessions and permits new settings/scope.

### Assessment results, errors and retry

**Complete in code** and **Implemented** are distinct filters. Existing local features
can assess as complete without new coding/commits, while main completion still requires
verification/delivery evidence. Failed preflight, capture, model calls or verification
do not establish that features are missing. Zero-assessed runs explicitly say so.

**Assessment details** shows the current requirement/stage, HEAD/workspace, most recent
session, captured file/excerpt counts, omitted scope and each verification command's
exit code and bounded redacted output. The latest 20 assessment/verification run
records retain diagnostics independently of the coding run. Old generic diagnostics
cannot reconstruct command output that the previous version did not save.

A bounded source capture is reused within the run. Each requirement receives a focused
window prioritized by explicit provenance, referenced paths and relevant terms, not
the entire capture. Selected excerpts remain byte-exact. Omitted-path inventories stay
in the saved run; the model receives reason counts and a bounded sample instead of
thousands of repeated excluded paths. Short `file:N` handles resolve back to captured provenance. Source
hashes and HEAD are checked before accepting results; excluded binaries/cache files
are not reread to validate source evidence. Over-budget genuine evidence/requirements
still block explicitly rather than being silently truncated.

Completed requirement assessments are checkpointed individually. Running the same
action again reuses results only when specification revision, requirement fingerprint,
model, HEAD, scope, context-policy version and captured-source/omission fingerprint match. Changed inputs need
fresh inference. Cancellation/failures retain valid earlier results. Verification is
rerun on each main-verification request. Tooling failures keep previous dated
assessment/delivery evidence; they do not certify current main anew.

If a suggested command fails (for example `godot` is not on PATH), inspect its output
and set the actual executable path or fix project/toolchain errors before retrying
main verification. Working-folder assessment runs independently of those commands.

### One requirement per task and context

Epic/Continue actions enqueue a prerequisite-ordered list of individual requirements.
The scheduler awaits coding, verification, acceptance assessment, commit and checkpoint
before advancing. PR merge barriers remain per requirement or epic according to the
chosen delivery strategy. No coding/assessment calls for a run execute in parallel.

Each coding requirement owns a distinct persistent OpenCode session, including within
an epic PR. Resume reuses only that requirement's session. Duplicate session mappings
and foreign requirement task markers are rejected. Completed matching responses are
recovered without replaying inference. Assessment uses a fresh session per evidence
window, with no previous model conversations or other requirements' build logs.

Context contains one approved target, its exact acceptance scenarios/supporting human
decisions, relevant feature notes, and necessary approved project/dependency guardrails
(including transitive prerequisites). Sharing an epic or original source does not pull
in sibling requirements or their review history. Background AI rationales, UI tooltips
and historical file motivation may be omitted explicitly; normative human input is
never silently truncated. Historical workspace evidence cannot prove current behavior.

Both coding and assessment use a 48,000-character full-request preflight. This includes
the app-owned prompt/instructions, assessment JSON schema, saved session history on
resume, and an 8,000-character reserve for runtime overhead. It is a conservative
character estimate, not an exact provider-token limit or a bound on every future
OpenCode tool result/inherited instruction. The coding profile asks for bounded
relevant file reads. Oversized initial requests block before runtime startup; oversized
resumed transcripts block before another prompt. They do not silently switch models,
drop decisions or replace the saved session.

The assessment index lists only bounded captured-excerpt metadata. It is navigation,
not inspected evidence. A model can request up to eight indexed excerpts in another
fresh, bounded window for the same requirement. There are at most three windows total;
requests beyond that leave the result unknown. Only currently detailed excerpts may
be cited. Required target evidence and explicitly requested excerpts are indivisible;
if they cannot fit with human constraints, the task becomes **Context blocked**.
Earlier windows do not accumulate in the next prompt.

Coding context blockers pause execution before advancing to another requirement.
Assessment blockers stop that action while preserving completed results. Per-task
context counts/block diagnostics and assessment session counts are visible in details.
These local context manifests remain separate from portable requirements artifacts.

### Suggested verification commands

Detection only reads local metadata; it does not execute package scripts, install
dependencies, fetch repositories or call a model. Suggestions identify their source
files and are not successful verification results.

| Recognized metadata | Suggested commands |
| --- | --- |
| `package.json` scripts | Existing `check` (or `typecheck`/`type-check`), `lint`, `test`; `build` when none of those is usable |
| Package manager declaration/lockfile | Use npm, pnpm, Yarn or Bun as detected; npm defaults to `npm run check` / `npm run test` when those scripts exist |
| `Cargo.toml` package/workspace | `cargo check`, `cargo test` |
| `go.mod` module | `go test ./...` |
| One root .NET solution/project | `dotnet build`; add `dotnet test` for an explicitly marked test project |
| `pytest.ini` or explicit pytest settings in `pyproject.toml` | `python -m pytest` |
| `project.godot` | `godot --headless --path . --editor --import` (import smoke check; not gameplay acceptance verification) |

Placeholder npm tests, explicit watch/fix/write scripts and ambiguous package-manager
metadata do not produce guessed checks. Known Vitest/Jest scripts receive non-watch
flags when needed. Adjust executable names and dependency setup for your machine.
Unsupported/malformed projects keep an empty editable field instead of a fake passing
command. Inspection reads at most 128KB per file, 512KB total and 256 root entries,
excluding linked/nonregular or potentially sensitive file contents. It does not scan
every nested project in a monorepo.

Install Git, OpenCode and GitHub CLI (`gh`) locally. Use OpenCode's supported sign-in
and `gh auth login`. Coding initially supports ChatGPT/OpenAI through its explicit
OpenCode settings, independently of discovery's direct OAuth connection. No credentials
are copied between routes. Git identity/hooks must already be configured normally.
The installer does not install OpenCode. Commands run in isolated worktrees; include
dependency setup in checks if needed. Neither this workflow nor these tests configure
the user's Git identity or skip hooks.

## Independent state dimensions

- **Assessment:** unknown, missing, partial, complete. Complete displays **Complete in
  code** until verified main-delivery evidence exists. Evidence records requirement
  fingerprints, source hashes/line ranges, capture time, repository HEAD and omissions.
  Every acceptance scenario must appear once; invented citations are rejected. Static
  code/test definitions do not establish executed verification. AI assessments remain
  estimates, not formal proofs.
- **Execution:** queued, running, verifying, verified, blocked, failed, interrupted.
- **Git delivery:** none, local, pushed, awaiting merge, delivered, closed unmerged.

Implemented requires the current approved-requirement fingerprint, successful checks
and remote-main delivery. Results identify the observed main SHA/time. There is no
repository watcher; refresh main after external changes. Requirement changes cease
to count under stale fingerprints. Existing manual assessments remain separate.

The prerequisite-first plan uses epic dependencies and explicit requirement edges.
Unknown/unreviewed prerequisites block; cycles are rejected. Within an epic PR,
earlier verified requirements on that same branch satisfy coding prerequisites.
Named-branch runs may use prior verified pushed commits after confirming their ancestry
in the target worktree. Other prerequisites must be delivered to main. Branch-local
availability never changes the implemented count. A local commit or open PR never counts.

## Execution and delivery

Coding worktrees live under the Git common directory at
`reqwizit-worktrees/<unit-id>`, on app-named branches. Existing source-folder edits
remain outside automatic staging. Worktrees receive committed repository content.
OpenCode receives the requirement, exact supporting human evidence, dependency and
project-wide guardrails. Oversized mandatory context blocks before inference.
Assessment reuses scanner capture budgets, then selects per-requirement evidence
windows within the 48,000-character full-request policy described above.

The agent edits files; the service runs checks, reassesses acceptance from captured
worktree evidence, stages and commits. Commit titles identify the requirement and
behavior; bodies retain summary, specification revision, check commands/results and a
task marker. Hooks are not skipped. Unexpected history, hook changes to verified files,
failures and blockers stop progression.

| Strategy | Behavior |
| --- | --- |
| PR per requirement | Commit/push one requirement, create PR, wait for user merge |
| PR per epic | Sequential requirement commits on an epic branch; PR at the selected epic boundary; wait for user merge |
| Named branch | Push verified commits sequentially; prerequisite commits must be present in the target branch; completion still waits for main |
| Main | Push verified requirement commits directly to main; repository rules may reject delivery |

No auto-merge. Continue reconciles remote state using matching PR/merge metadata or
commit ancestry, then rechecks current main. Squash/rebase delivery uses GitHub merge
metadata instead of requiring original commit SHAs on main. Closed-unmerged PRs block.
Push/PR failures retain successful coding and commits for explicit recovery.

## Persistence and recovery

SQLite execution state stores configuration, assessments, delivery evidence, current
and archived runs independently of specification revisions. CAS protects settings;
runs freeze revision, workspace binding, settings, scope and session mappings. Changed
specifications/bindings require replanning. Repository-common-directory leases serialize
workers in the same project store (120-second lease; 30-second renewal). Expired
owners cannot publish; shutdown never cancels another app process's worker. Separate
data stores targeting one repository are not coordinated.

Worktree creation is idempotent. Task markers recover commits made before their SHA
checkpoint; PR lookup avoids duplicate creation. Retained sessions and completed task
responses are looked up before more work is sent; a missing session is not silently
replaced. Failures/blockers retry only on explicit Continue, reusing the saved session
and current task files. The shared runtime request deadline still applies; long coding
requests may need explicit reconciliation/resume.

Workspace artifact publication pauses while implementation holds its lease. On release,
`progress.json` gains `implementationDelivery`, and `progress.md` a delivery summary.
Portable summaries omit local worktree paths, session IDs, model/credential settings
and runtime logs. External-edit conflicts remain protected. These generated artifacts
are not an execution-state import/backup. Historical manual statuses remain intact.

## Verification and remaining qualification

Tests cover dependency order/cycles, manual/stale delivery, malformed evidence,
CAS/leases/reopen, actual local Git commits for all strategies, PR barriers, explicit
resume after cancellation/failed checks, and recovery after a lost commit checkpoint.
PR fixtures include a real local squash commit plus injected merge metadata. Git
pushes use temporary local bare repositories; models/GitHub are injected. API
checks cover authentication, versions, malformed input and missing workspace. Browser
checks cover the tab count, settings/actions, strategies, dark theme and mobile width.
Screenshots: `.reqwizit-state/browser-implementation{,-dark,-mobile}.png`.

Requirement-isolation regression checks additionally cover exact human/dependency
closure without sibling history, full-prompt/history budget failures, no inference or
queue advancement on context blocks, bounded evidence follow-ups, indexed-only citation
rejection, distinct sessions and verification/commit checkpoints before the next task.
Browser diagnostics include `.reqwizit-state/browser-requirement-context.png`.
A metadata-only check on installed OpenCode 1.18.32 confirmed the dedicated primary
`reqwizit-assessment` agent and its app-owned instructions; no inference was performed
by that check. This does not qualify live evidence-window behavior or deny enforcement.

Live check on October 18: `openai/gpt-6.1-sol`, pinned SDK 1.18.32, two bounded
90-second requests in an empty temporary sandbox. The agent used `apply_patch` to
create the exact requested file. After runtime shutdown/restart, the same session
used `read`/`apply_patch` to append the requested line; exact file bytes and JSON
results passed. Session: `ses_eae87af17ffe0uK5dgNAHynFJ5`. No GitHub operations or
production-project edits occurred. A metadata-only check found the configured primary
coding agent; inherited permission rules include allows as well as app denials.
This verifies those permitted operations, not adversarial permission enforcement.

Live permission/inherited-instruction enforcement, in-flight interrupted continuation,
end-to-end assessment/verification, GitHub authentication/branch protection and actual
GitHub squash/rebase merges still need qualification. Installer management remains future work.
The current test host reports Node 20.11; the documented development baseline remains
Node 22.12+. Browser/fixture success does not qualify installer distribution or live AI.
