# Implementation workspace

Status: integrated pilot implemented October 18, 2026 (DEC-023). Deterministic tests
use local Git repositories and injected model/GitHub responses. A bounded live
ChatGPT/OpenCode sandbox check created a file and continued the same saved session
after the owned runtime restarted. In-flight interrupted recovery, end-to-end coding/
assessment and real GitHub delivery/installer integration remain unqualified.

## Browser workflow

### Preparation versus building (2026-10-29)

**Prepare implementation** groups existing code checks, plan preparation/review and
implementation settings. **Build and verify** separately holds Start implementation,
Resume implementation or Verify delivery, with Stop while a worker is active.
These are groups of explicit operations, not a new automatic chain.

- For an existing codebase, Check progress can establish current local findings and
  separately verify main. It follows the selected feature and can execute configured
  verification commands. Local findings alone do not establish main delivery.
- For a new repository, Prepare plan can be used after setup without an unnecessary
  code check. It covers all approved requirements regardless of search/feature filters
  and does not capture fresh code or run verification commands itself.
- Review a current saved proposal rather than regenerating it routinely. A current
  approved plan can be inspected without another request. Stale/interrupted plans keep
  existing evidence, attempts and explicit continuation rules.
- Frozen coding runs keep their own scope. Archive before replacement planning;
  checking progress does not require silently archiving a run. Existing manual planning
  paths remain; this grouping adds no approval requirement or coding authorization.
- Viewing Implement retains its existing metadata-only repository inspection. It
  does not initiate new code checks/model calls or run verification commands. Already
  authorized work can continue. Saved settings and earlier evidence are unchanged.

