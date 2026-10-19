# Implementation workspace

Status: integrated pilot implemented October 18, 2026 (DEC-023). Deterministic tests
use local Git repositories and injected model/GitHub responses. A bounded live
ChatGPT/OpenCode sandbox check created a file and continued the same saved session
after the owned runtime restarted. In-flight interrupted recovery, end-to-end coding/
assessment and real GitHub delivery/installer integration remain unqualified.

## Browser workflow

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

1. Connect the Git repository root in Settings. `origin` must match the configured
   GitHub `owner/repository`, with an existing remote `main`.
2. Expand **Implementation settings**. The app checks the connected folder's local Git
   metadata and fills `owner/repository` from its `origin` remote (GitHub HTTPS, scp-style
   SSH or `ssh://git@github.com/...`). No network request or model call is involved.
   Detection reports missing Git/origin, unsupported remotes and folders below the Git
   root. **Detect again** refreshes it without replacing a manually edited draft.
   A changed origin requires saving the updated settings; saved runs retain their frozen
   repository. Set the delivery strategy, explicit
   OpenCode model and verification commands (one shell command per line). Add
   requirement prerequisites where needed; existing epic dependencies also apply.
3. **Assess project** captures bounded file evidence from the working folder and
   assesses approved requirements sequentially. It does not execute checks or establish
   main delivery. Each scenario needs evidence; omitted scope stays unknown.
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
Assessment reuses scanner budgets with a 240,000-character input ceiling per requirement.

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
