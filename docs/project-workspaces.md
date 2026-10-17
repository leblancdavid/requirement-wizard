# Local project workspaces

Status: implemented for browser and terminal clients under DEC-016. Each app project
can connect to one local directory, including an existing Git repository or a new
ordinary folder. SQLite remains the working store and revision history; generated
files provide readable, versionable specification and progress artifacts.

## Browser

On **New project**, enter an absolute **Local workspace directory**, or use **Browse
folders → Use this folder**. Enable **Create directory if needed** for a new path.
The field is optional so existing app-only projects continue to work.

For an existing project, choose **Connect workspace**, or **Settings → Project
workspace**. The same controls support reconnecting a moved folder, retrying sync,
or disconnecting. Windows drive paths can be entered directly. Browsing uses the
local Node service behind the app's token, host, and same-origin checks.

The workspace header shows **Saved**, **Saving**, **Conflict**, or **Unavailable**,
the connected path, and the last fully saved revision. A failed connection during
creation retains the project and reports `workspaceError`; connect again in Settings.
Disconnecting retains both generated files and app records.

## Generated files

```text
my-repo/
  .requirement-wizard/
    manifest.json
    requirements.md              # overview and feature links
    project.json                 # project metadata and feature index
    progress.md
    progress.json
    features/
      project/                   # shared, project-wide requirements
        requirements.md
        requirements.json
      <stable-feature-id>/
        requirements.md
        requirements.json
    evidence/
      index.json                 # IDs mapped to artifact paths
      sources/<id-hash>.json
      research/<id-hash>.json
      scans/<id-hash>.json
```

- **requirements.md** is the starting point: project interpretation, candidate goals,
  actors, unconfirmed assumptions, and links to each feature, including archived areas.
- **project.json** contains project metadata, origin provenance, and the feature index.
- **features/…/requirements.md/json** contain that feature's stable requirement IDs,
  review statuses, rationales, acceptance criteria, evidence references and questions.
  Markdown shows open questions; JSON retains answered/retired questions and options
  too. Dependencies link to other features. Feature paths use stable IDs, so renames
  do not move files. Unsafe, mixed-case, or Windows-reserved IDs use a SHA-256-derived
  directory name to prevent traversal and case collisions.
