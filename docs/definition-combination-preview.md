# Exact combined finding review preview

Status, 2026-10-30: **implemented explicit read-only browser/engine preview**. A separate
[local reviewed-content save](definition-combination-reviews.md) is now available after
acknowledgement. Neither preview nor local save is current-assessment publication.
No assessment, score, confidence, original date, requirement, approval, plan or request
allowance changes. Joint results retain `canPublish: false`; automatic skips remain off.

## Browser behavior

In **Overall progress → Inspect original finding sources**, load a saved completed
**model-supported** joint check. **Preview combined original findings** then explicitly
re-verifies that exact check and its original source witnesses without AI. Mounting,
opening/selecting, loading ordinary joint status, workspace polling and reload do not
load or repeat this content preview. Closing/reloading clears the transient contents.

The preview shows all nine original findings alongside current saved finding content:

- Each original dimension, importance, raw status, complete explanation and evidence-ID
  sequence is preserved, including multiline text. Nothing is summarized or truncated.
- Original publication/input revisions, dates, source jobs and finding identities remain
  attached to their individual originals, not relabelled with the preview/joint date.
- `same-finding` compares exact saved finding fields, not proof of the same provenance
  or today's coverage score. `different-finding` shows the exact current content beside
  the original. `not-recorded` leaves a missing current finding missing.
- The separate joint response observation/completion dates remain distinct from original
  finding dates. No new overall confidence, score or combined assessment is invented.

Raw source statuses do not establish resolved gaps, human approval, completeness or
readiness; existing coverage still applies its own evidence/freshness rules. Model support
is local judgement, not formal consistency or narrower dependency independence. There is
no current-assessment Publish control. The separate Save reviewed combination action only
retains machine-local reviewed evidence. A preview key is content identity, not a signature or permission
token; future writes must re-verify all facts themselves under explicit save authority.

Ordinary changes and equal-numbered replacement date old contents and disable another
preview of the old check. Concurrent changes reject the read without automatic retry or
a replacement check. Dated contents remain labelled as such rather than rewritten into
a current assessment. Missing older provenance never forces another model request.

## Exact-job verification

`ProjectStore.previewDefinitionCombination(projectID, query)` runs one consistent SQLite
read transaction, before any generic history projection. It requires:

1. A schema-exact current project, matching revision/full snapshot token and active area.
2. The explicitly requested local joint row/job, scoped to this project/area. There is
   no newest-compatible substitute or archive search.
3. A completed response/result with matching candidate/context keys and original sources.
   Publication certificates, original snapshots and request/response coverage are
   independently replayed through the existing bounded origin readers. All nine original
   whole-area guards must still match.
4. A freshly re-derived `model-supported` result exactly matching the saved result.
   Conflicted, reassess, blocked, incomplete, altered or unsupported results cannot
   produce a successful preview.
5. An original reserved response owner, including the original failed/cancelled/interrupted
   source behind a zero-request recovery. Root/result row identities, exact response and
   observation date must match. The root cannot be replaced by a new date or a reuse chain.
6. Matching table/payload job identities, project, model, expected revision and the entire
   original app-owned context manifest. The preview job must be completed; a root's live
   lease cannot be stolen or silently treated as terminal. Missing original witnesses
   suppress the preview, not the saved review itself.

Current duplicate assessment/dimension identities are rejected rather than choosing the
first. Existing admission guards may reject such ambiguity even before a joint request.
Missing current assessments are not restored by a successful read-only preview.

The packet binds the exact current assessment identity, original/current finding fields,
original source identities, joint/root jobs, response/result context and dated evidence
with a format-1 `definition-combination-preview-v1` content key. It remains
`authority: inspection-only`, `partition: whole-area`, `canPublish: false`.

The authenticated `POST /api/projects/:id/definition-combination-preview` accepts only
`{ revision, epicID, snapshotKey, jobID }`. It retains token/host/origin/body guards and
rejects other methods, extra consent/publication fields and foreign source selection.
An arbitrary model-supplied packet cannot self-issue original provenance or save authority.

## Bounds and compatibility

Current/original snapshot reads retain the **16 MiB** source bound and existing manifest,
record/reference, certificate and checkpoint limits. Exact job context metadata is capped
at **2 MiB**, model metadata at **4 KiB**, and the final exact preview at **128 KiB**.
Oversized contents return unavailable; they are never shortened into a successful preview.
Large-project preparation/replay performance remains unqualified.

This preview slice kept SQLite at **16**; the later local-review table advances it to
**17** without changing the preview contract. Execution stays schema 2; persisted project, assessment,
certificate, joint-run/result, job and portable formats/semantic keys remain unchanged.
The preview itself needs no migration/backfill, browser preference, original-date rebasing
or new inference. A separate local review can retain the exact packet. It is not included in portable continuation or a
saved mixed assessment; older valid work is preserved unchanged across repeated reopen.
See [compatibility ledger](migrations.md#exact-combined-finding-preview-2026-10-30).

Future mixed publication still needs an explicit save decision, a versioned persisted
per-finding origin representation, forward SQLite/portable compatibility and atomic
stale/publication checks. A preview token or model-supported verdict cannot bypass those
gates. Sound narrower partitions, automatic reuse and broad live/savings qualification
remain separate unfinished work.

## Checks

Deterministic joint tests cover exact/current comparisons, original dates and complete
text, caller mutation, conflicts/reassess/blocked/incomplete jobs, forged job/root/context/
result identities, missing source witnesses, same-number replacement, missing/ambiguous
current findings, size limits and byte-preserved saved work across repeated reopen.
API checks cover auth/origin/method/field rejection and no extra calls. The browser uses
an already-saved supported joint fixture and an adapter that rejects any new model call;
it exercises explicit loading, original/current prose, literal markup, concurrent changes,
dated results, reload, keyboard/mobile layout and unchanged jobs/assessments/grants.

```powershell
npx tsx --test src/service/definition-joint-review.test.ts
npm run test:browser:definition-combination
```

Verification, 2026-10-30: type check, all **1,239** deterministic tests (535 pretests
and 704 main), focused joint/preview tests, focused combination browser, full ten-runner
default browser aggregate/UI build and diff check passed. No live model calls were made.
The existing bundle-size warning remains; this does not qualify semantic review quality,
large-project performance, narrower independence or actual mixed publication.
