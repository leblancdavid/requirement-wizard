# Workspace responsibilities and logs

The user approved consolidating overlapping views and moving low-level diagnostics
to one optional Logs destination (DEC-033). This is a browser presentation change,
not a change to specification authority, consent, assessment identity or processing.

## Implemented responsibilities

| Area | Responsibility |
| --- | --- |
| Design | Questions, answer editing, new ideas and constraints. |
| Specification | Feature-grouped requirements, decisions, evidence, and feature organization. |
| Implement | Build authorization/configuration, assessment findings, delivery and manual implementation records. |
| Overall progress | Definition explanations/evidence, missing-decision review results, scores and explicit refresh. |
| Activity | Saved changes and outcomes, before/after evidence and links to current items. |
| Processing & queue | Running/waiting/paused/blocked work, Stop and explicit continuation/recovery. |
| Logs (application menu) | Technical diagnostics, current processing messages and discovery diagnostic exports. |
| Settings | Connections, project folder/rescan and automation configuration. |

Project map is no longer a separate tab or requirement editor. Existing internal
map/recovery navigation routes to Specification. **Organize features** retains
add/edit/move operations without another acceptance-scenario/review viewer.
Manual implementation records now live in Implement. Repeated definition,
latest-changes and context-diagnostics sidebar cards are removed. Pending
organization reviews and original-input context remain in Specification.

The queue no longer displays completed-response lists, replaced-response history,
recent background history, full assessment reports or diagnostic export controls.
Saved attempts remain in item recovery and specification history; none are deleted.
Its blocked-response index links to current-item recovery instead of reproducing
the full attention inbox. Workflow decisions keep their existing destinations.

## Logs

`src/ui/log-records.ts` derives read-only projections from currently loaded saved
jobs, response diagnostics and implementation state. The viewer is `src/ui/logs.tsx`;
links and bounded browser-session state are in `log-access.tsx`.

- One modal is available through the application menu, including without a project.
- **View logs** opens that viewer at a saved task or selected diagnostic;
  **Show all logs** removes that filter.
- Filters cover app/current-project scope, source, search and problem states.
- Current messages update through existing snapshot polling. This does not start
  inference, replay tasks or grant an allowance.
- API failures, including connection/startup requests without a project, are held
  in browser memory (latest 250 identities). Selected diagnostics are added when
  opened. They are not persisted or included in portable state.
- Saved jobs keep their existing persistence and availability bounds. This is not
  a complete backend stdout/provider/process transcript. Missing historical times
  remain **Time not recorded**.
- Per-entry previews stop at 64,000 characters with an explicit notice. Original
  evidence is unchanged. Rows are paginated.
- Common bearer/token/password patterns are redacted on display, and React escapes
  log text. Producers still own sanitization. Project text, paths and command
  output can remain sensitive: review before sharing.
- The existing metadata-only discovery export lives in Logs, with its authenticated
  API, bounded selection and privacy contract unchanged.
  Its disclosure appears above the log filters and entries so exporting does not
  require scrolling through the logs. This ordering-only change does not affect
  saved formats, evidence, assessment freshness or migration requirements.

Consequential information stays inline: saved/unfinished states, recovery guidance,
unverified scope, AI usage and build authorization. Requirements, acceptance
scenarios and supporting decisions are evidence, not debug logs.

## Compatibility and verification

See the [migration ledger](migrations.md#workspace-consolidation-and-logs-2026-10-24).
No saved data is rewritten and no assessment/model calls are required to upgrade.

`npm run test:browser:workspace` covers the consolidated specification, queue, saved
diagnostic reopening, redaction/escaping, keyboard/modal recovery, app errors without
a project, live-message separation/Stop routing and mobile layout without live inference. Screenshots use
`.reqwizit-state/browser-workspace-logs-mobile.png`. Log unit tests cover old jobs,
unknown timestamps, bounds, repeated projection and immutable original evidence.

Legacy browser runners containing Project map or queue-history assertions still
need migration to these responsibilities; those selectors are not kept as hidden
duplicate UI. Aggregate browser qualification must not be inferred from the focused
layout runner.

Verification on 2026-10-24 (Node 22.23.4): type check, UI build, full `npm test`
(169 pretests + 652 main tests, 821 passing), and a final 58-test targeted UI run
passed. Focused workspace-layout, model-selection, specification, coordinated-workflow
and maintenance browser checks passed. The final `npm run test:browser` passed its
new workspace-layout and model-selection runners, then stopped at the obsolete
Project map selector in `src/web/browser-check.ts:706`; the aggregate is not passing.
No live provider calls were made. The existing large-bundle build warning remains;
native desktop presentation was not exercised.
