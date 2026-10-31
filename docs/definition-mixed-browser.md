# Explicit mixed-review browser workflow

Status, 2026-10-31: **browser source selection, preview, consent, execution/status and
saved-evidence inspection implemented**. A later [separate review/publication slice](definition-mixed-publication.md)
adds local content review and confirmed assessment apply; automatic finding-level reuse remains
disabled. This connects the [durable task](definition-mixed-execution.md)
and [provider bridge](definition-mixed-providers.md), not a new discovery or coding grant.
No live model calls were used to implement or test these controls.

## Explicit source selection and consent

Open **Settings → Advanced assessment tools → Check mixed original findings (pilot)**. Opening, selecting,
loading sources and inspecting evidence never start AI work. Choose an area and explicitly
**Load mixed finding sources**. A bounded page contains at most six ordinary publication
certificates and four completed scoped provenance packets. Older-page buttons replace the
displayed page, not accumulate an archive; already chosen exact identities remain selected.
Unproved sources cannot be selected. A verified original source is not necessarily compatible
with today's inputs: only preparing the complete selection checks that conservative boundary.

Choose one exact original source per dimension, including at least one scoped source. There
is no automatic newest-source selection or ordinary-source substitution. **Check saved mixed
task** reads the exact canonical selection and prepares a read-only nine-finding preview.
It shows unchanged text/status/evidence, separate original publication versus scoped response/
recovery dates, all original scoped concerns (including unassigned dimensions), target revision
and complete captured-context size. All project evidence is retained; selecting outputs does
not narrow evidence or establish independence. Stale/missing/unreproducible sources reject.

Fresh unchecked one-request consent is bound to the exact selections, revision and complete
snapshot key. Source/area/input changes, another status/preview check and each start clear its
effective authorization. **Start mixed review** uses only the stored selected connection/model,
with no tools/research, normally a two-minute deadline and one reserved app attempt. A failed
spent attempt without a valid saved reply requires fresh consent before another request.
Catalogs, transport metadata or model output do not authorize more requests or automatic work.

## Status, reload and exact ownership

The browser explicitly starts `definition-mixed-start` and polls lightweight
`definition-mixed-status` only after a start acknowledgement or an explicit saved-task load.
Status does not reconstruct original project history, claim/recover a worker or make calls.
Closing controls stops polling, not the worker. Reload starts no review or status inspection;
**Load latest mixed review** explicitly finds the area's saved task. A status view is dated
metadata, not an authenticated current source/compatibility certificate.

**Stop mixed review** requires the exact project/job/kind owned by this app queue. A different
app instance, wrong job or ordinary/scoped worker is not stopped. Uncooperative adapters settle
as cancelled; late replies cannot change saved evidence. Expired workers display interrupted;
an explicit start uses the existing lease-safe recovery path rather than stealing live work.
Active implementation, workflow/discovery, unfinished input and other admission blockers remain.
No coordinator, ordinary Continue or automatic maintenance route invokes mixed review.

## Uncertain responses never trigger write replay

A lost/rejected start response holds the exact attempted selection in memory and disables new
consent/start. **Check saved mixed task** inspects that exact attempt, even if project inputs
changed. If inspection itself fails, the hold remains. A successful not-recorded read is not
replayed as a start; it merely permits new explicit consent after compatibility preview succeeds.
If the server committed, the saved task/result is displayed without another start. After a
reload, explicitly load saved status before choosing/consenting again. The store independently
prevents duplicate completed requests, rejects active workers and retains spent attempts.

No status/preview/evidence request writes recovery or publication receipts. Only a new explicitly
confirmed start may recover a valid saved reply into a zero-call task or allocate a new attempt.
Completed exact requests return their existing task; saved-reply recovery retains original
request identity/date and does not manufacture new provider observations.

## Saved judgments are evidence, not publication

Completed views show all exact-origin retain/reassess/blocked verdicts, cited IDs and conflicts,
plus created/original response/recovery-completion dates and reserved/reused-attempt distinctions.
**Inspect original mixed evidence** separately replays the bounded original/root witnesses and
shows unchanged findings and complete original scoped concerns. It does not rebase evidence to
today's project or confer publication authority. Product edits leave dated evidence visible with
a stale-input warning; unsupported/malformed newest evidence is unavailable, not silently replaced.
Model text is rendered as plain escaped text. Structural support is not human semantic sign-off,
completeness, readiness, product approval, effective permission enforcement or savings evidence.

The workflow preserves assessments/confidence, requirements/choices, history, implementation
assessment/plan/build evidence, grants and otherwise valid implementation reuse. Queue admission
can pause automatic input processing as in the existing mixed task. There is no assessment
save/apply endpoint in this earlier slice; the later publication slice adds separate endpoints
and fresh confirmation without changing this task's evidence-only authority.

## Compatibility and verification

Verified on 2026-10-31: `npm run check`; full `npm test` (**1,400 passing**:
696 pretests + 704 main); `npm run test:browser` (UI build and all **16 runners**);
final dedicated `npm run test:browser:mixed` rerun after preview-identity/saved-selection
hardening; and `git diff --check`. The existing non-blocking UI chunk-size warning remains.

No persisted migration: source/target SQLite **22**, execution **2**, usage export **2** and
portable envelopes **1/2/3** remain unchanged. New catalog/status/preview projections are transient;
frozen request/assembly/context policies/keys and saved checkpoint formats are unchanged. Older
completed pilot/provider tasks and replies need no reset, provenance backfill or repeat model call.
Raw task/checkpoint/native sessions remain local-only. See [migration ledger](migrations.md#mixed-review-browser-workflow-2026-10-31).

```powershell
npm run check
npx tsx --test src/service/definition-mixed-review.test.ts src/service/definition-mixed-adapter.test.ts
npm run test:browser:mixed
```

The dedicated deterministic browser runner covers nine-source selection, all-ordinary rejection,
preview/concerns, fresh consent, completed reuse, reload/running Stop, explicit retry, pre-admission
failure, unavailable inspection, lost committed acknowledgement without replay, conflicts,
saved-reply recovery after completion failure, original dates, escaped text, stale inputs,
keyboard/mobile and unchanged assessments/implementation. Backend checks also cover token/origin/
method/strict-consent gates, source paging, cross-instance/wrong-job Stop, late replies, dated reopen
and damaged/missing newest checkpoint rejection. These fixtures do not qualify live mixed
provider/account support, human semantics, effective tool enforcement or larger-project performance.