The focused planning browser check verifies distinct groups, scope-preserving check/
preview/force request routing, real fixture staged-plan continuation and intercepted
resume/verify routing, including mobile. These routing checks do not qualify live
code assessment, coding or delivery. See [compatibility](migrations.md#separate-implementation-preparation-from-builddelivery-2026-10-29).

### Assessment responsiveness

Implementation checkpoint saves now check versions and active discovery leases in
SQL without decoding the prior execution state or all discovery jobs. Historical
activity entries already indexed are skipped before resolving their specification
revisions; newly recorded outcomes still publish atomically with the checkpoint.
Result, session and cancellation checkpoints remain immediate (no delayed saves).
Browser polling decodes only the latest 20 ordinary jobs while preserving advisory
help history. Nested execution settings/results retain identity across polls, and
progress-only assessment updates do not rebuild implementation plans or scores.
New captures/impact metadata, results, decisions, settings and manual reassessment
requests still update freshness and progress. Visible worker detail uses the full
snapshot, including same-version interrupted-worker projections.

`npm run benchmark:implementation` uses disposable synthetic SQLite data and local
HTTP requests, without inference, Git operations or a connected workspace. On Node
22.23.3, the same 150-requirement/41-source/115-job/20-assessment-run fixture before
and after this optimization measured median progress saves **11.30 → 0.59 ms** and
unchanged HTTP snapshots **3.80 → 2.51 ms** (30 measured requests/saves after five
warm-ups). Corresponding p95 values were **12.88 → 0.68 ms** and **8.54 → 3.92 ms**.
These are synthetic local measurements, not a guarantee of live check duration or
render responsiveness on a particular project. No model, filesystem-capture,
verification-command or end-to-end live assessment speedup is established.

Saved formats, fingerprints, main verification and assessment reuse rules are
unchanged; see [migration compatibility](migrations.md#assessment-responsiveness).

Verification (2026-10-21): type checking, all **540 deterministic tests**, the
production UI build, full `npm run test:browser` and diff checks passed. The browser
fixture reported zero observed long tasks across its large-project interactions
and a 69 ms initial Implement-tab switch for 500 requirements; this is not a live
assessment or cross-machine benchmark. Tests ran in an isolated Node 22.23.3
copy to avoid changing the repository's Node 20 native dependencies. An initial
long-path copy hit Windows Git-worktree failures; the shorter-path run passed.
The existing Vite chunk-size warning remains. No live model calls were made.

Preparation groups **Check progress → Prepare plan**; **Build and verify** separately
offers **Start implementation**.
The coding action becomes **Resume implementation** for an unfinished run and
**Verify delivery** while awaiting a merge. A next-step message explains setup,
planning review or continuation. **Check options** is collapsed by default and holds
**Preview changes** (local impact preview without model calls) and **Recheck everything**
or **Recheck feature** (forced assessment). Checks follow the selected feature;
planning covers all approved requirements. Search/status filters only change the list.
Stop remains available beside the main actions while a worker is active.

These are presentation changes to the existing operations. Existing assessments,
plans, sessions and delivery evidence retain their formats and freshness semantics;
no data migration or repeated model calls are required.

Consolidated-action verification (2026-10-19): type checking, all 240 deterministic
tests, production UI build and Playwright browser checks passed. Browser checks cover
collapsed options, incremental/forced/preview request routing and feature scope,
planning approval, Start/Resume/Verify labels and continuation routing, and 390px
layout with options expanded. Screenshot: `.reqwizit-state/browser-implementation-actions.png`.
No live model calls were made.

### Prepare and review implementation order (DEC-025)

**Prepare plan** operates on all approved requirements in active epics
(up to 500), independently of the list's feature/search/status filters. Save execution
settings and connect the local Git root first. Existing-project users should run
**Check progress** for evidence before planning. Planning itself does not capture
new code, fetch main, run checks, modify source or establish branch availability.

- The saved OpenCode model proposes one work package per approved requirement, with
  implementation steps, acceptance-linked verification, dependency reasons and evidence
  IDs, confidence and unresolved questions. Supporting foundations stay within the
  approved outcome; multi-requirement packages and independently executable subpackages
  remain future work.
- Each target uses a fresh read-only planning session and bundled planning skill. Exact
  target/human evidence and dependency guardrails are retained. Optional dependency
  candidates are ranked deterministically by shared behavior words and feature, then
  included with full approved statements/scenarios only while the complete request fits
  the 48,000-character budget (including schema, skill and runtime reserve). Oversized
  candidates do not prevent smaller ones from fitting. Ranking is not proof of dependency
  coverage: omitted candidates are counted explicitly, cannot be cited or proposed as
  prerequisites, and cause an app-owned unresolved question requiring human resolution
   before approval. The single-context path uses one request per target, not exhaustive dependency analysis.
  Other targets' unrelated human histories are explicitly omitted. Mandatory context
  first uses lossless text/identifier/record-table sharing; historical assessment
  bodies are replaced by explicitly non-evidentiary current/status metadata. Original
  assessments remain saved and are not reclassified as current inspected code.
  If mandatory evidence still exceeds one request, the staged protocol below applies.
  No mandatory evidence is truncated. Each request consumes provider allowance; the
  UI explains that larger requirements can need many reading/checking requests.
- Package checkpoints and session IDs persist after each successful response. Explicit
  retry skips completed packages only when specification revision, workspace binding and
  saved settings still match. Cancellation, malformed output and stale responses retain
  prior packages and diagnostics without changing reviewed dependencies or delivery.
- **Hard prerequisites** are individually selectable; **preferred ordering** is advisory.
  Initial suggestions apply compatible preferred edges, ignoring preferences that would
  create a cycle. Move packages earlier/later to adjust tie-breaking. The separately
  displayed dependency-safe sequence always honors selected hard edges and existing
  configured/epic guardrails. Cyclic proposals remain reviewable, but approval rejects
  cycles (including incompatible epic-PR grouping). Existing broad epic dependencies
  remain intact; planning does not silently narrow them.
- Questions require human resolution notes before approval. **Approve implementation
  plan** atomically saves selected hard prerequisites and the deterministic order using
  specification-revision and execution-version checks. Proposal text and rejected edges
  remain original evidence; accepted edges, notes and approval time are recorded.
- Coding uses the approved package's steps/verification as guidance; approved requirement
  behavior remains authoritative. The executor retains its sequential verification and
  merge/branch prerequisite barriers. A new run is blocked by an unreviewed or stale plan.
  An already frozen run retains its existing scope; archive it before preparing a plan.
- **Dismiss plan proposal** retains the proposal/history and permits the existing manual
  prerequisite workflow. Legacy projects acquire no implicit AI dependencies or approval
  requirement on upgrade. Changing specification, workspace or settings makes a plan
  stale; completed code/evidence is retained. Replacement proposals retain prior plans.

### Large planning contexts and exact-stage continuation (2026-10-25)

**Prepare plan** now falls back to exact staged planning when the mandatory target
closure cannot fit one 48,000-character request after lossless encoding. The target,
project policy and configured dependencies remain exact in each request. Complete
guardrail/supporting requirement records, human sources, questions and research are
partitioned into at most 32 exact-record batches, without sampling or truncation.
Every batch is read into a bounded draft, then every batch verifies that draft before
the package can be exposed as a proposal. Verification may remove unsupported
prerequisites and add unresolved questions; it cannot rewrite steps/verification,
add positive prerequisite findings or erase existing questions. Unsupported steps
must be raised for human resolution, not silently accepted as established behavior.

Each request includes only its exact batch, the target/global constraints and a saved
proposal draft. Cross-batch links are navigation, not authority to infer unavailable
evidence. Citations and prerequisite targets must be supported by supplied/read
records. Indispensable cross-batch uncertainty remains a question. Staged packages
always carry an app-owned review warning, including the count of optional approved
dependency candidates not reviewed by this mandatory-only protocol. Human review
and explicit question-resolution notes remain required before approval/coding.
This is bounded proposal preparation, not exhaustive dependency proof.

There are at most 64 stages and three spent attempts per unfinished stage. Draft
headroom is reserved during exact partitioning, but no draft/evidence is truncated
if it later grows too large. An indivisible record, target/global envelope, growing
draft, or the batch bound can still block before dispatch. The existing full request
preflight includes schema, skill and runtime reserve; its 48k cap is unchanged.
One action pauses after 32 staged requests across targets. This cap is separate from
the existing single-context per-target path. Stop/cancellation, stale inputs and
connection/validation failures retain completed stages and spent attempts. Restart
does not initiate calls. Choose **Prepare plan** explicitly to continue compatible
unfinished work; completed packages and accepted requests are not repeated.

New partial ledgers are versioned inside the existing planning envelope and portable
projection; see [migration/recovery](migrations.md#exact-staged-implementation-planning-2026-10-25).
Existing compatible completed packages, approved plans, assessments and delivery
evidence are not invalidated by this representation change.

Verification includes deterministic wire round trips, complete record read/check
coverage, verification restrictions, failure/cancellation/staleness, spent attempts,
32-request pause/resume, SQLite reopen, portable replay and future-format rejection.
The focused `npm run test:browser:planning` checks usage guidance, saved-step progress,
Stop/reload/explicit continuation, retained history, review questions and 390px layout.
Screenshot: `.reqwizit-state/browser-planning-stages-mobile.png`. A read-only local
reconstruction of the reported Rust Grind Galaxy target planned 175 mandatory records
in 15 batches/30 stages. This is not live planning qualification: no personal-project
writes or live model/GitHub requests were made, and actual model output may still
expose a context/validation/relationship blocker.

Checks run on Windows Node 22.23.4: type check, all 192 pretests and 652 main tests,
UI build, focused staged-planning browser checks and diff whitespace checks passed.
Aggregate browser checks passed workspace layout and model selection, then stopped
at the existing missing **Project map** tab assertion (`browser-check.ts:706`); later
portable/specification browser runners did not execute. Existing bundle-size warnings
remain. No live planning or coding/delivery qualification is claimed.

Planning format 1 is additive within execution schema 1; see [migrations.md](migrations.md).
Deterministic service/runtime and browser checks cover validation, cyclic-edge rejection,
review notes, order, checkpoint retry/reopen and mobile rendering. Live planning quality
and effective live planning permission enforcement remain unqualified.

Verification (2026-10-19): `npm run check`, all 240 deterministic tests, the UI build
and Playwright browser checks passed. Browser coverage includes preparing proposals,
rejecting a cyclic edge, resolving questions, approving/reloading the plan and 390px
layout; screenshot `.reqwizit-state/browser-implementation-planning.png`. The main-delivery
fixture also verifies reviewed order and package guidance reach sequential coding. No
live model calls were made.

**Check progress** requires a connected workspace and saved Implementation
settings (OpenCode model, delivery strategy and at least one verification command).
The local phase does not execute those commands; the main phase does. Detecting the
repository fills the form but does not save it. When an action is disabled, a message
below the buttons identifies missing settings, active discovery/implementation work,
an in-progress save or a changed repository for delivery. Local assessment does not
fetch origin or require remote-main access. Dependency-order errors block execution
planning but do not prevent an otherwise configured assessment.

**Implement** sits beside **Review** in the **Design → Review → Implement** workflow, using the existing tabs, feature filter,
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

Epic headers show **assessed locally**, **complete locally**, partial/missing/unknown,
not-assessed and needs-reassessment counts, plus a separate **verified on main** fraction.
They cover all of the epic's approved requirements even while filtering visible rows.
Local counts use working-folder results (including legacy aggregate results explicitly
scoped to the workspace), not a stronger result found only on main. Current unknown
and reused results count as assessed locally; stale results do not count as current
completions. **Assessed** and **Unknown** row filters retain their best-supported
local/main behavior. Counts and requirement badges update as checkpoints arrive during a run. Freshness
also checks the relevant supporting answers, feature/project notes and dependency
guardrails, so unchanged requirement wording alone cannot keep an outdated result current. Rows label
coding activity explicitly (**Coding: not started** can coexist with a saved code
assessment), and identify the requirement currently being assessed or verified.

**Overall progress → Implementation** also shows local completeness counts and meters
for the project and each epic, alongside verified-main delivery. Local percentages use
approved requirements; the delivery score still includes all non-rejected requirements.
These views update through snapshot polling during assessment, without waiting for an
entire epic or the main phase to finish. The overall percentage continues to use the
delivery score. Local code findings do not establish verified-main completion.

Local-summary verification (2026-10-19): type checking, 20 targeted progress/workspace
tests, the UI build and Playwright checks passed. Tests cover all result categories,
stale exclusion, local/main separation, active/approved scope, legacy local records,
filter-independent epic totals and live polling into both the epic and open progress
dialog. Mobile layout was checked at 390px; screenshot:
`.reqwizit-state/browser-local-assessment-progress.png`. No model inference was used.

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
3. **Check progress** captures bounded file evidence from the working folder and
   assesses approved requirements sequentially. It does not execute checks or establish
   main delivery. Each scenario needs evidence; omitted scope stays unknown. A real
   run reports its stage, selected/completed counts and code-status summary. Empty
   approved scopes are rejected rather than reported as successful zero-item scans.
4. The same action then fetches main, creates a detached worktree, runs configured
   checks and assesses the same requirements. It can recognize existing implementation
   predating Reqwizit's coding runs. Local and main evidence are saved separately;
   the strongest supported code status is displayed, and only complete verified main
   receives **Implemented** status. A remote/tooling failure retains local results and
   previous dated delivery evidence, with a diagnostic rather than a missing-code claim.
   Both phases share one worker lease and cancellation control; **Assessment details**
   and previous runs retain each phase's scope, commit, counts and check output.
   The header's **Processing & queue** also shows both phases, their current stage,
   requirement and assessed/selected count from any workspace tab. Its
   **Stop implementation** cancels the same worker. Coding, verification and delivery
   also appear there alongside discovery/scans and concurrent question help. Recent
   background work retains outcomes and diagnostics after processing stops.
5. Use **Implement**, **Implement epic** or **Start implementation**. Individual/epic
   actions freeze that scope. **Resume implementation** resumes it; **Verify delivery**
   continues after a merge. After completion, **Start implementation** plans remaining
   approved requirements.
6. Expand **Execution & delivery details** for worktree/session IDs, commits, check
   results, PR links and progress. Stop/app closure retains checkpoints; restart never
   automatically repeats work. **Archive run & replan** retains history, branches,
   worktrees and sessions and permits new settings/scope.

### Assessment results, errors and retry

**Check progress** is incremental: current saved results are reused, including
missing, partial and unknown results. **Check options → Recheck everything** bypasses reuse for every approved
requirement; with a Feature filter selected it becomes **Recheck feature**. Each
requirement also has **Reassess** for a forced local/main check of that requirement only.
These actions share the same lease, cancellation and evidence checks as normal checks.
Force never bypasses approval, source validation or main verification and is rejected
for coding execution. Main verification commands still run on every check.

**Check options → Preview changes** performs a local capture and deterministic impact pass,
without model calls, fetching main or running verification commands. It lists pending
and reusable requirements with reasons before expensive assessment. It shares the
worker lease/cancellation rules and saves an explicitly labeled preview, not a
zero-item assessment. A subsequent Check refreshes the capture; the preview is not a
promise that files will remain unchanged. Feature selection limits the queue/action.
Every capture updates impact metadata for all approved requirements, so a check of one
requirement can identify stale evidence elsewhere without inferring on it.

Under **Implementation settings → Assessment reuse boundaries**, configure literal
repository-relative files/directories per requirement or apply them to all currently
approved requirements in a feature. Click **Apply boundary**, then save settings.
Include implementation, tests and supporting modules; use **Shared code paths** for
cross-cutting code. New requirements start repository-wide. These are human-reviewed
impact/search boundaries, not inferred from citations or keyword similarity.

- Blank boundaries retain repository-wide impact checking. Scoped checks monitor new,
  changed and deleted files under the reviewed paths, root files, nested configuration,
  shared paths, referenced evidence and transitive prerequisite scopes.
- A prerequisite without a reviewed scope, an unmatched configured path, incomplete
  watched capture or traversal limit widens impact checking to the repository.
  Omission inventory changes invalidate reuse conservatively. Existing capture exclusions
  and budgets still apply; uninspected bytes are not certified by a fingerprint.
- A new scoped assessment searches the bounded capture within that boundary, with an
  explicit boundary notice in the prompt. All detailed evidence-window paths are
  retained in the footprint, even if the final result did not cite them. Citation-only
  reuse cannot detect newly implemented behavior and is not used.
- A new HEAD alone does not repeat inference when content/coverage inputs match.
  Evidence retains its original dates and commit. **Reuse footprint** lists monitored
  files and whether the boundary widened to repository-wide checking.
- Fresh assessments use a bounded index of the latest 200 reachable commits to
  prioritize current files linked by exact `Requirement: <id>` lines or conventional
  commit scopes such as `feat(<id>):`. Changes since the scope's last assessment
  commit also receive priority, including unmarked/shared changes, staged/unstaged
  edits and untracked files. History and baseline diffs are cached per target/run.
  This only ranks evidence windows: no commit text enters model evidence, no reviewed
  boundary is inferred or narrowed, and content/coverage checks still determine reuse.
  Missing/shallow/rewritten history or bounded-command failures fall back to ordinary
  current-source ranking; cancellation still stops. Older assessments remain reusable.
  Existing source capture and main verification still run; no measured speedup is claimed.
- **Reuse equivalent local/main assessments** can also avoid a second semantic model
  call when a compatible footprint, relevant decisions and selected model match the
  target capture exactly. Main checks still run first. The copied target checkpoint
  records its target snapshot plus `semanticOrigin`; the source checkpoint remains
  unchanged. Forced checks bypass this reuse too. This is enabled in the new-settings
  browser form; existing saved settings retain separate scope assessment until enabled.
- **Mark for reassessment** queues one approved requirement, optionally with a reason,
  without starting inference or erasing its result. The request persists across restart
  and invalidates local/main freshness independently until each scope is checked. Main
  delivery credit is withheld while its supporting assessment needs reassessment;
  previous delivery evidence is retained. Settings/marking use execution CAS and reject
  active-worker conflicts.

New or changed reviewed boundaries require a fresh search once. Older checkpoints
without footprints can be enriched without inference only when the exact saved capture
fingerprint and other reuse inputs match and no new scoped search is required. See
[migrations.md](migrations.md) for the additive compatibility and recovery contract.

Incremental-impact verification (2026-10-19): type checking, all 224 deterministic
tests, UI build and Playwright browser checks passed. Real-local-Git fixtures verify
unchanged-content commits, scoped new/deleted files, unrelated-result reuse, narrow-run
impact outside selected inference scope, manual marking, SQLite reopen/legacy enrichment,
and equivalent local/main reuse with independent checks, divergent content and forced
assessment. Browser checks exercise boundary saving, queue preview/reasons and manual
marking, including mobile width. No live model calls were made. Automatic code-boundary
inference and per-scenario test scheduling remain follow-on work.

Requirement approval, assessment freshness, assessment result, the active attempt and
Git delivery remain separate state dimensions. **Assessed** means a persisted current
result; it does not mean the requirement is complete. **Needs reassessment** gives a
reason: changed requirement/approval, supporting decisions/guardrails, workflow/skill,
model or code snapshot. Freshness uses the latest captured snapshot for each scope;
it is not live filesystem monitoring. Check or queue preview detects captured changes.
Reviewed footprints narrow invalidation; requirements without reviewed boundaries keep
repository-wide checking. New files and search coverage matter too, so reuse is not
based solely on previously cited file hashes.

Run details distinguish reused and freshly assessed requirements and record whether
the action was forced. Each completed requirement is checkpointed immediately in
SQLite, surviving app restarts. Failed/cancelled forced attempts retain older dated
results; normal retry can reuse already completed fresh checkpoints. A failed attempt
with newer captured code can still make older results stale. It does not replace the
old result with a missing-code claim.

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
the entire capture. Provenance-linked files are prioritized rather than forced into
every window; they can be indexed and requested in a later window. Selected excerpts
remain byte-exact. Omitted-path inventories stay
in the saved run; the model receives reason counts and a bounded sample instead of
thousands of repeated excluded paths. Short `file:N` handles resolve back to captured provenance. Source
hashes and HEAD are checked before accepting results; excluded binaries/cache files
are not reread to validate source evidence. Over-budget genuine evidence/requirements
still block explicitly rather than being silently truncated.

Assessment freezes the specification and selected approved requirements when the action
starts; both local and main phases use that same revision. You can keep submitting
answers, notes and reviews while it runs; these wait durably until the worker finishes.
Storage rejects direct snapshot mutations during execution, including from terminal
clients and other app processes. Automatic follow-up respects manual pauses; failed,
cancelled and expired workers require explicit resume for waiting work. Unrelated answers
do not invalidate unchanged results when subsequently applied. Changes to relevant answers, feature/project notes, requirements or
dependency guardrails mark affected results **Needs reassessment**; they cannot establish
current main delivery. Results retain their original specification revision, and the
completion summary reports outdated results. Run **Check progress** again to
assess current decisions; assessment does not require archiving a coding run.

Completed requirement assessments are checkpointed individually. Running the same
action again reuses results only when relevant task-context identity, requirement fingerprint,
model, assessment semantic compatibility and content/search/omission footprint match.
Workspace/main remain separate checkpoints, with optional equivalent-content semantic
reuse and independent main verification. Legacy checkpoints require exact capture
equivalence before footprint enrichment.
Unrelated revision changes allow reuse; changed relevant inputs need fresh inference.
Older assessments without task-context identity remain revision-bound (undated ones
need reassessment). Context identity is local cache metadata, excluded from portable
progress artifacts. New delivery evidence carries the same context identity so later
relevant decisions invalidate its current credit while retaining dated evidence.
Cancellation/failures retain valid earlier results. Verification is
rerun on each main-verification request. Tooling failures keep previous dated
assessment/delivery evidence; they do not certify current main anew.

Workspace reconnection, HEAD changes and captured-source changes still stop assessment
within a running capture with an assessment-specific diagnostic. HEAD-only changes
between separate actions no longer invalidate equivalent captured evidence. Coding execution retains strict revision checks
and requires archiving/replanning after specification changes.

Concurrent-assessment verification (2026-10-19): all 210 deterministic tests passed.
After normalizing context identity across object-property order, type checking and
36 targeted context/service/workspace tests passed, as did the UI build and Playwright
browser checks. Fixtures exercise answers during inference and between phases,
unrelated-answer reuse, relevant-decision freshness/delivery invalidation, repository
changes and strict coding revision checks. Browser checks cover stale badges, counts
and filters after a global decision changes without changing requirement wording.
No live model or GitHub delivery calls were made.

If a suggested command fails (for example `godot` is not on PATH), inspect its output
and set the actual executable path or fix project/toolchain errors before retrying
the implementation check. Its local phase completes before main verification runs
those commands.

Unified-check verification (2026-10-19): type checking, all 202 deterministic tests,
the UI build and Playwright browser checks passed. Local Git fixtures cover selected
scope, independent local/main results, reuse, unavailable main, failed commands,
delivery credit and detached-worktree cleanup. Browser checks cover the single action
and its `check` request. No live model or real GitHub delivery was exercised.

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

### Bundled OpenCode skills

`src/core/execution-skills.ts` is the shared source of two versioned workflows:
`reqwizit-assess-requirement` and `reqwizit-implement-requirement`. The owned runtime
materializes the applicable workflow as `<temporary-directory>/<skill-name>/SKILL.md`,
registers it using OpenCode's `skills.paths`, and removes it when the runtime closes,
including startup failures. Project/worktree configuration files are not needed.
The workflow content is compiled into the application, including the staged desktop.

Agent instructions require loading the corresponding skill. Before prompting,
the adapter checks the registered name, location and exact body and requires the native
skill tool. After prompting, persisted session messages must contain a completed load
of that skill with its matching content before task completion is accepted. Existing
matching completed coding responses can still be recovered without another model call.
Resuming an unfinished session refreshes its session permissions explicitly when the
required restrictive profile is not already the final ruleset. OpenCode 1.18.32 appends
updates rather than replacing permissions; each profile begins with deny-all before
its exact grants, and identical final profiles are not appended on every resume.

The runtime, agent, session and request tool allowlists grant only the role's named
skill. Assessment gains no file-reading, shell, research or delegation tools; coding
retains its existing focused coding tools and no delegation. External Claude/Agents
skill discovery is disabled for these owned execution runtimes; other project/global
skills are not granted by the role's skill permission. Permission setup/fixture checks
do not establish adversarial sandbox enforcement.

The full skill document is included in character-budget preflight, with name/version/
size recorded in task context manifests. Assessments also save the original skill
name/version. Assessment semantic compatibility is versioned separately from workflow
prose and context-budget policy, so compatible upgrades preserve saved findings. Material
semantic changes require an explicit compatibility decision or reassessment; record them
in [migrations.md](migrations.md). Known equivalent legacy identities migrate from their
saved inputs with original identities retained. Pre-skill workflow results still need a
fresh check. Reqwizit still owns requirement state, scheduling,
freshness, validation, checkpoints and all Git delivery operations.

`npm run runtime:skills` checks both profiles against the installed runtime without
provider inference: registration, exact body, native skill tool, session permission
create/update/get and temporary-file cleanup. OpenCode 1.18.32 passed this metadata check
on 2026-10-19. Deterministic adapter tests cover role tool maps, required-load validation
and idempotent resumed permissions. An explicit, 90-second-bounded live assessment
with `openai/gpt-6.1-sol` loaded the matching assessment skill and returned a validated
complete scenario result for a tiny supplied code excerpt. No source edits or delivery
occurred. Coding-model skill use and adversarial permission behavior remain unqualified.
Restart the app after updating bundled skills so new owned runtimes load the update;
already-running instances retain their loaded configuration.

Incremental/skills verification (2026-10-19): type checking, all 212 deterministic tests,
the UI build/Playwright checks and desktop TypeScript compilation passed. Following
the native append-semantics finding, the six runtime adapter tests, type check and
desktop compilation passed again with idempotent resume handling. Browser checks cover
normal versus forced API requests, whole-project/feature/requirement scopes, and fresh/
reused counts. SQLite fixtures cover reopening, unknown-result reuse, failed forced
attempts, interrupted per-requirement checkpoints and normal retry without replay.

### Requirement context boundaries

Context contains one approved target, its exact acceptance scenarios/supporting human
decisions, relevant feature notes, and necessary approved project/dependency guardrails
(including transitive prerequisites). Sharing an epic or original source does not pull
in sibling requirements or their review history. Background AI rationales, UI tooltips
and historical file motivation may be omitted explicitly; normative human input is
never silently truncated. Question explanations and clearly unselected options are
omitted from execution/assessment prompts. Exact option-label answers retain the
selected consequence, including all retained historical selections. Custom, ambiguous,
delegated or unresolved responses retain every option. Saved questions and source
records remain intact. This uses context policy `requirement-isolation-v3`; older policies
without proven semantic compatibility still need reassessment. Oversized assessment decision context first
tries discovery's lossless shared-text, identifier and record-structure tables: repeated approval wording,
IDs and field names are stored once with explicit expansion instructions. Record tables
preserve order and distinguish absent fields from nulls. Human evidence is not
summarized, and current file excerpts/handles stay unencoded. Historical workspace
evidence cannot prove current behavior.

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
be cited. Exact target requirements/human decisions are indivisible; if they cannot
fit after lossless compaction, the task becomes **Context blocked**. Requested excerpt
batches are packed into bounded windows without cutting file bytes. Deferred IDs are
explicit in the prompt and carried forward by the service, even if the model claims
completion. After three windows, outstanding requested scope forces an unknown result.
If no requested excerpt fits with retained decisions, the service records unknown
without another model call and continues assessing the remaining requirements. Historical
file links alone do not make all matching current excerpts mandatory in each window.
Earlier windows do not accumulate in the next prompt.

Follow-up budget verification (2026-10-19): type checking and 29 targeted context,
runtime, storage and implementation tests passed. A read-only local-project exercise
built 832 initial/simulated follow-up windows across 287 approved requirements within
48,000 characters. Five simulated follow-ups had no individually fitting requested
excerpt and retained unknown scope instead of blocking the action. This exercised
context construction with saved decisions/current capture, not live model responses.

Coding context blockers pause execution before advancing to another requirement.
Assessment context blockers skip only the oversized target and continue the remaining
requirements, including the separate main phase. The affected phase finishes **blocked**,
with assessed/selected and blocked counts; a blocked target is not recorded as unknown,
missing or completed. Older dated findings remain intact. Other errors and cancellation
still stop the action. Per-task context counts/block diagnostics, original requirement
IDs and assessment session counts are visible in details. Run **Check progress** again
to reuse compatible completed checkpoints; **Recheck everything** forces new calls.
These local context manifests remain separate from portable requirements artifacts.

Context-block isolation verification (2026-10-21): type checking, 557 deterministic
tests, desktop TypeScript compilation, UI build and the main browser checks passed
using Node 22.23.3. Fixtures cover lossless table expansion, unchanged task identities,
multiple skipped targets in local/main phases, preservation of dated evidence and
incremental reuse after SQLite reopen. Browser coverage includes blocker IDs/counts
and mobile layout. The separate portable browser check failed on an ambiguous
`Open shared checkpoint` selector (two matching buttons); the full browser command
is not passing. No live model calls or reassessment of the reported project ran.

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

Database schema 2 and execution payload schema 1 migrate on startup before workspace
publication. Ordered upgrades retain original payloads transactionally, preserve valid
assessment/delivery evidence and reject active-worker conflicts or unsupported future
formats. The execution concurrency counter remains separate and advances once for
migrated rows, rejecting pre-upgrade readers. See [migrations.md](migrations.md) for the
supported legacy identity conversion, compatibility limits and failure recovery.

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
Portable progress summaries omit local worktree paths, session IDs, account settings
and runtime logs. DEC-029 adds separate `.reqwizit/execution.json` continuation state:
assessment model/capture/context/footprint provenance, latest impact manifests, reviewed
configuration, partial planning and commit/PR/delivery evidence survive clone/open.
Compatible results are reused after current-code inspection, not merely trusted because
the folder was opened. Main verification remains independent. Imported verification
commands are not run on open; review them before explicitly checking. Imported coding
runs retain foreign bindings and must be reviewed/archived rather than silently resuming
missing sessions/worktrees. External-edit conflicts and historical manual statuses remain
protected. This is not a complete database backup or full coding-recovery implementation;
see [portable project workspaces](project-workspaces.md).

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
