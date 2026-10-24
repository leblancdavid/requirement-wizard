# User-facing language

The 2026-10-24 [workspace consolidation](workspace-navigation.md) supersedes scattered
**Technical details** disclosures: outcomes stay inline and **View logs** opens the
single optional viewer. Existing historical/generated wording is not rewritten.

Reqwizit guides product owners, including people with no software or AI background.
Plain language is the default throughout the app, not only in interview questions
(RW-003). Technical users can inspect details without changing that default.

## Writing rules

- Start with what is happening, why it matters and what the person can do next.
- Use short, respectful sentences and concrete examples; do not talk down to users.
- Prefer **feature** to epic, **project folder** to directory, **review/check** to
  assessment where practical, and **AI request** to inference/model call.
- Explain necessary terms: a requirement describes what the product should do;
  acceptance scenarios are examples of expected behavior; main is the main project
  version in Git; a pull request proposes code changes for review and merging.
- Never conceal consequential behavior: sending files to an AI, plan usage,
  automatic commits, approvals, retry limits and explicit permission to build.
- Keep suggested/decided, saved/reviewed, not checked/missing, paused/blocked and
  local code/delivered changes distinct. A progress score is an estimate.
- Avoid leading with revisions, fingerprints, leases, evidence batches, character
  budgets or protocol names. Keep these in expandable **Technical details**,
  histories, logs or diagnostic exports.
- Do not claim input is saved, a retry is safe, or a review is complete based on
  error text. Use known application state. Do not invent a fix for a technical
  limitation; say when technical help may be needed.

## Implemented presentation pass

The browser now uses simpler guidance for coordinated work, automatic checks,
progress, saved-response recovery, connections, folders/sharing and building.
Discovery progress and error notices separate the high-level outcome from original
technical details. Typed definition interruption causes still distinguish time
limits, Stop, shutdown and unknown causes. Unknown errors receive conservative
guidance, not a guessed cause. Existing redaction remains the responsibility of
the diagnostic producer; the presentation component does not add a log/export.

Specification/build search uses “features.” Terminal interview prompts and desktop
interruption messages are simplified without renaming scripting commands or JSON
fields. Advanced build configuration and technical histories retain necessary Git
and command terminology.

Shared discovery/scan/help/definition prompts request plain-language human-readable
content while preserving schema literals, source quotations, user constraints,
numbers, identifiers, evidence rules and decision authority. This is instruction
coverage, not proof of live model wording quality. Existing generated prose is not
rewritten or regenerated. External/provider messages and historical findings remain
available in details; not every arbitrary diagnostic has a specific translated fix.

## Review and verification

Review normal, empty, waiting, stopped, failed, outdated and interrupted states.
Check main explanations without opening details, then confirm details remain
available through native keyboard-accessible disclosures. Check phone widths and
screen-reader announcements. Opening details must not start work or consume AI usage.

`src/ui/user-messages.test.ts` covers safe fallback messages, distinct outcomes,
collapsed/escaped diagnostics and prompt policy without modifying saved input.
Recovery and existing workflow tests retain the distinction between a saved decision
and an unfinished review. Browser checks use a deterministic adapter, not live AI.

See [migration compatibility](migrations.md#plain-language-presentation-2026-10-23).

Verified on 2026-10-23 with Node 22.23.3: type check, UI build, 149 pretests and
650 main tests passed (799 total), plus the latest six language tests after the
additional stale-edit explanation. Focused workflow, maintenance, epic-review,
portable and specification browser runners passed, including mobile flows. The
main browser runner verifies keyboard opening of collapsed connection diagnostics
and reaches the previously documented missing **Approve resolution** control
(`src/web/browser-check.ts:1358`); the aggregate browser suite is not passing.
Terminal help and diff checks passed. No live AI calls or personal project data
were used. Native desktop dialog presentation and live generated language were
not exercised. The UI build still reports its existing large-bundle warning.

The default shell’s Node 20 cannot load the installed Node-22 SQLite module.
Checks used the existing Node 22 installation without reinstalling dependencies.
