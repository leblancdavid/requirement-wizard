# Direct provider migration

The later [mixed-consistency provider bridge](definition-mixed-providers.md) now supports
explicit mixed requests on the selected direct account, with exact context preflight before
credential access and no ordinary-profile fallback. It reuses `scoped-no-tools-v1` strict
no-tools/output-inventory semantics; ordinary direct discovery/help/probe behavior and
authentication/refresh ownership are unchanged. Tests use mocked HTTP and synthetic accounts,
not live sign-in/inference. Later [browser controls](definition-mixed-browser.md) support
explicit mixed starts; assessment apply remains unwired.

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

Run `npm run app`, open the printed address, and choose **Settings → AI connections**.
Settings is available before creating a project as well as inside a project.

1. Select **Continue with ChatGPT**, authorize in the new browser tab, and return.
   If the popup is blocked, use **Open sign-in tab**. Pending sign-in has a three-minute
   bound and a **Cancel sign-in** action. Reloading the same tab can recover its
   pending attempt; restarting the service requires a fresh attempt.
2. Select the saved account and choose a model from its account-specific catalog.
   Use **Refresh models** after account/model availability changes.
3. Optionally choose **Test connection**: one bounded inference request that uses
   plan allowance. **Stop test** cancels it locally. Catalog browsing is not inference.
4. In an existing project choose **Save model**; for a new project, the selection is
   used by **Create & explore**. Project connection references are revisioned and
   contain no tokens. Saving does not automatically start inference.
   Signing in only connects the account; it does not switch an existing project's
   saved execution route. The header shows the active route/model, Settings labels
   unsaved selections, and **Explore next gaps** is disabled until pending changes
   are saved. The save action sits beside the connection controls.
5. **Reconnect** reauthorizes the selected identity. **Disconnect** revokes the saved
   renewable session before removing the connection and stops this service's active
   requests for it. Projects retain the missing selection and do not fall back.

The header identifies direct-plan use. Settings shows the active selected account,
plan usage, a usage-management link, and a first-sign-in confirmation remembered by
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
