# Direct provider migration

## Later saved-answer support-inventory failure (2026-11-24)

The newer exports show completed multi-request reviews, then a returned analysis
rejected because a changed target lacked all supporting sources in its request.
This is distinct from the earlier headerless SSE transport failure. Read-only local
inspection proved seven target-owned historical reviews were missing from the
mandatory/requestable inventory. The app now supplies exact original support and
retains strict acceptance/verification rather than repeatedly asking the model for
an impossible lookup. Exhausted affected work has one bounded correction included
in Review, preserving every earlier attempt; no sign-in, provider switch or automatic
replay is needed. See [the selector policy and upgrade contract](migrations.md#exact-original-target-support-sqlite-88--89-conditional-portable-60).

## One-click review usage (2026-11-24)

The user requested that clicking Review imply permission for that review's AI usage.
Eligible ordinary and streaming-recovery extensions are now included in the existing
Review/Continue review request; there is no separate Allow action. The UI retains
usage disclosure and the backend still requires exact-job/revision-bound consent.
This changes the interaction, not the finite caps, old attempts or provenance. Viewing
screens/reloading never grants work. See [current browser behavior](browser-workspace.md#review-click-includes-bounded-ai-usage-2026-11-24)
and [compatibility](migrations.md#review-action-implies-its-eligible-bounded-allowance-2026-11-24).

## Explicit retry consent after the headerless-stream fix (2026-11-24)

The exhausted eight-attempt answer remains saved rather than receiving an automatic
refund. Eligible tasks now offer **Allow 4 recovery requests**, a one-time extension
to twelve total on that unanswered step, bound to its original streaming failure and
ordinary allowance consent. Current evidence still validates, including after a
compatible no-receipt replan. New semantic failures do not become recovery authority.
The old eight attempts and failed diagnostic remain recorded; the grant and source
failure are linked in a strictly versioned recovery object. No background migration,
reload, account change or transport fix alone authorizes another request. See
[migration/portable compatibility](migrations.md#explicit-recovery-of-headerless-stream-attempts-sqlite-87--88-portable-59)
and [browser action](browser-workspace.md#recover-a-review-exhausted-by-the-streaming-defect-2026-11-24).

## Headerless direct event streams (2026-11-24)

The newer supplied log export contains five revision-4050 response-format failures
after the plan-recovery fix; a sixth run was still running at export. The broad
unfinished step reached eight spent attempts, with no accepted stage. Old generic
and plan-mismatch entries remain historical evidence, not new instances of those
blockers. Repeating processing cannot diagnose or repair the transport issue.

With separate explicit consent, one tiny 60-second-bounded diagnostic request used
the saved direct `gpt-6.1-sol` selection, without retries or project changes. Catalog
and Responses returned HTTP 200. The Responses **Content-Type header was absent**,
but private bounded inspection read a 17,465-byte SSE body containing normal response
events through `response.completed`. Only fixed structural categories/event names,
status and timings were printed; no raw body, credentials or returned prose was saved.
The earlier header-only rejection therefore has a concrete reproduced adapter cause.
It does not reconstruct the bodies of every historical failed request.

The adapter now consumes headerless responses only under strict SSE line framing
and all existing completed-event, exact-model, size, cancellation, JSON-output and
scoped no-tools/inventory checks. Explicit non-SSE Content-Type values still reject;
there is no ordinary JSON-output fallback, alternate endpoint/model or second request.
Headerless HTML, JSON, incomplete/failed streams, mismatched models/output inventories
and observable scoped tool use reject. Historical errors/attempts are never rewritten
or refunded automatically, even if their discarded responses may have completed.

Verification: type check and 59 provider/credential/scoped/mixed-adapter tests passed,
including headerless SSE discovery/help, stale-revision handling and negative stream
cases. Diff check passed. The diagnostic call preceded the fix and its body was not
retained for replay; **no second live verification call was made**. Live end-to-end
project processing remains unverified, and the broad eight-attempt step remains
exhausted. No new allowance, automatic retry or project restart was authorized by
this change. Full browser tests were not rerun for this backend-only fix.

## Direct failure diagnostics (2026-11-24)

The supplied metadata export and read-only local diagnostic fields show four failed
direct adapter attempts at revision 4049, then a pre-dispatch rejection because the
unfinished saved-response step spent its four-request allowance. All five saved job
selections match the project's current direct connection/model. This does not identify
which same-email registration is healthy or prove provider acceptance. The older
revision-3694 workspace-publication measurement is separate evidence.

The four old failures contain only the generic connection message: the previous
adapter replaced non-`ProviderError` exceptions with sign-in advice. Their original
cause cannot be recovered from those diagnostics. Context size/timing alone does not
establish an authorization, context-limit or timeout cause.

New failures now identify **saved credentials**, **model catalog**, **response request**,
**response stream**, or **output JSON**. Fixed categories distinguish invalid JSON,
unexpected data shape, and otherwise transport/local-processing failure; safe existing
HTTP status, stream-budget and completion errors are preserved. Provider bodies,
arbitrary exception messages/causes, parser inputs, credentials and identifiers are
never copied into the new diagnostics. Cancellation/deadlines retain the existing
connection-manager behavior. Progress before catalog/request work no longer claims
that a model request was already sent. This is diagnostic hardening, **not a verified
fix for the reported live failure**.

No old job, original evidence, spent attempt, project selection or allowance is rewritten.
There is no automatic retry, reauthorization, fallback or budget extension. Before
retrying paid project work, diagnose the selected connection separately; a tiny live
connection check still consumes provider allowance and needs explicit consent. Resuming
the exhausted original step requires the user's **Allow 4 more requests** action.
The metadata-only export continues to omit diagnostic prose; inspect the new failure
in the app's Logs instead. Live direct inference remains unqualified.

Verification: TypeScript check and 16 deterministic provider/credential tests passed,
including stage/redaction cases, malformed catalog/event/output JSON, HTTP failure,
transport/stream interruption, stream budget, cancellation, no retries/fallback, and
preservation of original project work and an older expired grant after failed refresh
over reopen. No live provider request or allowance extension was performed.
The subsequent combined provider, scoped/mixed-adapter and server regression run
passed 86 tests; type and diff checks also passed. The full browser suite was not
rerun for this backend diagnostic-only change.

With explicit user consent, one bounded 60-second connection probe then used the
unchanged saved direct `gpt-6.1-sol` selection. It failed in about 2.3 seconds:
model catalog HTTP 200, followed by exactly one Responses request HTTP 200 whose
content type was not `text/event-stream`. The adapter rejected it before consuming
model output. No refresh request was needed. Only stage/status/timing/stream-header
metadata was retained; the returned body and exact non-stream content type were not
captured, so this does not explain the upstream reason or establish the cause of all
four historical failures. Official models/inference documentation still requires
`store:false`, `stream:true` and terminal `response.completed`; those request flags
were already present. No JSON fallback, automatic retry, alternate endpoint/model,
project write or allowance extension was performed. Completed direct inference remains
unqualified. Further live investigation requires separate consent.

## Saved connection management (2026-11-24)

The user reported that the first saved direct ChatGPT registration failed model
listing while a second registration worked. This is a **user-reported catalog
observation**, not an independently instrumented sign-in, refresh or inference
qualification. No registration is marked obsolete, merged by email or removed based
on that report. Separate issued client IDs/grants remain distinct even for one email.

Under **Settings → Connected accounts**, each saved registration now shows its
distinct label ending plus **Used by this project** and/or **Selected in picker**
where applicable. An unmarked registration is not declared globally unused: other
projects may still reference it. **Refresh connections** reloads saved metadata
without starting inference or changing the selected account/model.

**Remove connection…** opens a confirmation for that exact registration. A fresh
unchecked acceptance and **Confirm removal** are required; **Keep connection** makes
no request, and opening another confirmation resets acceptance. The warning explains
that removal ends that registration's renewable session and removes its local direct
credentials, not other saved registrations or project history. Current-project and
picker-selected removals have explicit warnings. Existing saved project selections
are not rewritten, so removing a referenced account leaves a missing connection until
the user explicitly saves a replacement; no OpenCode/account fallback occurs.

The backend reuses the existing authenticated `connections/disconnect` contract:
cancel only this service's work for the target ID, revoke that registration's renewable
session, then remove its local credentials. Failed revocation retains credentials and
requires explicit retry; there is **no local-only-forget fallback** in this flow.
OpenCode and SDK-helper credentials remain separate and untouched. No app-owned
account label/schema change or automatic cleanup runs on upgrade.

Verification: dedicated deterministic connection-management and existing model-picker
browser checks passed, including same-email records, confirmation/cancel/reset, failure
retention, exact old-record removal, current-account warning, refresh, missing-selection
reload, mobile layout and unchanged project history. Seven provider/credential tests
and 29 server regressions passed; a new synthetic grant test preserves the other
registration byte-for-field over repeated reopen and never revokes the wrong client.
Type/UI build and diff checks passed, as did the full `npm run test:browser` command
including all posttests. Its older Disconnect-button assertion was updated to
exercise the new explicit confirmation flow before the successful full rerun.
No real removal, model call or token import was performed. Actual provider revocation
of the user's old registration remains an explicit user action, not a test result.

The later [SDK-helper authentication pilot](embedded-helper-auth.md) is a separate
explicitly consented coding-engine preparation path. It never imports this direct
store's credentials. SDK credentials use owner-protected plaintext SQLite, not this
direct provider's DPAPI protection; metadata-only native callback guard results do
not qualify either route's live sign-in/inference. Existing project selections and
direct/OpenCode dispatch remain unchanged.

The later [mixed-consistency provider bridge](definition-mixed-providers.md) now supports
explicit mixed requests on the selected direct account, with exact context preflight before
credential access and no ordinary-profile fallback. It reuses `scoped-no-tools-v1` strict
no-tools/output-inventory semantics; ordinary direct discovery/help/probe behavior and
authentication/refresh ownership are unchanged. Tests use mocked HTTP and synthetic accounts,
not live sign-in/inference. Later [browser controls](definition-mixed-browser.md) support
explicit mixed starts; later [assessment-only apply](definition-mixed-publication.md) makes no
provider request and grants no further work.

## Scoped-review transport profile (2026-10-30)

The [explicit scoped provider bridge](definition-scope-providers.md) now supports existing
selected direct accounts without OpenCode fallback. Scope and later explicit mixed requests opt into
`scoped-no-tools-v1`: explicit empty tools/none selection, rejection of observable tool
activity/unsupported output, and exact final-message versus streamed-text checks. Complete
text-only inventory is required; errors never downgrade to a weaker profile. Ordinary
direct discovery/help/probe requests and existing credentials/refresh/selection rules are
unchanged. Tests use synthetic credentials and mocked streams, not live account inference.
A later explicit browser pilot uses this bridge with status-first consent; CLI start,
publication authority, credential export and live provider qualification remain disabled.
Saved scope work is not replayed to acquire the new transport.

Status, October 15, 2026: app-owned browser connection management and direct
discovery/question help are implemented, alongside the independent CLI spike.
Deterministic checks and Windows credential protection pass. Direct live sign-in,
subscription inference, refresh, remote revocation, and cancellation/reconnection
have **not** been exercised. Existing project selections keep using OpenCode until
explicitly changed; direct selections require no OpenCode executable.

## Direction

DEC-015 approves staged migration to app-owned connections and model selection,
starting with direct ChatGPT-plan compatibility. It does not establish the app's
distribution/license or prove eligibility for OpenAI's preview.

OpenAI currently documents Sign in with ChatGPT plan usage for open-source,
locally hosted apps. Paid/remotely hosted apps have a separate interest process.
Confirm distribution requirements before adopting the direct flow for release.
No OpenCode credentials are read, imported, or reused.

## Connect in the app

### Provider and model discovery (October 23, 2026)

Settings now offers native dropdowns for the AI connection, OpenCode provider and
model, or the direct ChatGPT account's model. **Search models** filters either
model dropdown by name/ID while retaining the current selection. OpenCode choices come from connected
providers in its runtime catalog, not a hardcoded OpenAI/Copilot list. Direct
ChatGPT continues to use its separate account-specific catalog. Luna and other new
models appear when the corresponding connection exposes their exact IDs; catalog
presence does not establish access, speed, quality or task/tool compatibility.

The browser and desktop wire an owned metadata-only OpenCode catalog service. It
starts a short-lived runtime only when OpenCode choices are requested, reads
`provider.list`, and closes it without creating a session or making an inference
request. Only provider/model IDs and display names reach the browser, never provider
keys, headers, environment fields or options. No OpenCode credentials are imported
into direct connections. Settings waits for the saved selection to load before
mounting a picker, so opening a direct project's Settings does not request the
OpenCode catalog. Other providers remain OpenCode-backed: this does not add
direct Anthropic/Google authentication or inference adapters, or qualify Copilot.

OpenCode metadata is cached in memory for five minutes, shared across simultaneous
reads, refreshed every five minutes while its picker is open, and refreshable with
**Refresh models**. A failed refresh keeps the last successful list with its original
timestamp and a stale warning. A first-load failure offers retry without changing
the selection. The cache does not survive app restart. Direct ChatGPT's existing
account-change/manual refresh behavior is unchanged.

Changing the provider clears the draft model so the user chooses explicitly.
Catalog refresh never changes a saved or draft selection; unlisted saved choices
remain visible. Existing projects change route/provider/model only through **Save
model**, with the existing revision check. New/open project actions use the selected
provider rather than forcing OpenAI. See [upgrade compatibility](migrations.md#dynamic-provider-and-model-selection-2026-10-23).

Deterministic catalog/API/upgrade tests cover projection, cache/refresh/failure,
shutdown, revision checks and repeated reopen. Browser fixtures exercise Sol/Luna
selection, provider changes and saving a non-OpenAI selection without model calls.
Live inference across newly selectable providers is not qualified by these checks.

Verification on Windows/Node 22.23.3: `npm run check`, `npm test` (159 pretests +
652 tests), UI build, dedicated `npm run test:browser:models`, portable browser
checks and specification browser checks passed. The broader `npm run test:browser`
passed the connection/provider selection portion, then failed later at the existing
automatic-answer fixture's missing **Approve resolution** button; the complete
suite is not recorded as passing. A metadata-only live owned-runtime catalog check
returned eight connected providers, including `openai/gpt-6-luna`. No inference,
Copilot probe, new sign-in or billing/access verification was performed.

Run `npm run app`, open the printed address, and choose **Settings → Project AI**.
Settings is available before creating a project as well as inside a project.

1. Under **Connected accounts**, select **Add ChatGPT account**, authorize in the new
   browser tab, and return. Skip this step if the account is already saved.
   If the popup is blocked, use **Open sign-in tab**. Pending sign-in has a three-minute
   bound and a **Cancel sign-in** action. Reloading the same tab can recover its
   pending attempt; restarting the service requires a fresh attempt.
2. Select the saved account and choose a model from its account-specific catalog.
   Use **Refresh models** after account/model availability changes.
3. Optionally choose **Test connection** under **Connected accounts**: one bounded
   inference request for the dropdown selection, which may differ from the saved
   project AI, using plan allowance. **Stop test** cancels it locally. Catalog browsing
   is not inference.
4. In an existing project choose **Save model**; for a new project, the selection is
   used by **Create & explore**. Project connection references are revisioned and
   contain no tokens. Saving does not automatically start inference.
   Signing in only connects the account; it does not switch an existing project's
   saved execution route. The header shows the active route/model, Settings labels
   **Current project AI** separately from **Pending selection — not saved**, and
   **Explore next gaps** is disabled until pending changes are saved or discarded.
   **Discard changes** restores the saved fields without an API write/model call;
   a blocked save explains why inline.
5. Each saved account has its own **Reconnect** and **Remove connection…** actions
   under **Connected accounts**. **Reconnect** reauthorizes that identity. Removal
   requires explicit checkbox confirmation, revokes the saved renewable session
   before removing the connection and stops this service's active requests for it.
   Failed revocation retains the saved connection. Projects retain the missing
   selection and do not fall back. **Refresh connections** reloads saved account
   metadata without selecting another connection or sending inference.

The header identifies direct-plan use. Settings separates current AI, draft selection
and saved accounts, with a usage-management link and a first-sign-in confirmation remembered by
this browser. Credentials never enter browser storage; only the pending attempt ID,
confirmation preference, and ordinary project selection state live there.

Direct discovery and question help use the shared context and result-validation
pipeline. Direct research is not implemented: browser controls show it unavailable,
and direct adapter requests explicitly asking for research fail before inference.
Legacy OpenCode selections retain their existing research profile. Switching model
or account does not silently change provider or billing route.

Browser and terminal discovery both dispatch on the saved optional `connectionID`.
Old snapshots without it remain valid OpenCode selections. Imported references need
an explicit selection of a connection on the new device. OpenCode SDK code remains
installed for the legacy adapter; its executable is not launched for direct requests.

The app/terminal store credentials in a `providers` directory beside `projects.sqlite`.
With `npm run app -- --data-dir .reqwizit-state`, the equivalent spike argument is
`--data-dir .reqwizit-state/providers`. Default paths match the independent spike.

## Try the independent spike

Use Node 22.12+ for the current development toolchain and installed npm dependencies. These commands do not require
OpenCode. The login command prints a one-time authorization link; open it in your
system browser and return to the terminal for the validated result.

```powershell
npm run provider -- --help
npm run provider -- login
npm run provider -- accounts
# Use the account registration ID printed by login/accounts:
npm run provider -- models --account "registration-id"
# Only this command performs inference and consumes allowance:
npm run provider -- probe --account "registration-id" --model "exact-catalog-id"
npm run provider -- probe --account "registration-id" --model "exact-catalog-id" --cancel-after-ms 1000
npm run provider -- logout --account "registration-id"
```

`--timeout-ms` bounds the entire command (default 180000, maximum 300000).
Ctrl+C cancels pending login/network/stream work. Probe sends only a fixed connection
check, never project context. It requires an account-listed model and a completed
SSE response containing exactly `{"ok":true}`; malformed, incomplete, failed,
interrupted, oversized, or different-model responses fail. Cancellation closes the
local response stream; remote cessation/billing is not asserted.

Login uses a stable per-install host ID, dynamic registration, a loopback callback,
fresh state/nonce/PKCE, and issued-client token exchange. ID tokens are verified
against the fixed OpenAI JWKS with issuer/audience/expiry/nonce checks. Returning
login (`login --account ...`) must match the selected identity and issued client.
Multiple registrations are separate even if their email addresses match.

Credentials default to `%LOCALAPPDATA%\reqwizit\providers` on Windows,
or `~/.local/share/reqwizit/providers` elsewhere. Existing `requirement-wizard`
installations are reused when the new data directory does not exist.
`--data-dir .provider-state`
uses an ignored development directory; apply it consistently to each command.

Windows uses DPAPI CurrentUser encryption via Windows PowerShell, with secrets
passed only on stdin. Other platforms use owner-only directory/file permissions,
not encryption at rest. The spike writes atomically and serializes credential
reads/refresh/write across processes with a directory lock. An expired access
token is refreshed before model listing/probing; rotated tokens are saved together.
If a process crashes while holding the lock, close all direct-provider commands
before manually removing `credentials.lock` inside this credential directory.
Locks are never automatically stolen from a possibly live owner.

Logout first revokes the renewable session, then removes the spike's saved
registration. On revocation failure it retains credentials so the command can be
retried. Full account management should retain a disconnected identity/client
mapping without tokens; that lifecycle is still follow-on work. Users can manage
plan limits and disconnect the app at https://chatgpt.com/settings/usage.

## Verification recorded

- `npm run check`: passed on Node 20.11.0 / Windows.
- `npm test`: 75 tests passed, including OAuth callback integration, direct discovery,
  stale-result rejection, cancellation/retry, and authenticated connection API checks.
- `npm run test:browser`: passed with deterministic provider fixtures. Covers sign-in
  and cancellation, account/model selection, test/cancel/retry, project selection
  persistence, disconnect, existing discovery workflows, and mobile overflow.
  Pre-rename screenshots: `.wizard-state/browser-connections{,-mobile}.png`.
- `npm run provider -- --help`: passed without runtime startup or provider calls.
- Existing spike/terminal help commands and `npm run build:ui`: passed.
- `git diff --check`: passed.
- Native Windows DPAPI seal/unseal: passed using temporary test state.
- OAuth callback/state, signed OIDC validation, scope grants, identity mismatch,
  token rotation, catalog visibility/order, fragmented SSE, cancellation, late
  failure, malformed JSON, failed writes, and serialized storage: deterministic checks.
- Official OpenID discovery metadata was retrieved; this is metadata inspection,
  not a successful login or inference check.
- No live login, token refresh/revocation, or model inference was performed.

## Follow-on implementation

1. Run live sign-in, account catalog, JSON probe, cancellation/fresh-call, refresh,
   restart, and revocation checks. Record actual results without tokens or auth URLs.
2. Broaden the implemented ChatGPT connection service into a multi-provider registry
   with API-key connections and local endpoints. Add disconnected registration metadata,
   richer connection health, and connection-reference mapping for portable imports.
3. Add richer terminal connection presentation. Terminal discovery respects saved
   connections; new/model accept `--connection <account-id|opencode>`, and model-only
   changes retain the existing route. Independent provider commands remain available
   for login and catalog/probe work.
4. Further separate shared prompt builders from the legacy runtime module, and
   qualify live direct discovery/help quality and usage reporting.
5. Replace OpenCode-provided research with application-owned, capability-aware
   search/fetch tools, enforce budgets before execution, and retain retrieval evidence.
6. Qualify the complete workflow before changing the default from legacy OpenCode
   or removing its adapter/dependency. Future coding/handoff integration remains independent.

The direct HTTP preview requires `store:false`, `stream:true`, full required context
in input, and instructions/developer messages rather than explicit system items.
It currently rejects options such as `temperature` and `max_output_tokens`; tool
support is also constrained. The spike uses only supported text fields. It does
not assume OpenCode's structured-output observations transfer to this route.

## Official documentation consulted

- [Plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and refresh](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [UI guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)
- [OpenID discovery](https://auth.openai.com/.well-known/openid-configuration)
