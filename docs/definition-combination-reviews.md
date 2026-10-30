# Saved local combined-content reviews

Status, 2026-10-30: **implemented explicit durable local review evidence**, not mixed
publication into current assessments. Saving acknowledges review of the exact combined
contents only. It does not approve product decisions, certify joint consistency, change
scores/confidence/readiness or authorize automatic skips, research, planning or coding.

## Save and reopen

In **Overall progress → Inspect original finding sources**, explicitly load a completed
supported joint check and **Preview combined original findings**. After inspecting the
contents, tick **I reviewed these exact contents; save local review evidence only**, then
choose **Save reviewed combination**. The checkbox alone starts nothing. Saving performs
local verification and a SQLite write, not an AI request. It requires a current preview
and no live discovery/workflow/execution worker; existing leases/allowances are untouched.

The server reconstructs the preview from its original sources inside one immediate write
transaction. The project revision/full-content token, exact joint/root/source witnesses,
whole-area guards and exact preview key must still match. The client submits identifiers,
the expected preview key and `confirmReviewed: true`, never a purported approved packet.
Missing, changed, stale, incomplete, conflicting or oversized evidence blocks the save
without making a model call or substituting another source.

A successful save creates an immutable format-1 `definition-combination-review-v1`
record with a UUID, save timestamp, original exact preview and content identity. It has:

```text
authority: review-evidence-only
acknowledgement: reviewed-content-only
canPublish: false
```

The new timestamp belongs to this local acknowledgement; original finding publication,
input/review and joint response/completion dates remain distinct and unchanged. No user
identity is invented, no original finding is rewritten, and no new human product preference
is recorded. Original/current-baseline findings retain their complete text, importance,
raw status and evidence-ID sequences. A content key is not a signature or freshness proof.

Record insertion and one **Combined finding review saved** Activity entry commit together.
The entry is discovery/review evidence, not a product decision or specification revision;
it explains that assessments/scores/requirements/approvals are unchanged. The same exact
preview is idempotent per project: retries return the original record/date, with no extra
acknowledgement or Activity event. Even a retry re-verifies sources/current tokens; an old
record is not permission to resave stale or unproved contents. Failure rolls back both
record and Activity, and retry does not repeat inference.

**Saved reviewed combinations → Load saved combination reviews** explicitly lists at most
10 metadata entries for the selected area; older entries use an exclusive cursor. Select
**Open reviewed version…** to read one complete saved record. Opening the disclosure,
choosing an area, polling or reload starts no history read, save, model call or worker.
Lists are replaced per page, not accumulated unboundedly.

Saved records remain available after restart, later project edits, or loss of optional
source witnesses. Opening them validates their saved format/content identity but does not
revalidate present-day source compatibility, restore an assessment or mark findings current.
The browser dates changed project inputs (including equal-revision replacement), calls the
comparison finding the **baseline at review time**, and retains original text/dates. Archived
areas' saved rows remain intact; the current browser area selector still lists active areas.

## State and portable boundaries

SQLite **16 → 17**, `saved-definition-combination-reviews-v1`, adds only
`definition_combination_reviews` and an area index/unique project-preview constraint. It
rewrites no existing row and needs no payload backup. Project revisions, assessment/job/
certificate/joint-run/result payloads, v1 semantic/freshness keys, saved plans/checkpoints,
execution schema 2, preferences and shared grants are unchanged. Upgrading starts no work,
backfill or model call; old completed checks do not repeat to acquire this representation.
Older apps reject SQLite 17 rather than silently dropping new review evidence.

Startup validates saved record/packet/origin schemas, hashes and row identities. Unknown
future formats, malformed contents, mismatched identities and oversized records reject
without overwriting them. Migration/index/ledger/schema-version advancement is transactional:
failed startup rolls back and can retry after the specific incompatible data is corrected
or the app is upgraded. Valid older data and other workers' live leases are preserved.

These records are **machine-local**, like joint checkpoints. They are not added to project
snapshots, model context, workspace artifacts or portable continuation; saving does not
dirty/publish a shared specification. Portable exports remain byte-equivalent for unchanged
project/execution/continuation state. Import cannot adopt these local acknowledgements as
assessment, approval or skip authority. There is no source FK requirement at read/startup:
losing optional original witnesses must not delete otherwise intact dated review evidence.

The ordinary current assessment stays exactly as it was, including a missing or outdated
one. Existing approved plans, code findings and paused work retain their existing revision
identities. Save does not increment a project concurrency counter or fabricate a recovery
certificate. A future current-assessment mixed-publication workflow still needs its own
explicit authority, versioned persisted assessment/portable representation and atomic
publication/freshness checks; local content acknowledgement cannot bypass those gates.

## API and bounds

Token/host/origin/body-guarded POST endpoints under `/api/projects/:id/` are:

- `definition-combination-save`: strict preview identifiers plus `previewKey` and
  `confirmReviewed: true`; supplied packet/approval fields are rejected.
- `definition-combination-history`: strict area and optional exclusive numeric cursor.
- `definition-combination-read`: strict review UUID, scoped to the selected project.

They run before generic project/history projection. Reads do not claim workers or write
state. Save also checks in-process and durable workers; it never cancels another owner.
Records are capped at **132 KiB**, previews at **128 KiB**, dates at 64 characters and
history at 10 entries per page. Existing source/context bounds remain. Limits reject,
never truncate, original evidence. Large-history/source-replay performance is unqualified.

See [preview verification](definition-combination-preview.md) and
[migration ledger](migrations.md#saved-local-combination-reviews-2026-10-30).

## Checks

Deterministic joint tests cover save acknowledgement/schema guards, complete original
provenance, idempotence, immutable dates, project/area isolation, stale keys, live workers,
record/Activity rollback and retry, bounded history, raw-data preservation across reopen,
future/tampered formats, missing witnesses, portable equivalence and no added calls or
assessment/grant/revision changes. Upgrade fixtures cover 16→17 repeated startup, original
rows and live discovery/execution leases, plus rollback/retry after failed validation.
Historical downgrade fixtures now remove the new table before reconstructing older layouts.

The browser checks explicit preview/ack/save, save-disabled-before-ack, no automatic history
read, saved-content reopening after reload/edits, dated baseline wording, mobile layout,
unchanged jobs/assessments/grants and an adapter that rejects every new model call:

```powershell
npx tsx --test src/service/definition-joint-review.test.ts src/storage/migrations.test.ts
npm run test:browser:definition-combination
```

Verification, 2026-10-30: type check, all **1,246** deterministic tests (542 pretests
and 704 main), focused joint/save/migration/Activity checks, focused combination browser,
storage-order upgrade browser, full ten-runner default browser aggregate/UI build and
diff check passed. No live model calls were made. The existing bundle-size warning and
live/performance qualification gaps remain; current-assessment mixed publication and
automatic skips are not enabled by this slice.
