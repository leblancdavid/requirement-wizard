# Electron desktop application

## Indexed startup history checks (2026-11-04)

Reported logs entered `opening-data` at 1,183 ms, `upgrading-data` at 1,225 ms and
`checking-data` at 1,226 ms. These are cumulative phase-entry times: the migration
apply step was fast, but the transaction cannot commit until validation succeeds.
The log alone does not measure the eventual validation duration.

Investigation found that every launch scanned full project/revision payloads to
find change-review receipts, including large historical snapshots with no such
receipts. Database migration 26 now builds covering expression indexes for that
validation path. Warm-start checks read the extracted review arrays from the index,
not full historical project bodies; their supported-format and size checks remain.
Repeated identical arrays share only a bounded in-process digest cache. No historical
work or receipts are deleted, trusted merely by age/revision, or made current.

**First updated start can still take time:** building the index requires one archive
read. The splash/console now distinguish “Indexing saved review history once for
faster future starts” from indexed history checks, saved-work checkpoints and saved
definition evidence. Later starts do not rebuild the index. Other validators may
still take time; actual large-project end-to-end timings remain unmeasured. Keep the
complete startup phase log if another phase is slow rather than resetting the data.

All 48 focused tests, 105 forensic/migration regressions, `npm test` (899 pretests,
774 main tests and 34 posttests), type/diff checks, the isolated real Electron suite
and dedicated startup/close-during-startup tests passed.
The ordinary `npm run test:desktop` staging install was blocked by the still-running
development app locking its native SQLite module. Checks instead used an independent
ignored stage with pinned dependencies and isolated data. No user process was stopped,
no installed app rebuilt and no user database migrated for verification.
`REQWIZIT_DESKTOP_APP_DIRECTORY` is now supported by both desktop test runners so
an isolated stage can be tested without rebuilding the running app's directory.
After closing the current development instance, `npm run desktop` rebuilds the
source application normally. See [migration/recovery details](migrations.md#indexed-startup-review-validation-2026-11-04).

## Assessment memory-pressure mitigation (2026-11-04)

A subsequent native terminal trace reports `CALL_AND_RETRY_LAST Allocation failed -
JavaScript heap out of memory` after roughly 68 minutes. This confirms a fatal V8
allocation failure, but its native stack does not identify an application callsite
or prove that all available memory was exhausted. The exact real-project assessment
crash has not been reproduced. A native fatal abort can terminate before JavaScript
worker-error callbacks run; it may therefore leave no new `backend-failure.json`.
Read-only metadata inspection found 2,644 local jobs
totalling approximately 147 million JSON characters; current project payloads were up to
8.8 million characters. No project text or credentials were read into diagnostics.
A broader revisions-size scan reached its diagnostic timeout; it did not establish
a history size breakdown.

Concrete bulk-retention paths were removed without raising the heap limit:

- Coordinator scheduling reads validated, explicitly typed compact receipts
  (task keys/targets, lifecycle status, original revision and necessary verdict/summary)
  directly from SQLite. It does not hold full context, response or stage ledgers
  across assessment/model awaits. Original jobs are still validated by dispatch.
- Initialization uses a scan-existence query instead of decoding all jobs. Completion
  reconciliation loads only original pair-check jobs; readiness continuation loads
  only original clarification jobs. No relevant rows are limited to an arbitrary
  recent page, and no scheduling projection is treated as a complete job.
- Original definition candidates are decoded one at a time under the same newest-first
  20-candidate policy. The cursor closes before replay/inference. Full archive reads
  elsewhere stream raw JSON into the validated result list rather than keeping a
  second complete raw-string array.
- Portable publication reads and encodes one assessment-origin snapshot at a time
  instead of retaining every area's entire historical project simultaneously.
  Exact deltas/object hashes and selection rules remain compatible; missing optional
  legacy publication snapshots stay missing, while missing required history still fails.

The synthetic memory check encodes 96 independently parsed 2-MiB publication snapshots
in an isolated Node process capped at 128 MiB old-space:

```powershell
node --max-old-space-size=128 --import tsx scripts/check-portable-memory.ts
```

That check and type checking passed, as did the real Electron isolated-data suite
(including the UI/desktop build), coordinated-workflow and continuous-definition
browser checks, diff checking, and `npm test` (899 pretests, 772 main tests and 17
posttests). The 284 focused portable/workflow/definition/store/completion tests also
passed. These checks do not reproduce the user's long-running crash or
establish a universal heap ceiling. No live model calls, application launch against
the user's data, installed-app rebuild, history deletion, data reset or reassessment
was performed. Restart `npm run desktop` to load the rebuilt source application;
interrupted work still requires explicit continuation. See the
[compatibility ledger](migrations.md#assessment-memory-pressure-reduction-2026-11-04).

## Backend crash diagnostics (2026-11-04)

The unexpected-stop dialog identifies a backend worker failure after startup, not
its cause. A reported crash occurred during Continue specification assessment from
`npm run desktop`; its terminal output contained only successful startup stages.
The previous worker host discarded the error object and exit code. That report
alone did not establish memory exhaustion, serialization failure or a model
failure. The subsequent native trace and mitigations are recorded above; the exact
assessment crash has not been reproduced against the user's project.

The host now reports one safe failure record to the owner before shutdown. The
launching terminal receives `Desktop backend failure:` and the desktop writes the
latest record to `<data directory>/desktop/backend-failure.json` (format 1). The
dialog includes the category, an allowlisted Node/SQLite error code or exit code,
and whether the diagnostic was saved. Memory/string-size/stack-overflow categories
are recognized error signatures, not a substitute for reproducing the failing
operation. Records contain a timestamp, failure kind, safe error class/code and at
most eight source basenames with line/column numbers. Raw exception messages,
function names, full paths, SQL/project text, provider responses and credentials
are excluded. Diagnostic write/display failure cannot prevent owned cleanup.

This is an additive local diagnostic only: no SQLite, portable, settings or saved
job migration; no assessments or attempts are reset or replayed. A source launch
must be restarted with `npm run desktop` to load it. No installed app was rebuilt.
Type checking, all eight worker tests and `npm run test:desktop` passed. Tests cover
safe classification/redaction and a synthetic worker error carrying the memory
error code, not actual memory exhaustion. The real Electron runner covers normal
launch/IPC/relaunch/cleanup on isolated data; native crash-dialog/file behavior and
the reported assessment crash remain unqualified. No live inference or user-project
writes were performed during diagnosis/testing; only local file metadata was inspected.

## Visible startup (2026-10-31)

The desktop shows its own window **before** opening/checking the SQLite store, rather than
remaining invisible until the backend is ready. A local splash displays an indeterminate
spinner and allowlisted stages: opening local data, updating data (only when a migration
actually runs), checking saved projects/history, checking interrupted work, starting the local
workspace and loading its interface. No estimated percentage is invented. The main process
logs phase elapsed times without project text, paths or credentials.

This exposes progress; it does not establish that a reported slow launch was a migration
or remove validation work. Current-format stores still validate saved data on every open.
Large real-project startup performance remains unmeasured. Source launches also build the UI/
desktop before Electron starts; the splash cannot cover that pre-launch build interval.
Browser clients show initial interface/project-list/project loading states after the server
is available; they cannot render a page before a CLI server binds its port.

The same sandboxed window transitions to the owned loopback app. Native IPC remains limited
to the owned app origin, not the splash; permissions, cancellation and owned-worker shutdown
are unchanged. Closing during startup waits for safe worker cleanup, not forced termination.
Display callback failure cannot interrupt migration or change saved evidence. SQLite stays 23.
`npm run test:desktop:startup` checks an isolated deliberately blocked SQLite startup, visible
splash, IPC rejection, close-during-startup and normal relaunch without model calls.

Verification, 2026-10-31: type checking, desktop build, the full `npm run test:desktop` and
the dedicated startup check passed on Windows. The existing missing 36px desktop header
offset was corrected; the full runner now passes native window/title-bar/theme/IPC, saved
SQLite continuity, renderer isolation, relaunch and owned shutdown checks. This supersedes
the older dated title-bar failure below, not larger-project startup performance qualification.
Screenshot: `.reqwizit-state/desktop-startup.png`.

Header-layout correction: the native title bar is reserved once by the app container's
36px padding. The relatively positioned header must have **zero** extra top offset; setting
it to 36px produced both a visible second gap and content overlap. Desktop regression checks
now compare actual title-bar/header/content boundaries rather than accepting a computed
`top` value, including maximized/restored windows and enlarged UI text.

Reqwizit now has a Windows-first Electron shell around the existing React workspace
and local service. Browser and terminal clients remain available and share project
data with the desktop when they use the same data directory.

## Run from source

Use **Node.js 22.12 or newer** and npm. Electron 44's installation tools and
electron-builder require the newer development baseline; installed users do not
need Node, npm, or a terminal.

```powershell
npm ci
npm run desktop
```

For isolated development data:

```powershell
npm run desktop -- --data-dir .reqwizit-state/desktop-dev
```

The build compiles the backend and shell into `dist/desktop-app/app`, copies the
built React interface into `dist/desktop-app/web`, and installs the independent,
locked production dependencies from `scripts/desktop/`. Electron launches the
staged application. On Windows, stop development servers before reinstalling
dependencies: a process holding a native SQLite module can block `npm ci`.

## Behavior

- One desktop instance per data directory; launching it again focuses its window.
- Windows uses a draggable 36px app title bar with the Reqwizit mark. Electron's
  native overlay supplies minimize, maximize/restore and close at the top right,
  retaining native resizing and Snap Layout support. The bar and controls follow
  the selected accent/contrast colors. Browser clients do not show this bar; other
  platforms retain their native frame.
- Closing the window immediately removes it, cancels discovery, question help,
  provider tests and pending sign-in, waits for owned backend cleanup, then quits.
  There is no tray mode, background work, or quit confirmation. Already-committed
  answers, revisions and files are retained. Unsubmitted editor text is not a saved
  answer. Interrupted queues require explicit resume after restart.
- **Application menu → Quit** uses that same shutdown path, with no confirmation.
  The top-left menu also contains New project, Open project, Recent workspaces and
  Settings instead of a persistent left sidebar. Quit is desktop-only.
- **Browse folders** uses the native directory picker in both project creation and
  project Settings. Browser clients keep their existing folder browser.
- **Copy details** in Logs uses a write-only native clipboard action, since desktop
  browser permissions remain denied. Only the app's main frame at its owned origin
  can send bounded text; no clipboard-reading API is exposed to the renderer.
  Log credential redaction is preserved. No saved data or migration changes.
  Verification (2026-10-25): type check, desktop build and browser log checks
  passed. Real Electron log-button/preload/IPC checks passed with the native write
  captured (without altering the user's clipboard), including redaction and oversized
  input rejection. The desktop runner then stopped at an unrelated title-bar layout
  assertion (`0px` versus `36px`); the full desktop suite is not claimed passing.
- ChatGPT authorization and external web links open in the system browser. The
  desktop renderer never becomes a provider sign-in window.
- The backend runs in an owned Node worker thread, not Electron's native-window
  event loop, and retains the same authenticated
  loopback API. It prefers `127.0.0.1:4318`, falling back to an available port if busy.
  The normal browser server can continue using port 4317. Chromium preferences are
  origin-specific, so fallback ports can show default UI preferences; project data
  does not depend on that port.

### Responsiveness during checkpoint publication

SQLite, discovery, providers and portable workspace publication run in the service
worker. Synchronous history validation, JSON comparisons and file publication can
delay an API response, but no longer block native window events. Only the ready
loopback origin crosses the worker startup boundary; credentials remain in the
provider service. Native directory/link/title-bar IPC stays in Electron's main process.
Closing or Quit immediately destroys the window, requests service cancellation and
awaits worker cleanup (including saved workspace publication) before exiting. It
does not forcibly terminate a worker during writes. Unexpected worker exit reports
a generic error and shuts down the shell instead of leaving a disconnected window.

Investigation on 2026-10-21 reproduced an 18.6-second synchronous continuation build
against Rust Grind Galaxy's existing saved data: 406 historical snapshot reads,
391 exported deltas and 429 retained jobs. This was a read-only measurement, not a
capture of the original Windows hang. Current-field and array-item JSON comparisons
are now cached for each export; evidence selection, validation, order, hashes and
portable format remain unchanged. Historical work can still be expensive; the
worker isolation, not a promised export-time limit, protects native responsiveness.
A later read-only check at revision 1793 took 14.9 seconds for the same 406 historical
reads (the original check was revision 1791, so this is not a controlled speedup claim).
No project migration, reset or model replay is required.

Verification: Node 22.23.3 type check, all 565 deterministic tests (560 engine/UI/API
tests plus five worker lifecycle tests), UI build, desktop compilation and independently
staged real Electron smoke checks passed. Smoke checks include actual worker/SQLite
startup, relaunch, native IPC and clean window-close/menu-Quit shutdown with saved
project retention. Worker regression checks cover CPU-bound startup with a responsive
owner, close during startup, awaited cleanup, idempotent close, startup/runtime errors
and unexpected clean exit. Portable checks compare optimized delta/object bytes to
the previous encoder and reconstruct exact historical evidence. No user data was
written and no live inference was used. The running development app was not replaced;
restart a newly built desktop to use this change. Installer generation was not repeated.

Default project data follows the existing local `reqwizit` directory rules,
including reuse of an existing `requirement-wizard` directory. Chromium profile
files are kept in its `desktop` subdirectory. Desktop UI preferences are separate
from those in the user's web browser. Tokens stay in the local provider service,
outside renderer APIs and project exports.

The renderer is sandboxed, context-isolated, and has no Node integration. Its
CommonJS preload exposes directory selection, opening HTTP(S) links, Quit, text copying, strictly
validated title-bar colors and a platform capability flag. It does not expose
arbitrary window operations or IPC channels.
IPC checks the owning window, main frame, and local origin. Web permissions and
webviews are disabled; new windows and external navigation are intercepted.

## Windows installer

```powershell
npm run package:desktop
```

Outputs:

- `dist/installers/Reqwizit-0.1.0-x64-setup.exe`: per-user NSIS installer with a
  selectable destination.
- `dist/installers/win-unpacked/Reqwizit.exe`: runnable packaged application.

The installer bundles Electron, the compiled service, UI, and desktop production
dependencies. The desktop pins `better-sqlite3` 13.0.3, whose bundled Node-API
prebuild works with Electron's Node. Browser/terminal development retains 11.10.0;
the two installation trees and lockfiles are separate. Shared application schema
and revision rules remain the same. Updating runtime dependencies requires keeping
`scripts/desktop/package.json` and its lockfile aligned deliberately.

Legacy OpenCode selections still require a separately installed OpenCode executable
(or `OPENCODE_BIN` pointing to it). The app only starts/stops the runtime it owns.
Direct selections use the existing app-owned provider implementation, with its
documented live-qualification gaps. Packaging does not qualify direct access.

The Windows build uses a branded Q/checkmark icon and remains unsigned. Executable
resource editing embeds the icon and metadata; `signExecutable: false` disables
signing without suppressing icon editing.
Code signing, automatic updates, installer upgrade/uninstall testing,
and macOS/Linux distribution remain follow-up release work.

### Icon assets

`src/ui/public/reqwizit.svg` is the SVG master (sage Q with a gold checkmark tail),
also used by the browser favicon, application menu and desktop title bar.
`assets/reqwizit.ico` contains 16, 24, 32, 48, 64, 128 and 256px images;
`assets/reqwizit.png` is a 512px export. Both are staged with the desktop app; the
ICO is configured for the Windows executable, installer and uninstaller.
Exports are committed, so normal builds do not need Chromium. To regenerate:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path $PWD '.reqwizit-state/browsers')
npx playwright install chromium
npm run build:icons
```

This is presentation-only: existing appearance preferences are reused without
project data, schema, assessment/freshness or credential changes. No migration.

## Verification

Branding/title-bar verification (2026-10-21, Node 22.23.3): type check, 555 tests,
UI build, main browser check and independently staged/packaged desktop checks
passed. Desktop checks cover the draggable region/sticky offset, native
maximize/minimize/restore state, theme-color IPC and malformed-color rejection,
favicon availability, saved-project continuity, menu access and clean shutdown.
Windows executable resource extraction confirmed the embedded Q/checkmark icon.
Playwright page screenshots omit OS-drawn caption buttons; native hover/Snap,
dragging and double-click behavior still need a manual Windows check.
The portable-project browser check hit a duplicate `Open shared checkpoint` button
selector (menu and page). The ordinary staging install was locked by an existing
app, so these checks used `.reqwizit-state/desktop-brand-check` without stopping it.
Packaged output is under `dist/installers-brand-check`; installation/upgrade/
uninstallation remain unverified.
The initial installer-generation command exceeded its 120-second timeout after
producing the runnable packaged executable. The longer retry failed in NSIS with
`failed creating mmap` of the generated `.nsis.7z` archive. The isolated staging
build reported parent-tree duplicate dependency references and an unexpectedly
large payload; installer generation is not qualified by this check. The runnable
packaged executable and its embedded icon passed the checks described above.

```powershell
npm run check
npm test
npm run test:browser
npm run test:desktop
npm run package:desktop
# Exercise the packaged executable with the same isolated smoke check:
$env:REQWIZIT_DESKTOP_EXECUTABLE = (Resolve-Path "dist/installers/win-unpacked/Reqwizit.exe").Path
npx tsx src/desktop/desktop-check.ts
Remove-Item Env:REQWIZIT_DESKTOP_EXECUTABLE
```

The source smoke runner also accepts `REQWIZIT_DESKTOP_APP_DIRECTORY` to launch an
independently staged app instead of `dist/desktop-app` (not used for packaged-executable
checks). This allows verification without replacing dependencies locked by an existing
desktop process. It still uses an isolated temporary data directory.

Application-menu verification (2026-10-21, Node 22.23.3): UI build and desktop TypeScript
compilation passed. The normal `npm run test:desktop` staging install was blocked by
an existing process locking `dist/desktop-app/node_modules/better-sqlite3/prebuilds/win32-x64.node`.
No unrelated process was stopped. Freshly compiled code/UI and the same locked dependency
graph were staged independently under the approved OpenCode temporary directory; the
desktop smoke runner passed using `REQWIZIT_DESKTOP_APP_DIRECTORY`. Both window-close
and menu Quit exited the owned backend, and the saved project remained readable after
Quit. Renderer isolation, native link/directory IPC and relaunch continuity also passed.
Installer generation/installed-app upgrade checks were not repeated for this UI change.

Verified on Windows, October 16, 2026:

- Electron 44.8.0 and electron-builder 26.15.3; installer generation with Node 22.23.3.
- Staged and packaged executable launch, existing Node-created SQLite project
  continuity, relaunch, native IPC (OS dialog/browser calls stubbed), forbidden
  external schemes, no renderer Node access, window-close process exit and backend
  shutdown. Screenshot: `.reqwizit-state/desktop.png`.
- 85 deterministic tests and browser checks passed on the existing Node 20.11 host.
  The shutdown regression covers simultaneous discovery/help/provider cancellation,
  rejection of new work, idempotent close, retained revisions, and paused queues.
- A clean root `npm ci` attempt was blocked by a native SQLite module held by an
  existing process; dependencies were restored without stopping that process.
  A full clean-install/engine-suite check under Node 22 remains to be repeated after
  closing existing development servers. No live inference or OAuth was run for this
  desktop change, and the installer itself has not been installed/uninstalled.
