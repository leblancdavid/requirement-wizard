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

## Initial bounded screen (2026-11-13)

The app-owned OpenCode 2.1.4 provider catalogue listed `openai/gpt-6.1-sol-fast`
alongside the current `openai/gpt-6.1-sol`. One **four-call total** screen used
curated disposable projects and a 90-second per-call timeout, with no production
project access, model switch, retry or fallback. Adapter durations (including owned
runtime startup/catalogue/session work, not pure model-generation time):

| Task | sol | sol-fast | Qualification |
| --- | ---: | ---: | --- |
| First discovery request | 8.19 s | 5.41 s | Both stopped when the one-call task budget blocked another stage; neither completed discovery |
| Isolated submission request | 12.53 s | 6.50 s | Both returned accepted JSON, but the initial fixture had not applied the saved human response before dispatch |

The answer-fixture omission prevents these responses from qualifying faithful answer
integration. The discovery budget stop is **not a model failure**. These single small
trials suggest a latency opportunity but establish neither independent-question
quality nor large-project speed/compatibility. No additional live requests were made
to repair the experiment. Original local results remain under the ignored
`.reqwizit-state/model-comparisons/latency-6Gbjwb/report.json`.

`scripts/compare-model-latency.ts` now applies/asserts the saved human input first,
retains curated response bodies for review and labels its own budget stops. It
requires an explicit model pair and request cap. Four requests is one-call screening;
six permits up to two discovery stages plus one answer request per model. A future
six-request run needs a **new explicit budget**, not an automatic retry of this screen:

```powershell
npx tsx scripts/compare-model-latency.ts --live openai/gpt-6.1-sol openai/gpt-6.1-sol-fast --max-requests 6
```

This corrected six-request runner has not been live-qualified. It does not establish
that all discovery/check stages fit that budget; unfinished work remains incomplete.
The no-inference `--check-fixtures` path passed for both selections/tasks, including
the applied-source and answered-question assertions, and the script passed strict
TypeScript checking. Fixture mode uses a deterministic adapter, not account access.
