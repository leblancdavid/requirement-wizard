# Processing permissions

## Project-focused controls (2026-11-11)

Normal specification work uses **Continue** in the header, with active-work **Pause**
and **Cancel current work**. Continue retains the existing Play operation and safe
technical recovery; it does not silently renew an exhausted allowance. Necessary
extra-usage consent appears in Design with optional Details. Conflicts are resolved
in Specification, not the processing queue.

The processing modes and independent worker settings described below are now
retained under **Logs → Technical processing controls and retained preferences**,
not normal Settings. Relocation changes no preference, saved grant, machine-local
scope, pause or restart rule. See [the project-focused workspace](project-focused-workspace.md).

## Primary controls (2026-11-08)

Use **Play / Pause / Stop** for normal specification work. No processing-mode
change, per-rule checkbox or separate shared-recovery allowance is required before
Play. It adopts compatible shared checkpoints while preserving original answers,
paid evidence and usage. Technical accounting and the old controls remain under
collapsed **Processing details and advanced actions**. Product decisions and approvals
are still yours; coding, scans and research remain separate. See
[implemented scope and remaining legacy recovery limits](coordinated-workflow.md#simple-processing-2026-11-08).

The retained settings below support advanced/legacy task workflows. Merely viewing
them or installing an upgrade never starts work or changes existing preferences.

**Settings → Project settings → Processing permissions** offers three choices for
this project on this computer. Choose a radio and explicitly **Save processing mode**.
Opening Settings or selecting a radio starts nothing. Stop active work before switching.

| Mode | New responses | Automatic definition follow-up |
| --- | --- | --- |
| Keep existing permissions | Retains the previous browser preference and coordinator settings. | Retains the previous separate opt-in or coordinator behavior. |
| Manual processing | Saves without automatic AI follow-up. Explicit processing includes only responses already saved at its start. | Held. Explicit tasks remain available; a coordinated run pauses at its next decision/pause and needs continuation afterward. |
| Guided processing | Marks new responses eligible for coordinated follow-up, even if this browser's separate saved-input preference is off. | Uses only the coordinator's remaining shared allowance; separate automatic workers stay held. |

## Guided processing

New continuous runs use **save-first answer collection**: save the answers you want
to include, then choose **Submit saved responses**. Saving while waiting for a decision
does not start AI processing. A partial batch is allowed; unanswered choices remain.
Only responses saved at submission are authorized; later responses wait for another
explicit submission. Compatible new unscoped answers in one feature can share a bounded
evidence schedule (two to five answers); scoped or already-started tasks stay separate.
Existing older grants keep their prior behavior until explicit
continuous continuation. See [save-first collection](coordinated-workflow.md#save-first-answer-collection-2026-11-06).

New continuous runs also collect questions across existing eligible workflow packages
instead of stopping at the first new question: soft target five, at most five package
passes/sixteen request attempts/five active minutes per collection. Smaller batches and
useful final-package overshoot are allowed; existing waiting batches are not enlarged
automatically. Package evidence, dependency waits and retry limits are unchanged.
Pause/restart retains collection counters and completed package work; continuation is
explicit. This bounds question collection, not the entire continuous workflow. See
[question collection](coordinated-workflow.md#bounded-question-collection-2026-11-06).

Policy 2, adopted by the next explicit continuous continuation, treats those bounds
as cooperative work windows: successful work yields and continues under the same
continuous permission, without another Continue click. The time checkpoint does not
cancel an in-flight successful request. Actual request timeouts, technical/semantic
failures, changed inputs and Pause still stop; spent task attempts are never reset.
Earlier bounded grants and review-only checkpoints do not gain continuous permission.

With checkpoint scheduling activated by explicit continuation, new answers are
processed as a collection batch. Definition assessments wait for settled related
question discovery and resolved decisions, or **Review changes**. An answer alone
does not launch a round of area assessments. Review changes is a bounded review-only
action; input arriving during review waits for a later explicit checkpoint. This
does not change existing input-processing allowance or certify old findings current.
See [checkpoint scheduling](coordinated-workflow.md#question-batches-and-fixed-review-checkpoints-2026-11-05).

Saving this mode does **not** start work, arm a scheduler or renew allowance.
Choose **Continue specification** to authorize continuous specification work until a
decision, blocker, completion or Pause boundary. It sequences the existing saved-input,
consistency, affected-definition, clarification and gap-discovery checks. Individual
requests still time out and failed attempts remain finite. Completed checks and
attempts are retained; no new completion or approval rule is introduced. Older bounded
API grants retain their eight-request/five-minute limits until explicit continuation.

In an older grant without save-first collection, a newly saved eligible response can
continue the **remaining** allowance in the same app session. It does not grant another burst.
Earlier saved-only flags are never rewritten: those responses need explicit processing
or **Continue specification**. Stop, exhausted limits, failure and restarting do not
renew or automatically resume the coordinator. Continue explicitly afterward.

Separate automatic saved-response and definition-maintenance workers cannot spend
outside this grant, even from another app process. Their previous preferences, queued
tasks and spent attempts remain saved. To use separate automatic settings, choose
another processing mode first; Guided cannot be bypassed by disabling only the
coordinator or resuming its old maintenance setting.

Explicit scoped tasks still have their own established scopes, authorized follow-up
and limits. Guided never starts research, folder scans, implementation checks/plans,
coding, commands or delivery. Questions and proposals still require the existing
human/faithful-input authority; an AI finding is not a product preference.

## Switching modes and upgrades

Every actual mode switch leaves the saved-input queue, coordinator and maintenance
paused. It retains original enabled flags, grants, spent allowance, input flags,
checkpoints, findings, approvals and histories. It advances the policy and settings
concurrency counters atomically, checks the project revision and refuses active work
or live/expired implementation leases. Stale settings reject without overwriting newer
choices. Resume the intended task explicitly; switching away and back is not a way
to renew allowance.

The browser-wide `reqwizit-auto` preference and other projects are unchanged. Explicit
**Continue specification** remains its own opt-in to coordination; merely choosing
Guided does not rewrite the retained coordinator enabled flag. The UI projects Guided
as coordinated so that the intended continuation is available before that first run.
These permissions are machine-local and are not transferred by portable project files.

SQLite **11 → 12** adds a compatibility boundary for the Guided value in the existing
format-1 policy. No saved rows or workflow/assessment identities are converted. Upgrade
retains absent/legacy/manual policy exactly and never selects Guided on someone's
behalf. Unsupported source/future consent is rejected without overwrite. See the
[migration ledger](migrations.md#guided-processing-consent-2026-10-29).

## Verification scope

Deterministic storage/service/API tests exercise preserved permissions, independent
worker rejection, stale and cross-process writes, explicit continuation, shared
allowance, saved-only responses, Stop/restart, finite scoped processing and compatible
upgrade/rollback. `npm run test:browser:processing` runs both Manual and Guided browser
checks without live calls; the Guided mobile screenshot is
`.reqwizit-state/browser-guided-processing-mobile.png`.

This is a unified bounded **specification** mode, not unrestricted background work.
Finding-level incremental rechecks, cross-operation reports, explicit reused-check
provenance and live coding/delivery qualification remain separate work.
