# Processing permissions

**Settings → Project settings → Processing permissions** offers three choices for
this project on this computer. Choose a radio and explicitly **Save processing mode**.
Opening Settings or selecting a radio starts nothing. Stop active work before switching.

| Mode | New responses | Automatic definition follow-up |
| --- | --- | --- |
| Keep existing permissions | Retains the previous browser preference and coordinator settings. | Retains the previous separate opt-in or coordinator behavior. |
| Manual processing | Saves without automatic AI follow-up. Explicit processing includes only responses already saved at its start. | Held. Explicit tasks remain available; a coordinated run pauses at its next decision/pause and needs continuation afterward. |
| Guided processing | Marks new responses eligible for coordinated follow-up, even if this browser's separate saved-input preference is off. | Uses only the coordinator's remaining shared allowance; separate automatic workers stay held. |

## Guided processing

Saving this mode does **not** start work, arm a scheduler or renew allowance.
Choose **Continue specification** to authorize at most eight AI requests, five active
minutes and twenty coordinator steps. It sequences the existing saved-input,
consistency, affected-definition, clarification and gap-discovery checks. It can pause
earlier if there is not enough allowance for the next task. Completed checks and
attempts are retained; no new completion or approval rule is introduced.

While waiting for a product decision, a newly saved eligible response can continue
the **remaining** allowance in the same app session. It does not grant another burst.
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
