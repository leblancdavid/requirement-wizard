# Embedded coding engine compatibility spike

Status, 2026-11-24: user-approved direction; initial offline spike, followed by the
[opt-in helper IPC/packaging pilot](embedded-helper-pilot.md), not an active coding
backend. Keep direct providers as the direction for requirements work and
reuse OpenCode's engine for coding without forking its application. Existing saved
routes and the owned HTTP runtime remain unchanged.

Follow-up: a private **Node 26.4.0 helper** passes both the declared dependency-engine
audit and the offline lifecycle check for SDK 2.1.4 and 2.4.1. This is a viable
compatibility candidate without raising Reqwizit's Node 22 baseline. The later
metadata-only pilot stages a private helper; it is not a released coding engine or
proof of lower overhead. See [follow-up results](#runtime-and-dependency-follow-up).

## Findings

The [V2 SDK](https://opencode.ai/v2/docs/build/sdk), `@opencode/sdk@2.1.4`, hosts
OpenCode behind an in-memory HTTP router. It needs no network listener or separately
installed OpenCode executable for the operations exercised below. It still includes
the engine, persistence, provider/plugin initialization and tool infrastructure;
embedding does not eliminate those costs or model-context overhead.

| Actual Windows runtime | Offline result |
| --- | --- |
| Node 22.23.4 (current application baseline) | Blocked at SDK import: `@opencode/util/dist/flock.js` contains `await using`, which this runtime cannot parse. No host/session was created. |
| Electron 44.8.0, `ELECTRON_RUN_AS_NODE=1`, bundled Node 24.22.0 | Passed SDK import, host creation, health, deny-all empty-session creation, close, reopen of the same disposable database, original session/permission retrieval, session removal and final close. |

The successful invocation recorded zero prompts, zero observed network attempts
and zero listener attempts. Its single cold run took about 19.6 seconds including
import and two host lifecycles. This is **not a comparative latency/memory benchmark**,
a packaged-desktop/backend-worker check, effective tool-permission qualification,
in-flight recovery, authentication or coding qualification.

An isolated `npm install --ignore-scripts` added 385 packages. It warned that
`@opentui/core@0.6.8` requires Node >=26.4.0 (or its stated Bun version), despite
the metadata-only Electron/Node 24 check succeeding. `npm explain` shows a direct
dependency through `@opencode/server` → `@opencode/simulation` → `@opentui/core`,
as well as plugin peer references. Thus the published SDK graph still brings TUI
dependencies, even though this embedding starts no terminal UI. Do not interpret
the passing probe as full engine-range or dependency compatibility. Native PTY,
watcher, search and WASM assets also need distribution checks before adoption.

## Reproduce without touching application dependencies

Install into a separate temporary directory, not the repository root:

```powershell
$sdk = "$env:LOCALAPPDATA\Temp\opencode\reqwizit-embedded-2.1.4"
New-Item -ItemType Directory -Force $sdk
npm install --prefix $sdk --no-audit --no-fund --ignore-scripts --save-exact @opencode/sdk@2.1.4
npm run spike:embedded -- --sdk-dir $sdk
npm run spike:embedded -- --sdk-dir $sdk --runtime .\node_modules\electron\dist\electron.exe
```

The Node 22 command is expected to exit unsuccessfully. The strengthened probe also
exits unsuccessfully on Electron/Node 24 when the lifecycle succeeds but the
dependency engine audit fails. `--timeout-ms` accepts
1000–120000 (default 60000). The SDK's top-level version is pinned and checked
before import; the isolated install's generated lockfile retains its dependency
graph. This initial probe does not alter production manifests/lockfiles. The later
helper pilot adds a separate pinned staging graph, not root/desktop dependencies.

`scripts/check-embedded-opencode.mjs` launches an owned disposable probe process.
It allowlists basic executable/Windows environment fields, redirects home, XDG,
app-data, config and temporary roots **before SDK import**, and drops inherited
provider keys, proxy credentials, OpenCode configuration and `NODE_OPTIONS`.
The worker disables project/Claude config, model downloads, warming, filewatching
and FFF search, and supplies only deny-all permissions. No model catalog, sign-in,
prompt, credential inspection, source scan or coding tool is requested.

JavaScript fetch/TCP connection/listener guards fail closed for this offline check;
they are defense in depth, **not an OS security sandbox** or proof that arbitrary
native modules/subprocesses cannot access the network. Upstream stdout/stderr is
not forwarded; only classified probe results are displayed. Timeout or Ctrl+C stops
the owned process tree without fallback or retry. Disposable data is retained at
the printed `artifacts` path under the approved Windows temporary `opencode` folder.
The probe does not delete data or stop unrelated OpenCode processes.

## Licensing

The published SDK/core/server 2.1.4 manifests declare MIT. The exact upstream
[v2.1.4 license](https://github.com/anomalyco/opencode/blob/v2.1.4/LICENSE) was
retrieved: it permits use/modification/distribution with the copyright and license
notice retained. This supports embedding rather than requiring a fork. Before
shipping, inventory all transitive/native licenses and include notices; that review
is **not complete**. Provider subscription eligibility/authentication terms are a
separate gate and are not granted by the code license.

## Runtime and dependency follow-up

The follow-up adds explicit `--sdk-version <exact stable version>` (default remains
2.1.4) and `--worker-thread` to run the SDK in an actual Node Worker, as used by the
desktop backend. The outer disposable process still owns deadline/tree cleanup.
No automatic version fallback, experimental V8 flags, dependency overrides or
installed-package patches are used.

`scripts/embedded-opencode-audit.mjs` checks the explicit installation's npm lock
format 2/3, installed versions and declared Node engine ranges using that
installation's `semver` module. Missing tooling/manifests, unsupported lock entries,
links, invalid ranges or version discrepancies remain unknown rather than pass.
Only absent optional packages are skipped. The report includes the lock's SHA-256,
counts and a declared-license inventory. The hash identifies the lock, **not verified
package contents**; this is not a vulnerability scan or legal clearance. Packages
without an engine declaration are not proof of compatibility. License metadata
without a declaration is counted explicitly, not called unlicensed.

`lifecycle: "passed"` records only successful offline SDK operations. Top-level
`status: "passed"` now requires that lifecycle, no observed network/listener attempts,
a complete passing declared-engine audit and normal process exit. The original
Electron result above remains a historical lifecycle observation, not an audit pass.

Actual Windows follow-up checks (2026-11-24):

| SDK | Runtime / execution | Lifecycle | Declared Node engines |
| --- | --- | --- | --- |
| 2.4.1 (registry latest stable at inspection) | Node 22.23.4, process | Import blocked by syntax | Blocked: OpenTUI >=26.4.0 and psychoscript >=24 |
| 2.1.4 | Electron 44.8.0 / Node 24.22.0, Worker | Passed | Blocked: OpenTUI >=26.4.0 |
| 2.4.1 | Electron 44.8.0 / Node 24.22.0, Worker | Passed | Blocked: OpenTUI >=26.4.0 |
| 2.1.4 | Private Node 26.4.0, Worker | Passed | Passed: 385 installed packages, 275 engine declarations, 48 omitted optional packages |
| 2.4.1 | Private Node 26.4.0, Worker | Passed | Passed: 383 installed packages, 273 engine declarations, 58 omitted optional packages |

All completed lifecycle checks used disposable databases and recorded zero prompts,
zero observed network attempts and zero listener attempts. The 2.1.4 graph's lock
SHA-256 was `81e3f0b1c534601e6d75e9d45f3faa0c0325b41ac99042f2d3b83f7233b35785`;
2.4.1 was `2ce3f7c2515b719f8efead36e03fd24f52c1b280c0c5072af7854748b091f3a2`.
Fresh installations may resolve different transitive versions; retain their locks.
Neither graph is installed in the app or its desktop staging directory.

The 2.4.1 inventory additionally reports `MIT AND LGPL-2.1-or-later` for
`@opentui/core-win32-x64@0.9.4`. The 2.1.4 inspected Windows inventory did not report
that declaration. Both have an undeclared metadata entry. Do not upgrade merely to
remove the syntax error: 2.4.1 does not remove it on Node 22, retains the terminal
dependency and adds licensing/API review work. **Keep 2.1.4 as the integration
candidate**, matching the current app client; 2.4.1 was comparison-only.

To reproduce the compatible private-runtime candidate:

```powershell
$runtime = "$env:LOCALAPPDATA\Temp\opencode\reqwizit-node-26.4.0"
# This separate runtime installation runs its binary-download setup script.
npm install --prefix $runtime --no-audit --no-fund --save-exact node@26.4.0
$node = Join-Path $runtime "node_modules\node\bin\node.exe"
npm run spike:embedded -- --sdk-dir $sdk --runtime $node --worker-thread
# For a separately installed comparison SDK, explicitly supply --sdk-version 2.4.1.
```

### Candidate architecture and remaining tradeoff

An app-owned Node 26 helper could host the SDK and communicate with Reqwizit over
bounded process IPC, avoiding the OpenCode executable and loopback HTTP listener
while keeping Node 22 browser/terminal compatibility and Electron's existing runtime.
It must be packaged as a private runtime, not require a machine-wide Node upgrade.
This retains a separate process and adds a runtime binary; **it does not realize
the earlier same-process startup/memory simplification**, nor remove installed TUI
dependencies. The later [metadata pilot](embedded-helper-pilot.md) implements bounded
IPC and independent staging, measures uncompressed size and verifies private empty-session
continuity. Authentication, native/tool execution, installer release and comparative
performance remain unqualified.

The subsequent opt-in helper transport uses SDK 2.1.4 and explicit app-owned
storage/session identities for metadata only, without replacing the coding adapter.
It does not redirect old HTTP sessions or copy authentication. Fully
same-process embedding instead requires a compatible upstream headless graph/build
or coordinated runtime changes; the investigated stable upgrade is not that fix.

## Rollout gates

1. Select and package a compatible runtime boundary without silently upgrading the
   supported baseline or patching installed packages. The private Node 26 helper
   passes the offline compatibility slice above; same-process Node 22/24 remains
   blocked. Helper IPC/independent staging is implemented in the metadata pilot;
   coding/installer adoption remains gated. Do not fork merely to hide the mismatch.
2. Pin/review the production graph and notices; verify Electron packaging, native
   assets and real backend-worker startup/shutdown. Preserve responsiveness and
   owned cancellation; in-process close must not be assumed equivalent to killing
   the existing isolated server process and its subprocesses.
3. Add a factory behind the existing `ExecutionAdapter`/`runtimeClient` boundary,
   preserving exact selected model, role-specific bundled skills, permission profiles,
   output validation and saved-session ownership. Keep the SDK out of the renderer.
4. Use app-owned SDK configuration/storage boundaries. Design explicit authentication
   and existing OpenCode-session adoption before enabling it: **do not copy tokens**
   or reinterpret a saved session ID against a new empty database. Keep existing
   HTTP sessions resumable through their original backend. No automatic inference
   retries or provider fallback.
5. Qualify adversarial permissions, allowed/denied tools and commands, cancellation
   with running subprocesses, interruption/restart, completed-session reuse and
   delivery verification in a disposable Git worktree. Live calls need an explicit
   provider/model and bounded allowance; none were made for this spike.
6. Benchmark the same coding task/context across the two transports, including cold
   startup, warm latency, memory, dependency size and token usage. Only switch the
   default after the compatibility/migration and safety gates pass.

## Checks actually run

- `npm run check`: passed.
- Probe harness/audit tests: 14 passed, covering environment isolation, argument/version
  bounds, real Worker dispatch, unknown/failed engine audits, lock/version/license
  inventory, malformed manifests/paths, redacted network failure, owned-worker timeout,
  cancellation, missing runtime, malformed reports and failure after a success-looking report.
- Existing runtime client/execution and desktop backend-host tests: 27 passed.
- `npm run spike:embedded -- --help` and `git diff --check`: passed.
- Full application/browser/installer suites were not run for this standalone spike.
- Real offline SDK checks: Node 22 blocked; Electron/Node 24 lifecycle passes but
  dependency compatibility is blocked; private Node 26 passes both checks as above.

See [migration compatibility](migrations.md#embedded-engine-spike-2026-11-24).
