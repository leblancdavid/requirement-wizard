# Opt-in embedded helper transport and packaging pilot

Status, 2026-11-24: **implemented developer-only, offline metadata pilot**. A private
Node 26.4.0 process hosts OpenCode SDK 2.1.4 and communicates over Node process IPC,
not a loopback HTTP listener. Normal browser/terminal/desktop discovery and coding
still use their saved routes; the helper is not selectable in Settings or used by
`OpenCodeExecution`. This metadata profile enables no authentication or live coding.
The later [explicit ChatGPT authentication profile](embedded-helper-auth.md) is a
separate developer-only capability with storage consent and protected private roots;
it does not widen the metadata protocol or change application selections.

This follows the [compatibility investigation](embedded-opencode.md). It avoids an
installed OpenCode executable and a machine-wide runtime upgrade, but retains an
owned process. **Reduced latency/memory/cost is not established.** The measured
uncompressed staged folder contains 448,138,513 summed file bytes (about 427.4 MiB),
including the private runtime, full SDK dependency graph and collected notices.
This is not installer size or filesystem allocation. The graph still brings TUI
dependencies; a lean release needs separate asset/dependency/performance review.

## Try it safely

From the repository root on Windows x64, using the existing Node 22 baseline:

```powershell
npm run test:embedded-helper
npm run build:embedded-helper
npm run pilot:embedded-helper -- --bundle dist/embedded-helper
npm run test:embedded-helper:package
```

The last command rebuilds independently, copies the bundle to a fresh approved
temporary directory with a space in its path, and runs the compiled client inside
a Node Worker against the relocated bundle. It requires no source-repository
runtime imports and no OpenCode installation. Each pilot creates a disposable
workspace/store, checks health, creates/reads a deny-all empty session, closes the
helper, reopens the same identity/database/session, rejects a legacy session ID,
removes the synthetic session and closes again. It prints the retained artifact
path; it does not delete application data or repeat model calls.

