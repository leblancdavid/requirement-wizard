# Explicit ChatGPT authentication helper pilot

Status, 2026-11-24: a **developer-only authentication profile** is implemented on
the private Node 26.4.0 / SDK 2.1.4 helper. It is separate from the offline metadata
profile. Experimental Settings controls now manage its lifecycle and observations;
it is still not wired into project model selections or coding workers.
It exposes no prompts, tools, model probes, API-key import or generic credential
read API. The user reported successful manual authorization; two subsequent signed-in
reopens preserved one OAuth connection and closed cleanly. Live inference and token
refresh remain unqualified; see the dated observations below.

## Important storage and identity distinction

Inspection of the pinned SDK's credential service/schema shows OAuth values stored
as JSON in SQLite, **not DPAPI-encrypted**. This profile therefore requires explicit
`--accept-sdk-storage` consent. A new private directory receives a protected Windows
DACL allowing the current user and LocalSystem; its owner/allow rules and bounded
descendants are checked on reopen and independently inside the helper before SDK
import. Unexpected owners/allow rules, inherited root ACLs, reparse points or a failed
check block authentication. Existing stores are verified, not silently repaired.
Permissions are changed only while creating a new, empty auth store, not on project,
legacy OpenCode or direct-provider directories.

This is **access control, not encryption**. Same-user software, backups and privileged
administrators remain part of the threat model. The existing direct-provider DPAPI
store is unchanged. No OpenCode/direct credentials are read, copied, imported into
this store or transported over IPC. The SDK owns its OAuth/refresh/persistence flow;
the bridge reads integration connection metadata, never credential values.

The pinned SDK hardcodes **OpenCode** as its ChatGPT registration name hint. Its
browser consent may therefore say OpenCode even though this is a separate app-owned
store/connection, not the desktop/shared OpenCode account. Do not relabel it as an
official Reqwizit registration or assume SDK licensing grants provider-distribution
eligibility. Distribution, native-flow eligibility and real subscription compatibility
remain release gates.

## App controls (2026-11-24)

After updating/restarting the app backend, expand **Settings → Experimental helper
diagnostics** to see **Embedded coding helper**. This section is collapsed by default
and does not mount its polling/UI until expanded; it remains separate from **Project
AI** and **Connected accounts**. Collapsing it does not cancel an active backend
operation; expanding or reloading and expanding reads that operation without replay.
The optional Windows x64 bundle must already exist (`npm run build:embedded-helper`);
the app neither builds/downloads a runtime nor falls back to the installed OpenCode
service. The normal browser development command is `npm run app`. Desktop development
uses the staged sibling helper folder; the opt-in installer recipe places it in
`resources/embedded-helper`. Ordinary installers do not include this optional bundle.
New desktop installer installation/upgrade is still unqualified.

Opening Settings reads only bundle metadata and the backend's in-memory observations;
it does **not** start a helper, open an account store or contact a provider. Accept
the plaintext-storage checkbox before either action:

- **Check saved helper connection** starts the private helper, inspects connection
  metadata and safe health counters, then closes it. It is not inference, a model
  compatibility probe, or proof that a refresh happened. The SDK can refresh its own
  credentials when opening an expired connection; permitted auth calls are counted.
- **Sign in to helper** starts the same native flow as the CLI. Click **Open helper
  sign-in** to open its checked one-time URL in a separate browser. The URL is held
  only in backend/renderer memory while pending, never in local/session storage,
  project snapshots or logs. A page reload recovers the pending view from the same
  backend without recreating OAuth. The SDK/app bounds the attempt to three minutes.
- **Stop helper** aborts the current app-owned operation and waits for owned cleanup.
  It does not remove credentials, assert rollback of a raced grant, revoke the remote
  grant or terminate another CLI/app. Closing Settings leaves the bounded operation
  running; shutting down the backend stops its owned helper.

The panel shows starting/running/stopping/stopped or **cleanup-unconfirmed**, current
operation, dated saved-connection counts/`needs_auth` advisories and last-operation
auth/socket/listener/prompt counters. A stopped process does not mean a disconnected
account. Last connection observations remain dated when a later attempt fails. Raw
SDK failures, account labels, native IDs, token values and machine paths are omitted.
Unconfirmed cleanup blocks new work in that backend; do not reset a store or steal a
lease to dismiss it. A locked CLI store fails without takeover or automatic retry.

