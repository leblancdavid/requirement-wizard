# Retrieval pilot: independent relevance review packet

**Status: pending-independent-review. No independent sign-off exists.**

Author: implementation assistant. Reviewer: **unassigned**. Review date: **not recorded**.
These examples were not part of the earlier field-service/museum sets. They are synthetic,
credential-free annotations proposed by the implementation author, not independent evidence.
Fixtures: `src/core/fixtures/retrieval-pilot-review.ts`. Each uses two result slots.

## Review procedure

An independent human/domain reviewer should judge relevance to the intended need, not
whether the current algorithm returns the proposed IDs. For each case, mark relevant,
irrelevant or uncertain evidence, explain disagreements and identify missing evidence.
Do not equate a lexical match, test pass or absence of a returned handle with correctness.
The query alone may be ambiguous: assess and document that ambiguity rather than silently
changing the query or promoting the annotations to confirmed product preferences.

| Case | Intended need and query | Saved evidence | Proposed relevance judgement (unreviewed) |
| --- | --- | --- | --- |
| Accessibility | Find the admission condition for a companion. Query: `companion admission` | `ticket-accessible`: “A ticket holder can arrange accessible seating.” Acceptance: “Companion admission is recorded before seat allocation.” | Relevant to the intended condition; initial prefix search misses acceptance-only wording. |
| Refund negation | Distinguish the actual restriction from a test simulation. Query: `automatic refund` | `ticket-no-refund`: “Do NOT grant an automatic refund without the organizer's approval.” `ticket-refund-test`: “An automatic refund is enabled only in a test simulation, not a product preference.” | Both observations need inspection; neither establishes a new human decision. |
| Saturated release | Find escrow release approvals, not software marketing. Query: `release` | `ticket-custody` rationale: “Release requires both custodians to approve the transfer.” Primary-text matches: `ticket-release-notes` software deployment notes and `ticket-release-banner` marketing text. | Custody rule is desired for the stated need; the query alone is ambiguous. Candidate intentionally returns two primary distractors and cannot add the auxiliary match at fixed capacity. |
| Paraphrase | Find the identity check for dishonestly transferred tickets. Query: `resale fraud` | `ticket-identity`: “Compare the entrant with the named purchaser to detect a dishonestly transferred pass.” | Potentially relevant paraphrase; literal search intentionally misses it. Reviewer should check whether the wording actually addresses the intended fraud scenario. |

## Required sign-off record (leave blank until a real review happens)

- Reviewer identity/role and independence from implementation:
- Date and reviewed fixture revision:
- Per-case relevant / irrelevant / uncertain IDs and rationale:
- Additional missing or adversarial cases:
- Proposed annotation/query changes (retain original history):
- Recommendation and limitations:

Do not fill this record with an assistant self-review, simulated reviewer or deterministic
test outcome. Review may reject the labels or conclude that the queries need human scope.
Until signed, these cases remain review-ready regressions, **not independently qualified**.

## Partial reviewer responses (2026-10-20)

This append-only record preserves the original proposed annotations above. The reviewer
is the user in this conversation; identity, domain role and independence from implementation
have not been established. The review is assistant-guided, not an unaided blind review.
General agreement with the explanation/procedure was not counted as a relevance judgment
or rollout approval. The sign-off record remains incomplete.

- **Accessibility / `ticket-accessible`:** Asked whether the exact acceptance sentence
  “Companion admission is recorded before seat allocation.” would help answer when someone
  can bring a companion into a venue, the user answered **“help”**. Recorded as **relevant
  (helpful)** for that presented sentence and need. The broader packet originally frames
  the need as finding the admission condition, with query `companion admission`; the
  conversational prompt used simpler wording. No rationale or missing-context answer was
  supplied. This does not establish that the evidence is sufficient or approve the policy.
- **Refund / `ticket-no-refund`:** Asked whether “Do NOT grant an automatic refund
  without the organizer's approval.” would help answer whether refunds can happen
  automatically, the user answered **“help”**. Recorded as **relevant (helpful)** for
  that sentence and presented need. The prompt omitted the fixture's `policy/refunds.md:`
  prefix and simplified the packet's need to distinguish the actual restriction from a
  test simulation; query `automatic refund` is unchanged. No rationale or missing-context
  answer was supplied. This is not approval of the refund policy or a judgment about the
  separate test-simulation source.
- **Refund / `ticket-refund-test`:** Asked whether “tests/refunds.md: An automatic
  refund is enabled only in a test simulation, not a product preference.” would help
  when checking what really controls automatic refunds, the user answered **“help”**.
  Recorded as **relevant (helpful)** for that source and presented need. No rationale
  or missing-context answer was supplied. This does not approve automatic refunds or
  treat a test simulation as a product decision.