The same relocated-bundle/owner-Worker check can run under Electron's existing
runtime without rebuilding or launching the desktop application:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
try {
  & .\node_modules\electron\dist\electron.exe .\scripts\check-embedded-helper-package.mjs --bundle .\dist\embedded-helper | Out-Host
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}
# Inspect $result; 0 means the offline check passed.
```

The helper itself always runs the staged Node 26.4.0 binary, even when its owner is
Node 22 or Electron's Node 24. No experimental V8 flags or installed-package edits
are required. CLI help does not build/launch a helper or create data:

```powershell
npm run pilot:embedded-helper -- --help
```

## Boundaries

- `src/runtime/embedded/client.ts` starts only an explicitly supplied, supported
  bundle and private data directory. There is no executable discovery, global
  environment opt-in, provider fallback or inference retry. The later `transport.ts`
  extraction shares process mechanics only; `bundle.ts` reads old/new manifests.
- `protocol.ts` defines IPC version 1: initialize, health, empty-session create/get/
  remove and close. Strict schemas reject unknown fields/methods, including prompt,
  tools, credentials, provider catalogs and config operations. Envelopes are at most
  16 KiB, with at most four pending requests and 10,000 request IDs per process.
  Replies must match the request ID, operation and store identity; errors are fixed
  classifications, not raw SDK exceptions. Stdout/stderr is not forwarded.
- `environment.ts` drops inherited provider keys, OpenCode config, proxy credentials
  and `NODE_OPTIONS`, redirecting home/XDG/app-data/temp roots **before SDK import**.
  The worker disables project/Claude config, warming, model downloads, watchers and
  FFF, supplies deny-all permissions and never requests a model catalog or prompt.
  Fetch/TCP/listener guards reject observed network activity on every successful
  operation except shutdown. These guards are not an OS sandbox or proof against
  arbitrary native-module/subprocess access.
- `worker.ts` projects only namespaced session handles and observed deny-all status,
  not SDK configuration, credentials, workspace contents, messages or tool output.
  Session location and exact deny-all permissions are checked before accepting
  create/get/remove results. This is not effective adversarial tool qualification.
- Startup/request deadlines default to 60/10 seconds, shutdown to three seconds.
  Cancellation, timeout, malformed replies and IPC failure stop only the owned
  helper tree; unfinished metadata operations are never replayed. Close is
  idempotent. A failed graceful close is reported as failure, even if forced cleanup
  succeeds. The exclusive lease is released only after confirmed process exit;
  inability to confirm cleanup retains the lock instead of admitting another owner.

There is deliberately **no prompt/tool RPC behind a feature flag**. The later auth
entry has its own closed protocol, not access to metadata sessions. Adding coding
requires a separately reviewed protocol/profile with explicit model/account choice,
role-specific skills, output validation, tool permission and subprocess cancellation
qualification. Approval of this pilot is not authorization for live inference.

## Storage and recovery

The explicit helper directory must be empty or already contain supported helper
state. Passing an existing application directory without the helper marker is
rejected, not adopted. Store format 1 (`helper-state.json`) binds an immutable
UUID to a canonical workspace, SDK version and `metadata-only-v1` profile. Bundle,
IPC and store versions are separate from each other and from app revisions.

Native session IDs are wrapped as
`reqwizit-embedded:v1:<store-uuid>:<native-id>`. Raw/legacy IDs, another store,
another workspace or a future handle format reject locally and in the worker.
No IDs in the application database are rewritten. These machine-local handles,
SDK database and environment roots are not added to portable exports.

The marker is created through an exclusive temporary file and rename. A failed or
interrupted initialization retains evidence rather than replacing an incomplete
marker or assigning a new identity. Unsupported future/damaged state is rejected
without overwriting it. Same-format reopen preserves marker bytes and SDK sessions.
There is no upgrade from legacy OpenCode stores or token import in this slice.

`.helper-lease/owner.json` holds an exclusive local owner token and PID. It has no
expiry and is never automatically stolen. A parent/owner crash can leave a lease:
close the owning application and verify its helper is stopped before explicitly
recovering that **specific** lease directory. Retain the marker/database and any
initialization temporary files for investigation; do not reset data or infer that a
PID alone proves a particular Worker is still alive. Automatic crash-lease recovery,
force-unlock UI and live in-flight model/session recovery remain unqualified.

See the [forward-compatibility ledger](migrations.md#embedded-helper-local-state-and-ipc-pilot-2026-11-24).

## Packaging

`scripts/embedded-helper/package.json` and its lock are an independent staging
graph, like the existing desktop staging graph, not a repository workspace/monorepo
package. They pin SDK 2.1.4, `node-win-x64` 26.4.0 and Zod 3.24.2. Root and desktop
dependencies/lockfiles do not gain the SDK or private runtime.

`build:embedded-helper` type-checks first and uses `npm ci --ignore-scripts` in a
fresh sibling candidate directory, preserving native prebuilt/WASM/package assets.
The Node 22 **installer** may warn about a dependency's Node >=26.4.0 engine; no SDK
install scripts run under it. The installed graph is separately audited against the
private Node 26.4.0 runtime, whose exact executable version is checked before
publication. Strict installer policies are not disabled: an installation failure
leaves the old bundle untouched.

Outputs include `helper-bundle.json` (originally format 1; later format 2 adds a
separate auth entry while preserving the metadata entry and old-bundle reader),
`ENGINE_AUDIT.json`, the lock, compiled entry/client modules, native/runtime assets,
`THIRD_PARTY_NOTICES.json`, collected package-root license/notice files and the
verified upstream OpenCode MIT notice. Inventory/notice collection is **not completed
legal review**, a vulnerability scan or qualification of every native coding tool.
The lock audit rejects local links; no dependency on the repository source is
included. Refresh the independent lock deliberately from its own directory, not by
installing the repository package into it via `--prefix`.

The builder publishes only after installation, audit, compilation, notice collection
and runtime checks. Existing recognized bundles are retained under unique
`.previous-...` names; failed `.staging-...` candidates remain for diagnosis. A failed
final rename attempts restoration of the previous bundle. Unknown output formats
or unfamiliar nonempty directories are not overwritten. `--out-dir <fresh-path>`
supports independent stages. No running helper or user app is stopped by a build.

An explicit installer recipe is provided, **not verified or enabled by default**:

```powershell
npm run package:desktop:embedded-pilot
```

`electron-builder.embedded-pilot.yml` extends ordinary desktop packaging and copies
the helper outside ASAR into `resources/embedded-helper`; its artifact name says
`embedded-pilot`. Existing `package:desktop` does not include it. Even the pilot
installer does not select/use it in the UI. NSIS installation/upgrade/uninstall,
signing, final notices and packaged-app launch remain release gates. The installer
command was not run; it also rebuilds the desktop stage, which can be locked by a
running development app. No installed app/shared OpenCode service was modified.

## Verification actually run

- `npm run check`: passed.
- `npm run test:embedded-helper`: 27 tests passed (13 transport/store tests and 14
  prior probe/audit tests). Failure cases include malformed protocol, future state,
  wrong store/workspace, concurrent/stale leases, timeouts, cancellation, forced
  shutdown, missing executable and unexpected exit. Synthetic IPC fixtures are not live AI tests.
- Existing runtime execution/client and desktop backend-host regressions: 27 passed.
- `npm run build:embedded-helper`: passed, including repeated publication preserving
  the previous bundle. An initial accidental repository-link staging graph was
  rejected by the audit; the corrected independent lock has no local links.
- `pilot:embedded-helper`: real SDK lifecycle over IPC passed from Node 22.23.4 and
  Electron 44.8.0 / Node 24.22.0, using private Node 26.4.0.
- `test:embedded-helper:package` and the Electron command above: passed with relocated
  bundles and an actual owner Worker. Both reported zero prompts and zero observed
  network/listener attempts, including reopen of the original private session.
- The staged graph audit passed for 387 installed packages / 275 engine declarations;
  48 absent optional-platform packages were omitted. Lock SHA-256:
  `0965fffc5c337a1617cd9dfb1290d7ac0187ef72e8fec2ee9e9e7b522331fc51`.

Full application/browser/installer suites, native coding tools, live sign-in/coding,
adversarial tool permissions, command subprocess recovery and comparative overhead
were not qualified by these checks. No project-data migration/model call was made.
