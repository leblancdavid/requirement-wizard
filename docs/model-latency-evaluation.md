# Comparing faster models without losing saved work

First reduce repeated requests; a faster model still wastes usage if each answer
causes another broad read/check cycle. The 2026-11-13 user export measured about
89% of elapsed time inside adapter requests, so model latency is a relevant next
experiment, but no candidate is qualified by deterministic fixtures.

## Bounded comparison

1. Inspect the connected account's current model catalogue. Listing metadata is
   not inference and does not establish that the account accepts a model at request
   time. Do not guess names or silently substitute another provider/model.
2. Select one explicitly named candidate and a fixed maximum request count and
   per-request timeout before starting. Live calls consume the provider allowance.
3. Use a disposable local project with a curated, credential-free decision set,
   including answered questions, conflicting rules and independent open choices.
   Keep the production project and managed folder untouched. Do not switch models
   on an in-flight paid task as a speed experiment; retain its original selection,
   drafts, receipts and spent attempts.
4. Run the same fresh discovery and saved-answer tasks with each selected model.
   Report elapsed time, adapter time, actual requests, context sizes, malformed or
   rejected replies, repairs and the number of **verified independent** questions.
   One fast response or a successful JSON probe is not an end-to-end qualification.
5. Review the resulting questions and specification changes against original human
   input. A candidate must not gain apparent speed by skipping evidence, inventing
   preferences, weakening conflict checks, filling a question quota or suppressing
   genuine blockers. Keep failures visible; do not retry/fallback indefinitely.
6. Repeat a small fixed number of trials before recommending a default. Make any
   production selection explicit in Settings. Switching models starts no work by
   itself; dated evidence and old task/model provenance stay saved.

No live comparison, model recommendation, automatic routing change or production
model switch was performed by the frozen-verification/segmented-publication work.
Use the actual connected account's candidates rather than assuming that a model
available to the coding assistant is available to Reqwizit.
