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

## Safety gates and limits

- Pending/running non-help jobs, active workflow/execution workers, expired execution
  leases, unresolved saved input, and enabled unpaused workflow/maintenance block apply.
  Recovery does not stop workers, release leases, process answers, change permissions,
  grant allowance or repeat inference. Use the existing controls to resolve active work.
- **Projects with saved implementation/planning evidence remain blocked.** Adding a
  revision can invalidate revision-bound reuse. Preserving that reuse is not yet
  qualified. Do not discard plans, runs or assessments, or repeat model calls to bypass
  the protection. Configuration alone does not block restoration.
- Each explicit page considers at most 25 revisions within 32 MiB of snapshot payloads;
  candidates are limited to 2 MiB. Legacy provenance may additionally read one original
  snapshot capped at 32 MiB. Limits are byte bounds, not silent truncation.
- A too-large next snapshot or invalid/unsupported/duplicate latest candidate blocks
  recovery rather than silently choosing an older result. Original history is unchanged.
- Apply checks the expected project revision and re-reads the selected record with its
  content token inside the normal write transaction. A changed selection or project
  requires another preview. A failed transaction preserves data and supports explicit
  retry; no background startup rewrite is performed.

Source and target assessment formats are unchanged. See the
[migration ledger](migrations.md#explicit-missing-assessment-history-recovery-2026-10-29).
