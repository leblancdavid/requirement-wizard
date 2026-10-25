# Electron desktop application

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
