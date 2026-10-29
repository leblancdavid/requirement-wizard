# Recover missing definition assessments

In **Overall progress → Recover missing saved assessments**, select an active area
without an assessment and choose **Preview saved assessment**. Opening the view does
not read history. Preview reads local saved revisions only; it does not call a model.
If a bounded window contains no result, **Search earlier history** explicitly reads
the next window. There is no automatic archive scan.

The preview shows the saved and original assessment revisions, confidence, check count,
original evidence-basis availability, and current/outdated status. **Restore saved
assessment** is a separate action. It adds a normal revision and Activity receipt,
without adding a product-decision source, approving requirements or starting coding.
Existing assessments, including outdated ones, are never replaced. Only the original
active area ID is eligible; findings are not transferred to new split/merged areas.

Original findings and assessment revision are retained. Existing evidence keys remain
unchanged. A legacy evidence key can be derived only from an available matching original
snapshot, never from today's inputs. Missing provenance stays unkeyed and outdated.
Matching inputs permit reuse, not a claim that the findings have no gaps.

## Preserve implementation reuse (2026-10-29)

Recovery is now available in idle projects with saved implementation/planning evidence.
It preserves work that was valid immediately before recovery without changing original
plan/run revisions, approvals, code findings, dates, sessions, delivery evidence or spent
request attempts. Already outdated work stays outdated. Restoring an assessment does
not prepare/approve a plan, repeat a model call, resume a worker or verify new delivery.

An app-owned, versioned `execution.recoveryRevision` certificate records a contiguous
interval of recovery-only writes and the exact unchanged project inputs. Only the
definition-assessment array, revision, restoration receipt prose and local discovery
model/account routing are excluded from its digest. The restoration operation separately
checks that it did not change model routing. Workspace, implementation settings/model,
requirement, evidence, code-footprint and manual-reassessment gates still apply.

This is not general semantic equivalence. Any ordinary project revision ends the
interval, even if it appears to be bookkeeping. Another restoration starts a new interval
and cannot bridge earlier edits. The certificate only supports plan reuse, the saved-run
revision gate, and the legacy code-assessment revision fallback. It does not weaken any
request's expected-current-revision check or certify older losses retroactively.

Upgrades convert execution payloads **v1 → v2** under SQLite migration **8 → 9**, backing
up source payloads transactionally and preserving existing semantic identities. Upgrade
alone issues no certificate and runs no model. Older portable execution v1 checkpoints
remain accepted and upgrade without inference; new v2 checkpoints retain certificates.
Local coding sessions remain machine-local, and portable runs retain their existing
explicit adoption/continuation restrictions. See the
[upgrade ledger](migrations.md#implementation-reuse-across-assessment-recovery-2026-10-29).

## Safety gates and limits

- Pending/running non-help jobs, active workflow/execution workers, expired execution
  leases, unresolved saved input, and enabled unpaused workflow/maintenance block apply.
  Recovery does not stop workers, release leases, process answers, change permissions,
  grant allowance or repeat inference. Use the existing controls to resolve active work.
- Saved plans, runs, code findings and delivery evidence no longer block recovery merely
  by existing. Their original evidence is retained; outdated work is not refreshed.
  Do not discard work or repeat model calls just to restore a missing definition result.
  Live/expired execution leases and other active-work gates above still block apply.
- Each explicit page considers at most 25 revisions within 32 MiB of snapshot payloads;
  candidates are limited to 2 MiB. Legacy provenance may additionally read one original
  snapshot capped at 32 MiB. Limits are byte bounds, not silent truncation.
- A too-large next snapshot or invalid/unsupported/duplicate latest candidate blocks
  recovery rather than silently choosing an older result. Original history is unchanged.
- Apply checks the expected project revision and re-reads the selected record with its
  content token inside the normal write transaction. A changed selection or project
  requires another preview. A failed transaction preserves data and supports explicit
  retry; no background startup rewrite is performed.

Source and target definition-assessment formats are unchanged. See the historical
[migration ledger](migrations.md#explicit-missing-assessment-history-recovery-2026-10-29).