- **evidence/** retains original human sources, captured file excerpts, research and
  scan metadata separately. Each source record is stored once and shared by ID;
  requirement Markdown links directly to supporting records. `index.json` maps original
  IDs to paths; evidence filenames are SHA-256 hashes of record IDs, not their contents.
  Exact human-entered text is retained. Review it before sharing a repository.
- **progress.md/json** contain estimated discovery coverage and manually recorded
  implementation status, notes, evidence, and review flags for each requirement.
  Requirement statements are referenced rather than copied into progress files.
- **manifest.json** identifies format version 2, project ID, revision, and SHA-256
  artifact hashes. It is published last and is the authoritative revision for the
  entire set; individual artifacts omit the changing revision to avoid unnecessary
  Git diffs. Consumers must verify hashes before treating files as a coherent revision.

The portable set excludes model/account selection, credentials, local bindings, and
job diagnostics. Start a coding session with the overview, Project-wide requirements,
and the feature being built; follow dependencies and evidence links as needed.
Splitting limits the amount a reader/agent needs to load. It does not discard retained
evidence or promise a fixed reduction in total disk usage. Unchanged files retain their
bytes and timestamps, and implementation-only updates do not rewrite feature definitions
or evidence. SQLite remains the working store with full revision snapshots.

Version 1 folders migrate on startup/sync/reconnection, without creating a project
revision or making model calls. After checking the old files for external edits, the
publisher creates the split set and removes the owned root `requirements.json`.
External edits block migration until restored or a different folder is connected.
Other files are preserved. Empty retired directories may remain. This is a format
change: consumers of the old root JSON should use the manifest/feature index, or
request a combined export.

For a single-document review or sharing, the terminal can print a combined specification
on demand (no model call), including historical revisions:

```powershell
npm run --silent reqwizit -- export --project "project-id"
npm run --silent reqwizit -- export --project "project-id" --json
npm run --silent reqwizit -- export --project "project-id" --revision 3 --json
```

Markdown contains the full readable requirements and open questions. Combined JSON
preserves the version 1 portable specification shape with original sources, research
and scans. Save it outside the managed output names if desired; it is not maintained
on every change and is not a complete application backup or a phased build package.

Files update automatically after committed project changes, including completed
discovery jobs, queued answers applied by the service, reviews, and implementation
updates. Git initialization, staging, commits, and pushes remain user-managed.
These files are generated outputs, not a two-way editing or project-import format.
They do not include the entire SQLite history or constitute a complete app backup.

## Initialize definitions and rescan

On **New project**, choose **Existing project**, select a folder first, review the
suggested project name/description/type, then **Create & initialize existing project**.
The description is optional. A bounded local preview reads Godot/package/.NET metadata
and README/vision prose without model calls, executing scripts, creating directories,
or writing artifacts. Source paths/hashes and suggested values are retained separately
from human edits; unedited descriptions are workspace evidence, not human decisions.
Changing folders updates unedited suggestions but retains manual edits. A fingerprint
check rejects changed preview evidence before project creation. **New idea** retains
manual naming/description and optional folder creation. Existing projects offer
**Initialize from folder** after workspace connection,
on the workspace and in **Settings → Project workspace**. Review inferred requirements
using the normal accept/reject controls on the **Project map**, then explicitly start
**Explore next gaps**. Scanning pauses automatic discovery and creates no new questions.
Failed/cancelled initialization shows **Initialization incomplete**, with **Resume scan**
and **Start new scan** for checkpointed work or **Retry initialization** for older failures;
discovery and automatic answer processing remain paused until a source scan completes.
This also applies to legacy projects with unsuccessful scan attempts and generic questions.

Use **Unrelated / dismiss** beside **Save response** in an expanded question to dismiss
it individually. **Questions → Bulk question actions & history** can dismiss all eligible
unanswered questions. **Replace unanswered questions from project evidence** retires
that batch and starts a new evidence-grounded round after successful initialization.
Answered questions, saved/queued responses and decisions are protected. Retirement
reasons remain in history and future context to discourage reintroducing unrelated choices.
New questions for initialized projects must cite detailed working-context evidence IDs;
the prompt asks for specific baseline gaps/conflicts and names supporting files in the
rationale. Reference checks do not prove semantic relevance; review remains important.

Use **Rescan folder** on the Project map or in workspace Settings after local changes.
Last-scan details show inspected files and retained contents, hashes/line ranges,
added/changed/removed paths, affected existing requirement IDs, exclusions and omissions.
Budget-omitted files are not reported as deleted. Different folder paths have separate
comparison histories. There is no automatic watcher or structured definition import;
existing specification documents are evidence alongside code and tests.

The service reads eligible files without executing scripts. File contents are sent to
the saved AI connection (direct ChatGPT or legacy OpenCode), with tools/web research
disabled. Generated `.requirement-wizard` artifacts are excluded. Capture defaults:
160 explicit excerpts, up to 32,000 bytes captured per file and 180,000 bytes total
(72KB documentation, 12KB configuration, 96KB source), 4,000 visited entries and depth 16.
Each excerpt has exact text, full-file hash, line range and character offsets; partial
files have visible omissions. Read inspection is bounded to 512KB/file and 4MB total.
Vision/README/slice documents, project metadata, gameplay controllers/state and scenes
are prioritized. Godot `.godot`, `.gd`, `.tscn`, `.tres` and .NET project files are supported.
Staging/log directories and agent/tool instructions are excluded from feature capture.
Dependency/build/
cache directories, hidden paths, potentially sensitive filenames, links/junctions,
unsupported/binary files and common secret-content patterns are excluded. These are
conservative heuristics, not a guarantee arbitrary code contains no secrets. User file
selection and Git ignore integration remain future work. Unenumerated scope is flagged.

Scan tasks run sequentially, with at most three captured excerpts and 12,000 serialized
file-evidence characters per batch. Full input context is capped at 90,000 characters.
Each AI response is capped at 20 concise requirements. A `moreWork` response or a full
20-requirement response is replaced with smaller tasks rather than accepted as complete.
Splits preserve the original evidence IDs and captured text; single excerpts can be
subdivided by explicit character ranges. Split depth is limited to four and a single
excerpt can split only when both halves contain at least 1,000 characters. Indivisible
output-heavy tasks fail explicitly instead of silently omitting supported requirements.

Each model call has a five-minute deadline. An active scan automatically continues
across fifteen-minute execution windows at batch boundaries: before starting a batch,
it reserves a full five-minute call plus one minute of cleanup. When less time remains,
it atomically validates/checkpoints the work and extends its live worker lease to
sixteen minutes from now, then opens a fresh execution window. Progress reports
**Continuing scan automatically** with the saved/total count. This continues the finite
batch plan in the same worker without repeating completed calls; no manual Resume
click is needed just because a healthy scan takes more than fifteen minutes.
The batch plan, attempt counts and completed validated
responses are checkpointed in SQLite; progress shows the saved/total batch count.
Timeouts, cancellation and app closure retain those checkpoints without publishing
partial project proposals. **Resume scan** creates a new worker job using the saved
file snapshot and skips completed calls. The UI displays the capture date: resuming
does not read newer file edits. **Start new scan** captures current files and repeats
inference. Timed-out tasks split on explicit resume where possible, with at most three
attempts on an indivisible task. Failed/timed-out model calls, explicit Stop and app
closure still require explicit resume. A stalled worker that cannot reach a safe
continuation boundary retains its execution-window timeout. Renewal rejects expired
leases and changed project/folder state rather than reviving stopped or stale work.

Resume is available only for the most recent failed/cancelled/interrupted scan with
checkpoints, the same project revision/model and the same folder connection identity.
Reconnecting even the same folder invalidates prior checkpoints. Older failed scans
without checkpoints require a new scan. Expired-worker recovery retains checkpoints
and respects other workers' live leases. Existing context uses the normal bounded
planner and exact mandatory evidence; oversized contexts fail explicitly. All validated
scan batches apply together in one revision or none apply. Cancellation and stale
revision/folder checks preserve decisions; restart does not repeat inference.
Files can be captured at different instants, so this is not a filesystem-wide atomic
snapshot. Connected workspace artifacts continue publishing normally after application.

Each batch's scan prompt lists its allowed file-evidence IDs and constrains requirement
citations to a nonempty selection of those exact IDs in the supplied JSON schema.
Model-facing IDs are short snapshot-numbered handles such as `file:19`, so models
do not need to reproduce long hashes. Only the current batch's handles are accepted;
the service resolves them to original captured evidence IDs before checkpointing.
Saved snapshots, proposals and exports retain the original hash-based IDs. Resuming
an older checkpoint also uses short handles for its unfinished batches.
The service independently rejects missing, invented, path-based or cross-batch
citations. Citation failures identify the batch, requirement number and invalid IDs
without quoting file contents; no scan proposals apply. Use **Retry initialization**
to explicitly rerun an older scan without checkpoints. For checkpointed scans, choose
**Resume scan** to reuse validated batches or **Start new scan** to recapture files.

Scan requirement IDs are application-assigned: the model-facing scan schema omits
requirement `localID`, and older responses' optional local aliases are discarded before
checkpoint/application validation. Scan organization can only declare epics, so no
organization operation can depend on those requirement-local aliases. Exactly repeated
epic declarations are coalesced. Reusing one epic alias for conflicting definitions is
rejected before title-based epic reuse, with the batch and offending alias identified;
resume regenerates that batch while retaining completed work. Aliases may repeat across
independent batches. Ordinary discovery retains its strict shared alias validation.

Captured evidence uses the separate `workspace` source kind, retained with contents
after local files change. Portable requirements JSON includes scan metadata/evidence.
Scanning never confirms requirements, implementation or successful test execution.
Rescans retain accepted/rejected decisions and stable IDs; exact duplicate statements
and same-title feature epics are reused. Semantic duplicates and nonidentical change
proposals still need review. Fixed budgets mean scans cannot claim exhaustive features.
Unlinked captured files are optional context; linked evidence for accepted requirements
and human decisions remains pinned. This prevents large captures from making every
subsequent discovery call exceed the ordinary context budget.

Terminal initialization and rescanning share one command:

```powershell
npm run reqwizit -- scan --project "project-id" --expected-revision 3
# Resume a failed/interrupted checkpointed scan using its displayed job ID:
npm run reqwizit -- scan --project "project-id" --expected-revision 3 --resume-job "scan-job-id"
```

Inspect the actual revision first. This command sends files to the saved AI connection
and stops for proposal review; run `analyze` explicitly to continue gap discovery.

## Implementation progress

Open **Project map → Implementation progress**. The feature filter scopes the list.
For each requirement, record **Not started**, **In progress**, **Blocked**,
**Implemented**, or **Verified**, plus notes and verification evidence. Verified
requires nonblank evidence. These are manual assessments, not executed test results.

Requirements confirmation and implementation status are independent. Changes to a
requirement's statement, acceptance criteria, or review status flag its implementation
assessment **Needs review**, preserving prior status/notes/evidence. Reassess and save
to acknowledge the current requirement. Stale assessments do not count toward current
implemented/verified totals. Discovery coverage remains a separate estimate.

## Terminal

Use `--path` and optionally `--create-directory` on `new`, or connect later:

```powershell
npm run reqwizit -- workspace --project "project-id" --operation connect --path "D:\Projects\my-app" --create-directory --expected-revision 3
npm run reqwizit -- workspace --project "project-id" --operation status
npm run reqwizit -- workspace --project "project-id" --operation sync
npm run reqwizit -- implementation --project "project-id" --expected-revision 3 --requirement "requirement-id" --status in-progress --text "Building local storage"
npm run reqwizit -- implementation --project "project-id" --expected-revision 4 --requirement "requirement-id" --status verified --text "Persistence implemented" --evidence "Restart acceptance scenario passed"
npm run reqwizit -- workspace --project "project-id" --operation disconnect --expected-revision 5
```

Inspect the current revision instead of assuming these example values. Connect and
disconnect check the expected revision without creating a specification revision;
implementation changes create normal reviewable revisions. Status/sync reconcile
files and do not make model calls. They return exit code 1 on conflict/unavailability.

## Persistence, conflicts, and recovery

Workspace bindings live in a separate SQLite table with a unique canonical path per
project store (case-normalized on Windows), outside project snapshots and artifacts.
Existing databases gain this table additively. Existing snapshots default to an empty
implementation collection without losing record IDs or history.

Every project revision transaction also marks its workspace dirty. The shared store
schedules synchronization after the outer transaction commits, including nested
queue/job writes. The CLI flushes on close; opening the store retries dirty bindings;
browser polling reconciles the selected workspace and detects external edits.

A five-minute SQLite writer lease serializes publishers across app/CLI processes
sharing the database. A live lease blocks disconnect/rebinding; an expired lease is
recoverable without repeating inference. A crashed writer may therefore delay saving
until its lease expires. Intended file hashes are committed before filesystem writes;
the journal retains recognized intermediate hashes and intended file removals across
interrupted retries, including legacy-layout migration. Files
are written to unique same-directory temporary files and renamed individually, with
the manifest last. The set of files is not a filesystem-wide atomic transaction.
Only changed files are renamed. Retired owned files are removed before the new manifest
is published; external edits to those files also block publication. The publisher checks
both existing managed paths and new output paths before writing. Nested output directories
must be regular directories, and manifest paths are restricted to the supported layout.
Filesystem publication runs outside project transactions; an unavailable folder does
not roll back saved answers or decisions. Temporary files from an abrupt process
termination may remain, but are not consumed as artifacts.

The writer checks managed files against previously published or journaled hashes.
Unrecognized edits, removed previously saved files, conflicting ownership, and
unrelated files at managed artifact names are never silently replaced. Managed output
directories and artifact files must not be symlinks/junctions. Other repo files are
left alone. To resolve a conflict, preserve external edits and restore the generated
files, or connect a different folder. There is no force-overwrite or automatic merge.
Folder moves are handled by explicitly reconnecting the new path.

## Verification

Deterministic Windows/Node 20.11 checks cover automatic human/model publication,
preservation of original text, account-selection exclusion, stale writes, external
edits/deletion/collisions, moved folders, interrupted publication, live leases, and
implementation validation/invalidation. API checks cover authenticated folder access,
directory creation, progress updates, and stale mutations. Playwright exercises
folder browsing/selection, creation with a workspace, verification evidence, saved
progress files, conflict display/retry, disconnect/reconnect, reload, and mobile
overflow with a deterministic adapter and no model inference.

Initialization/rescan is the first M7 slice, implemented under DEC-018. Deterministic
checks cover exclusions, retained evidence, rescan changes/identity, accepted-decision
preservation, malformed references, stale revisions/folder bindings, cancellation,
multi-batch rollback, durable checkpoints across database reopen, explicit resume,
saved-snapshot reuse, timeout/output-budget splitting, bounded batch deadlines,
interrupted leases, authenticated API access and review-first queue
pausing. Playwright covers creation without an idea, initialization failure, checkpoint
progress, reload and explicit resume, manual rescan and mobile width.
No live model scan or real-project reconstruction-quality
evaluation has been run. Integrated build execution remains M6; full M7 change planning
and handoff evaluation remain future work.

October 16, 2026 batching verification: `npm run check`, all 115 `npm test` checks,
`npm run test:browser` (including the UI build), terminal `--help`, and
`git diff --check` passed. These checks use deterministic adapters, not live inference.

Automatic-window continuation is covered by simulated scans exceeding thirty minutes,
single-worker/one-call-per-batch checks, cancellation at renewal, stale project/folder
checks and expired-lease rejection. These are deterministic clock/adapter checks;
live long-running subscription scans remain unverified.

October 16, 2026 split-export verification: `npm run check`, all 138 `npm test` checks,
`npm run test:browser` (including the UI build), terminal `--help`, and `git diff --check`
passed. Workspace tests cover exact
shared evidence, feature rename/move/merge paths, unchanged specification timestamps on
progress updates, legacy migration and interrupted-removal recovery, edited retired
files, nested collisions/links, unsafe IDs/manifest paths, and current/historical combined
terminal exports without account selection. These use deterministic fixtures; no
real-project storage-size or coding-agent context benchmark is claimed.
