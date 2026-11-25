# Lossless local database compaction

## Why the database grew

Read-only inspection on 2026-11-24 found a roughly 23,743 MiB database with 4,174
historical revisions and effectively no freelist space. Recent project snapshots
were 13,404,328 bytes, including about 8.6 MB of refinements. Repeated full-project
JSON snapshots, not simply the latest user's input, were the primary reproduced
growth mechanism. A single snapshot compressed by 77% in a read-only sample; that
is not a measured whole-database saving.

## Implemented first stage

SQLite 92 adds **opt-in exact shared revision storage**. It does not delete older
history or convert a production store during startup.

- `revision_objects` stores immutable SHA-256-addressed exact JSON fragments.
  Top-level array records are separated so unchanged answers, requirements,
  refinements, assessments and other records are stored once. Punctuation,
  whitespace, Unicode, unknown fields, key order and original escaping are retained.
- `revisions` retains project ID, revision number and reason, with a small ordered
  manifest instead of a repeated full snapshot. Different events/decisions retain
  their separate identities even when they share identical text.
- `revision_documents` reconstructs the exact original JSON through ordinary
  SQLite SQL, without extension/UDF installation. All application historical
  readers use this view. Its byte metadata preserves existing bounded reads without
  first expanding oversized snapshots. Missing objects fail, rather than silently
  omitting evidence. Immutable-object triggers prevent accidental updates/deletion;
  the explicit verification pass also checks object and full-snapshot hashes.
- `revision_checks` shares historical compatibility-marker projections by content.
  Startup validates these distinct retained markers plus manifest metadata instead
  of rebuilding every historical project. These are not evidence/assessment caches
  and cannot establish new freshness or authorization. Legacy rows still receive
  their original validation; the existing question-target index is now used.
- The latest project remains a normal single current-state row. Project listing
  reads just navigation metadata rather than parsing all project records in JS.
- Once explicitly enabled in a converted copy, ordinary app writes and portable
  adoption use shared revision storage. Unconverted stores retain their old write
  representation until compaction is explicitly selected.

Paid jobs, saved submissions, original answers, activity, migration/import backups,
execution/delivery state, optimistic revision counters and allowance/lease records
are retained. No freshness policy, model prompt, assessment identity or portable
file format changes. Existing portable record sharing and exports remain compatible.

## Safe offline command

Close Reqwizit and allow its workers to stop. Supply explicit file paths:

```powershell
npm run db:compact -- --source "D:\AppData\projects.sqlite" --output "D:\AppData\projects-compacted.sqlite"
```

This is a maintenance tool, not a startup action or automatic replacement:

1. Refuse an existing output, the source as output, unsupported versions and live
   worker leases. Check free space for a consistent SQLite backup (including
   logical pages currently held in WAL), later conversion and space reclamation.
2. Use SQLite's backup API to create `projects-compacted.sqlite.building`. Never
   mutate the source, copy credentials or publish to connected workspace folders.
3. Upgrade/validate only the copy through the ordinary app reader. Convert one
   revision transactionally at a time, checking exact reconstruction before commit.
   Conversion yields between eight-revision batches and checkpoints its WAL.
4. Verify all object hashes, every reconstructed revision, SQLite integrity and
   foreign keys. Keep all non-rebuildable tables. Only the three derived portable
   caches are cleared: `portable_snapshot_cache`, `portable_record_cache`, and
   `portable_source_digests`. They rebuild without AI calls.
5. Use `VACUUM INTO` a new reserved output to actually reclaim disk space. Reopen
   it with the app reader and repeat revision/hash/integrity checks. Check that the
   source's database/WAL size and modification signatures stayed unchanged. Only
   after success remove this operation's exact staging/sidecar files.

The original remains the backup. **The tool never swaps it out or changes the app's
data directory.** Do not manually swap database files while any app/process has them
open, or separate a database from its uncheckpointed WAL. Deployment/replacement
of a real store is a separate explicit step after reviewing the successful report;
keep the original until the compacted store and its history/recovery have been checked.
Older app binaries reject schema 92 rather than attempting to overwrite manifests.

The initial staging backup needs roughly 1.3× the source's logical size plus 64 MiB
free; reclamation separately checks headroom against the copy's used pages. These
are conservative preflight checks, not guarantees against disk exhaustion by other
processes. Any later write failure retains the original and committed staging work.