- **Escrow release / `ticket-custody`:** Shown all three exact requirement fields
  (“An operator reviews an escrow transfer.” / “Release requires both custodians to
  approve the transfer.” / “Record both approvals.”), the user answered **“help”**.
  Recorded as **relevant (helpful)** for that requirement and presented approval need.
  The assistant's simplified prompt described money held until a ticket transfer is
  approved and explained custodians as people responsible for that money. Those details
  are explanatory assumptions, not facts established by the fixture; this framing is a
  review limitation, not additional saved evidence. No rationale or missing-context answer
  was supplied. The response does not approve the policy or assess the other release sources.
- **Escrow release / `ticket-release-notes`:** Asked whether “ops/notes.md: Release
  notes describe the latest box-office software deployment.” would help answer whose
  approval is needed for an escrow release, the user answered **“unrelated”**. Recorded
  as **irrelevant** to that presented need. No additional rationale was supplied.
- **Escrow release / `ticket-release-banner`:** Asked whether “web/banner.md: Release
  banner text is approved by the marketing editor.” would help answer whose approval
  is needed for an escrow release, the user answered **“unrelated”**. Recorded as
  **irrelevant** to that presented need. No additional rationale was supplied.
- **Paraphrase / `ticket-identity`:** Asked whether “admission/verification.md: Compare
  the entrant with the named purchaser to detect a dishonestly transferred pass.” would
  help find how staff check for tickets dishonestly transferred to someone else, the user
  answered **“help”**. Recorded as **relevant (helpful)** for that source and presented
  need. The packet query remains `resale fraud`; the guided question restated the intended
  need rather than asking the user to assess the query itself. No rationale or missing-context
  answer was supplied. This does not establish that the identity check is sufficient.

Fixture reviewed: the current uncommitted `src/core/fixtures/retrieval-pilot-review.ts`,
specifically the acceptance sentence, both refund sentences, custody requirement,
both other release sources and identity-check source quoted above. No fixture labels, queries or
algorithm expectations were changed. These human responses are separate from deterministic
test results; no new tests or live model checks establish relevance here. Partial feedback
does not support broader rollout or complete the independent-review gate. The pilot remains
default-off. This documentation-only record changes no persisted application formats,
fingerprints, budgets or search semantics and requires no data migration.

## Assessment after the seven guided classifications

All seven presented evidence items across the four cases now have an actual user
classification: five helpful/relevant and two unrelated/irrelevant. There were no uncertain
responses. This is not a claim that uncertainty or missing context is absent: the user has
not supplied explanations, missing-context findings, additional cases, reviewer role or
independence confirmation. The original author annotations and fixture expectations remain
unchanged. No general conversational assent has been treated as sign-off.

Comparison with the **existing deterministic fixture expectations**, not a new test run:

| Case | User judgments | Existing expected candidate behavior | Limited interpretation |
| --- | --- | --- | --- |
| Accessibility | Presented acceptance sentence helps | Offers `ticket-accessible` | Useful evidence in this example is discoverable. |
| Refund | Both sources help | Offers both refund sources | Both useful observations remain available for inspection. |
| Escrow release | Custody requirement helps; software and marketing sources are unrelated | Offers the two unrelated sources, not custody | Fixed-capacity primary saturation retains a relevance failure. |
| Paraphrase | Identity-check source helps | Offers no records | Useful differently worded evidence remains missed. |

These responses support retaining the cases as useful diagnostic examples; they do not
establish general retrieval quality, unaided query quality, exhaustive coverage or live
model behavior. They do not satisfy the earlier request for independently authored cases:
the examples still originate with the implementation author. The assisted presentation and
its recorded framing limitations also preclude describing this as an unaided blind review.

**Recommendation:** keep the pilot default-off and do not recommend broader rollout on
this evidence. Preserve the known saturation and paraphrase limitations. Obtain any
missing-context feedback and reviewer role/independence information before deciding whether
the independent-review gate can be completed; do not infer these from the classifications.
No ranking, paging, budgets, application code or saved application data changed. No new
live calls, test-suite runs or browser qualification were performed in this review step.

### Follow-up on context and reviewer involvement

Asked whether anything was confusing or missing and whether they had helped design/build
the search feature or were reviewing as a user, the user replied: **“not sure. I would
say helped?”** Recorded as uncertainty about missing/confusing context and tentative
self-reported involvement. The nature and extent of that involvement are unspecified;
do not claim the reviewer is independent. This follow-up does not change the seven
classifications or establish that no context is missing. Earlier statements that these
answers had not been supplied are retained as the history before this follow-up.

The guided user-feedback exercise is now recorded, but independent review/sign-off remains
pending. No further clarification is required to retain this feedback with its limitations.
The recommendation remains to keep the pilot default-off, with no broader rollout on this
evidence. Any future independent review should be by someone not involved in designing or
building the feature, with their own missing-context assessment and preferably independently
authored cases. This is a future review need, not authorization for additional implementation,
model calls or rollout.
