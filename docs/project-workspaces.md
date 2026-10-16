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
    requirements.md
    requirements.json
    progress.md
    progress.json
```

- **requirements.md** groups stable requirement IDs, review statuses, rationales,
  acceptance criteria, and evidence references under features. Candidate goals,
  actors, assumptions, and remaining questions are labelled separately.
- **requirements.json** contains structured specification records, questions,
  original human sources, and research evidence. It excludes model/account selection,
  credentials, local bindings, and job diagnostics. Human-entered content is retained
  as entered; review it as you would any document before sharing a repository.
- **progress.md/json** contain estimated discovery coverage and manually recorded
  implementation status, notes, evidence, and review flags for each requirement.
- **manifest.json** identifies format version 1, project ID, revision, and SHA-256
  artifact hashes. It is published last. Consumers should verify hashes before
  treating multiple files as one coherent revision.

Files update automatically after committed project changes, including completed
discovery jobs, queued answers applied by the service, reviews, and implementation
updates. Git initialization, staging, commits, and pushes remain user-managed.
These files are generated outputs, not a two-way editing or project-import format.
They do not include the entire SQLite history or constitute a complete app backup.

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
the journal retains recognized intermediate hashes across interrupted retries. Files
are written to unique same-directory temporary files and renamed individually, with
the manifest last. The set of files is not a filesystem-wide atomic transaction.
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

This foundation does not yet launch OpenCode against the connected repository or
analyze existing source files. Integrated build execution remains M6; evidence-backed
existing-project reconstruction remains M7.
