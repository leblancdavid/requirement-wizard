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
- Closing the window immediately removes it, cancels discovery, question help,
  provider tests and pending sign-in, waits for owned backend cleanup, then quits.
  There is no tray mode, background work, or quit confirmation. Already-committed
  answers, revisions and files are retained. Unsubmitted editor text is not a saved
  answer. Interrupted queues require explicit resume after restart.
- **Browse folders** uses the native directory picker in both project creation and
  project Settings. Browser clients keep their existing folder browser.
- ChatGPT authorization and external web links open in the system browser. The
  desktop renderer never becomes a provider sign-in window.
- The backend is owned by Electron's main process and retains the same authenticated
  loopback API. It prefers `127.0.0.1:4318`, falling back to an available port if busy.
  The normal browser server can continue using port 4317. Chromium preferences are
  origin-specific, so fallback ports can show default UI preferences; project data
  does not depend on that port.

Default project data follows the existing local `reqwizit` directory rules,
including reuse of an existing `requirement-wizard` directory. Chromium profile
files are kept in its `desktop` subdirectory. Desktop UI preferences are separate
from those in the user's web browser. Tokens stay in the local provider service,
outside renderer APIs and project exports.

The renderer is sandboxed, context-isolated, and has no Node integration. Its
CommonJS preload exposes only directory selection and opening HTTP(S) links.
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

The current Windows build is unsigned and uses Electron's default application icon.
Code signing, branded icons, automatic updates, installer upgrade/uninstall testing,
and macOS/Linux distribution remain follow-up release work.

## Verification

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