### Interruption and failure

After an interruption **following a completed staging backup**, use the same paths:

```powershell
npm run db:compact -- --source "D:\AppData\projects.sqlite" --output "D:\AppData\projects-compacted.sqlite" --resume
```

Committed revisions are not converted twice; a failed revision transaction rolls
back its manifest, objects and check projection. Verification can safely repeat.
If the source changed, resume is refused rather than treating an older copy as
current. Preserve it and choose a new output name for a new backup. An interrupted
initial backup has no completed-copy marker and is not resumable through this
command; use a new output path. Never blindly delete a staging file you did not
create. SIGINT is observed between conversion batches; a process killed during
synchronous verification retains the same committed staging work.

## Qualification and remaining scope

The 52-revision synthetic fixture reduces shared payload bytes from 1,779,567 to
289,334 (84%), preserving every original snapshot byte. Tests cover exact JSON
representation, unknown fields, schema upgrade/reopen, atomic interruption/retry,
stale writes, future markers/settings, immutable/missing objects, original-file
preservation, actual file reclamation, resume after cancellation, source edits and
live-lease refusal. A separate staged saved-response test continues from a paid
receipt after compaction without repeating it and roundtrips portable evidence.

The full `npm test` run passed (1,056 pretests, 875 main tests and 460 posttests;
later targeted additions also passed). Type/UI build checks and portable,
Specification and conflict-card browser checks passed, including the conflict
workflow against a newly compacted copy (`npm run test:browser:storage`).

A separate read-only sample of three consecutive real snapshots converted **only
in an in-memory database**, preserved every snapshot digest, and reduced measured
payload bytes from 40,270,230 to 15,040,837 (63%, about 926 ms on this machine).
This sample is not a whole-store size or conversion-time estimate. No live provider
calls were made for compaction qualification.

### Full local copy qualification (2026-11-24)

On the user's subsequent request, the offline command completed conversion and
verification of all **4,181 revisions** in the actual local store. The verified
copy occupies **1,333,219,328 bytes**, versus **24,994,840,576 bytes** originally
(94.7% smaller). The command checked exact per-row reconstruction, object and
revision digests, SQLite integrity/foreign keys, and the final reclaimed output.
This qualifies this local copy, not every possible historical store or platform.

The application storage reader opened the compacted copy and loaded all four
current projects with matching identities/revisions: about 7.0 seconds for local
startup validation and 7.3 seconds including project reads on this machine. This
was manual-publication mode, without workspace writes or provider/model calls;
it is not a timed end-to-end desktop/browser launch.

The subsequent original-to-copy audit checked every revision digest/reason against
the original and exact ordered row digests for **26 non-cache state tables**. It
passed. On the user's explicit apply request, the verified copy was installed at
the existing app-data path using Windows atomic file replacement with the original
temporarily retained as backup. The rebuilt schema-92 desktop reader was available
before the switch. A local verification certificate and apply journal were kept
outside the repository; no project data or database file was committed.

Post-install validation confirmed the default data-root selection, all four current
projects, all 4,181 history manifests, foreign keys and the same 26 state-table row
digests. This used the app reader without model calls or workspace publication.
After those checks, the user's separate original-file cleanup request was applied:
the 24,994,840,576-byte pre-compaction backup and its retired sidecars were removed.
The active database remains 1,333,219,328 bytes. The original raw file is therefore
**no longer available for rollback**; all verified history remains in shared storage.
This one-off authorized activation/cleanup does not change the maintenance command's
default policy of producing a separate copy without replacing/deleting its source.

A follow-up regression also covers compacting an already-compacted database:
fresh staging replaces its copied prior-operation marker, never the source's marker
or paid/project state. Interruption/resume keeps the same source-change safeguards.

Follow-on optimizations from the broader design remain **proposed**, not delivered:
independently shared append-only AI checkpoint receipts across continuation jobs,
compression of cold unique objects, further indexed job-startup metadata/validation
reuse, field-selective reconstruction, general cache quotas/garbage collection and
optional retention policy/UI. No old decisions or history are expired to obtain
the implemented savings. SQL-based maintenance must read `revision_documents`,
not assume that physical `revisions.payload` is always a complete project JSON.