Both browser and desktop backends use the app data directory's existing
`embedded-auth-live-qualification` store and `embedded-auth-live-control` workspace,
matching the manual qualification commands. Existing authorized state is reused **in
place**, not copied or migrated. If using `--data-dir`, these paths are beneath that
directory, so an isolated development app will intentionally not see the default
account. The earlier CLI example below uses different explicitly chosen pilot paths;
no automatic search/import/adoption of such stores is performed.

Later root-recovery exception: creating this helper folder had masked a populated
legacy app database. The default app-root resolver now preserves that legacy project
store; if it has no own helper marker, the already authorized known current-root
qualification/control locations are retained in place, without copying tokens or
asking for login again. Explicit custom roots and legacy-owned helper stores keep
their own locations. See [compatibility rules](migrations.md#desktop-root-and-workspace-history-recovery-2026-11-24).

The backend owns a single operation across all tabs. Consent/operation/URL/observations
are session-only, with explicit consent required on each action; neither viewing
Settings nor restarting the backend restores an operation or repeats sign-in. No
provider/model selection, coding RPC, local-removal button or full credential reader
is added. `app-helper.ts` owns orchestration outside React; the loopback API retains
token, Host/Origin, strict body and input-size checks. See [compatibility ledger](migrations.md#app-helper-settings-controls-2026-11-24).

Verification for this slice: type check/UI build and desktop TypeScript compilation,
**55 helper/API tests**, **56
server/runtime/desktop regressions**, and the dedicated deterministic browser check
passed (consent, no auto-start, check/close, pending-login reload/stop, completion,
cleanup failure, redaction and mobile width). A native empty-store HTTP API smoke
also passed with zero provider/socket/listener/prompt counts and clean shutdown;
existing user stores were untouched. No new live sign-in or inference was performed.

Browser-suite follow-up: the full `test:browser` main command chain passed. The
posttest chain passed the helper checks, then the automatic feature-organization
reload intermittently received HTTP 404 / UI asset unavailable and timed out waiting
for the Specification tab. Its isolated rerun and the **entire** `posttest:browser`
rerun then passed without a product-code change. The asset-read failure's cause is
unconfirmed, so the original combined command is not recorded as a clean pass. An
earlier full attempt also mixed an old UI build with an updated helper-label assertion;
the latest dedicated helper run and consistent-build rerun passed that assertion.
Type/diff checks pass; Vite still warns about the large existing UI bundle. No
installer or live granted OAuth through the panel is qualified by these fixture checks.

Later Settings-simplification verification (2026-11-24): the full `npm run
test:browser` command **including all posttests passed** with the current/pending
selection separation and collapsed diagnostics. This includes the earlier failing
automatic-organization reload case, but does not establish the cause or permanent
resolution of the prior intermittent asset-read failure. Focused helper coverage
also verifies the disclosure starts closed and recovers pending sign-in after
reload/expansion without another authorization flow. No real credentials or live
provider/model calls were used for these UI checks.

## Developer commands

Build the independently pinned bundle first. Choose a private persistent auth store
and a separate existing **control workspace**, both outside any coding worktree.
The auth store and control workspace must not contain one another. The control
workspace is only the SDK location, not a source scan or coding target.

```powershell
npm run build:embedded-helper
npm run auth:embedded-helper -- --help
$auth = "$env:LOCALAPPDATA\reqwizit\embedded-auth-pilot"
$control = "$env:LOCALAPPDATA\reqwizit\embedded-auth-control"
New-Item -ItemType Directory -Force $control
npm run auth:embedded-helper -- status --bundle dist/embedded-helper --data-dir $auth --workspace $control --accept-sdk-storage
# Manual user action: begins native OAuth and prints a one-time browser URL.
npm run auth:embedded-helper -- login --bundle dist/embedded-helper --data-dir $auth --workspace $control --accept-sdk-storage
```

Opening the URL and authorizing is an explicit user action, not part of automated
verification. Do not paste the URL into diagnostics: it contains ephemeral state,
nonce and PKCE data. The CLI does not open a browser automatically, collect a code
or print tokens/raw SDK instructions/errors. Pending login has a three-minute app
bound; Ctrl+C stops the owned helper without repeating sign-in. OAuth cancellation
can race a committed credential: `cancel-requested` does **not** mean rollback or
remote revocation. Inspect again after uncertainty rather than automatically retrying.

`status` returns whether the exact native method is available and opaque, store-bound
OAuth connection handles with the SDK's `needs_auth` advisory projected to a boolean.
It does not prove an active account, successful refresh, model access or available
allowance. Opening this explicitly authorized profile can let the SDK refresh its
own expired credentials; no inference endpoint is permitted.

Local-only connection removal is deliberately not called provider disconnection:

```powershell
npm run auth:embedded-helper -- forget-local --bundle dist/embedded-helper --data-dir $auth --workspace $control --accept-sdk-storage --connection "handle-from-status" --confirm-local-only
```

It checks that the handle names an inspected OAuth connection in this helper's
OpenAI integration, then calls the SDK's local credential-removal API. It never reads
the token, never removes an unrelated/legacy credential, and reports remote revocation
as **not asserted**. Manage remote grants in the provider's account settings. This
path was tested synthetically; real remote/local revocation behavior is not qualified.

## Capability and network boundaries

- `auth-client.ts` chooses the auth entry only from bundle format 2 and requires
  storage consent before touching a store. Older format-1 bundles cannot be used
  as an auth fallback. Metadata clients still accept format 1 or 2, select only
  `worker.js`, and retain IPC 1, store 1 and their original offline/no-auth methods.
- `auth-protocol.ts` defines IPC 2: initialize, health, inspect, begin/status/cancel,
  confirmed local removal and close. Schemas reject extra fields and all prompt,
  session, shell, model-catalog export, key/import/config and code-completion RPCs.
  Existing 16-KiB/four-pending/10,000-request transport limits and owned cleanup apply.
- `auth-controller.ts` uses only native `openai/chatgpt-token-sharing` auto browser
  OAuth. Unavailable methods, forms, code modes or malformed URLs fail without
  switching provider, method, billing route or format. Only one attempt is pending.
  Attempts are process-local: restarting does not recreate one or redeem a saved URL.
- `auth-worker.ts` disables unrelated provider plugins and denies provider use except
  OpenAI. Native integration registration needs the initial read-only model registry
  load and **bundled** catalog; downloads, warming and project/Claude config are off.
  These metadata operations are not inference or account-access qualification.
- `auth-network.ts` permits only HTTPS token exchange/refresh and JWKS retrieval at
  the fixed `auth.openai.com` paths, with redirects forbidden. Other hosts, API model/
  inference paths and query-bearing URLs are rejected. Socket connections are
  restricted to that auth host/443. A single ephemeral `127.0.0.1` callback listener
  is armed only for explicit native begin; it is not a loopback RPC server.
- Authorization URLs must match the pinned issuer/path, exact live callback port,
  expected resource/scope, S256 PKCE and state/nonce fields, with no duplicates,
  credentials, fragments or unrecognized fields. SDK callbacks validate OAuth
  state/identity; the bridge does not exchange codes or implement a parallel flow.

Fetch/socket/listener guards are defense in depth, **not an OS sandbox**. Refresh,
JWKS behavior and provider-side policy still need instrumented live observation;
strict guards must not be widened or downgraded after failure. No signed-in profile
has been inferred ready for coding from available catalog entries.

The shared `transport.ts` owns only process/IPC mechanics. Each client/worker keeps a
closed protocol. SDK metadata, connection labels, provider failure messages and token
values are not forwarded. Authorization URLs are the explicit ephemeral exception
needed for user sign-in, not diagnostic/report data. No project state/export receives
these handles, URLs, grants or credentials.

## Compatibility

Bundle 1 → 2 adds a separately named auth entry/protocol. New metadata clients read
both bundle versions without changing old state, native database, session namespaces
or historical evidence. Older clients reject bundle 2 rather than opening the wrong
capability profile. Previous bundles remain archived by the builder.

Existing helper state 1 remains metadata-only, byte-preserved and reusable. New auth
stores use state 2 with `chatgpt-auth-v1` and `sdk-owner-only-plaintext-v1`; a state-1
store is **never automatically converted** or given network/credential capabilities.
Auth/metadata cannot open one another's store. Both retain canonical location/UUID,
exclusive owner-token leases and future-format rejection without reset.

Attempt/connection handles use distinct kinds under
`reqwizit-embedded-auth:v1:<store-uuid>:<attempt|connection>:<native-id>`. Legacy,
other-store, other-kind and future handles reject. No main application schema,
optimistic revision, saved selection/job, freshness identity or portable format changes.
Future auth/coding upgrades must preserve original SDK credentials, stable IDs and
valid work through forward migration, not require login/model calls just to change
an equivalent representation. See [migration ledger](migrations.md#embedded-helper-auth-capability-and-credential-boundary-2026-11-24).

## Checks and remaining qualification

### Manual authorization and signed-in persistence (2026-11-24)

The user ran the explicit-consent login command against a separate persistent
qualification store and reported **Authorization successful**. The agent did not
capture the authorization URL, callback, token values, browser identity or login
command output. Accordingly, token-exchange counts, login CLI exit/cleanup and the
browser's exact behavior are not independently asserted from that report.

Afterward, a bounded metadata-only check required the existing store marker (no
new-store/login fallback), opened the auth helper, inspected it, closed it and
repeated the cycle. Both cycles passed:

- One OAuth connection in the exact OpenAI integration, native method available,
  `needsAuth: false` (an SDK advisory, not a provider-access probe).
- Store UUID and opaque connection handle unchanged across both reopens; neither
  identity was printed or committed. The existing store passed Windows protection
  verification in both the parent and private helper.
- Health reported **zero provider requests, socket connections, callback listeners
  and prompts** for each reopen. Both helper closes completed without error; the
  second open also confirmed the first owner's lease had been released.
- No credential values were read by the bridge/check, and no login, model probe,
  credential removal or provider fallback was requested. The connection was retained.

This establishes signed-in connection persistence and clean repeated reopening for
this account/runtime observation, not refresh or subscription/model access. In
particular, zero provider requests means **refresh was not exercised**. Do not edit
credential expiry/values, copy the database into fixtures or repeat authorization to
manufacture a refresh result. A later naturally expired-token check must retain
existing IDs/grants, observe only safe metadata/counters and distinguish refresh
from other permitted auth requests. Interrupted rotation, real local removal/remote
revocation and arbitrary granted-browser keepalive behavior remain unverified.

### Prior automated guard and packaging checks

Verified on 2026-11-24 with the rebuilt format-2 bundle:

- `npm run check` and `npm run build:embedded-helper` passed. The staging npm
  invocation on Node 22 warns about the Node >=26.4.0 dependency; the helper uses
  the pinned private Node 26.4.0, not the staging caller's runtime.
- `npm run test:embedded-helper`: **43 passed**, including native Windows DACL
  creation/reopen and rejection of an unprotected existing root.
- Native guard runner and relocated metadata/auth owner-Worker checks passed under
  Node **22.23.4** and Electron **44.8.0** (owner Node **24.22.0**). All auth checks
  reported zero authorized accounts/provider requests/prompts; metadata reported
  zero network/listener attempts. These are private-Node helper results, not
  same-process SDK engine qualification for Node 22/24.
- Runtime execution/client and desktop backend-host regression tests: **27 passed**.
  `git diff --check` passed (only Git's Windows line-ending notices).

Automated checks use synthetic accounts/SDK responses or disposable **empty** SDK
stores. They do not read existing credentials or authorize a provider account:

```powershell
npm run test:embedded-helper
npm run qualify:embedded-auth-guards -- --bundle dist/embedded-helper
npm run test:embedded-helper:auth-package
```

The native guard runner begins/cancels one native attempt, begins another without
opening its URL, sends a deliberately invalid-state callback, observes HTTP 400 and
failed native status, closes/reopens the same protected store and confirms no account
was created. It reports zero provider requests/socket connections and prompts.
Authorization URLs are never printed or persisted by this runner. The packaged mode
runs from a relocated bundle in an owner Worker; it can also be invoked under
Electron with the existing `ELECTRON_RUN_AS_NODE` recipe and `--auth-guards`.

The synthetic HTTP client explicitly drains its 400 response and requests connection
close. An earlier keepalive/response-cancellation variant hit the shutdown deadline;
this is **not** qualification of arbitrary real-browser keepalive or granted-login
cleanup. Bounded forced cleanup has deterministic tests; refresh, provider revocation,
interrupted credential rotation, live OAuth through the new app controls, coding permissions and command
subprocess recovery remain unverified. The later manual authorization/persistence
observation above does not retroactively make the automated guard run a granted-login
check. No installer, model request, account inference probe or Copilot probe ran.

Windows native DACL creation/reopen checks pass. A first implementation using
PowerShell Security cmdlets failed module autoload under the harness environment;
the implementation uses .NET access-control APIs and emits only fixed failure phases.
Initial integration registration attempts also correctly failed closed on unrelated
native provider discovery; disabling those plugins, not broadening network access,
allowed the no-provider-request native guard check to pass.
