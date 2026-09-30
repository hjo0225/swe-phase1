---
title: electron-vite fails with 'Electron uninstall' because Electron 44 downloads its binary lazily
date: 2026-09-30
category: build-errors
module: build tooling (electron-vite dev/preview launcher)
problem_type: build_error
component: tooling
symptoms:
  - "`pnpm start` (electron-vite preview) builds, then exits with `Error: Electron uninstall` from electron-vite getElectronPath"
  - "`pnpm dev` cannot launch the Electron app after a fresh `pnpm install`"
  - node_modules/electron has no path.txt and no dist/ directory although the package is installed
root_cause: incomplete_setup
resolution_type: config_change
severity: high
framework_version: electron 44.4.5, electron-vite 5.0.0, pnpm 11.13.0
related_components: [development_workflow]
tags: [electron, electron-vite, postinstall, pnpm, electron-binary, path-txt, fresh-install]
---

# electron-vite fails with 'Electron uninstall' because Electron 44 downloads its binary lazily

## Problem

With Electron 44 and electron-vite 5 under pnpm 11, the app built fine but `pnpm start` (`electron-vite preview`) refused to launch Electron. Electron 44 no longer downloads its binary at install time, and electron-vite 5 looks for the binary without ever triggering that download.

## Symptoms

- `pnpm start` finished the build and then printed:

  ```
  error during preview electron app:
  Error: Electron uninstall
      at getElectronPath (.../electron-vite/dist/chunks/lib-q6ns0vZr.js:155:19)
      at startElectron (.../electron-vite/dist/chunks/lib-q6ns0vZr.js:222:26)
      at preview (.../electron-vite/dist/chunks/lib-Dvh2Hokw.js:21:5)
      at async CAC.<anonymous> (.../electron-vite/dist/cli.js:109:9)
  [ELIFECYCLE] Command failed with exit code 1.
  ```

- `node_modules/electron/` contained `index.js`, `install.js`, `cli.js` and `checksums.json`, but no `dist/` directory and no `path.txt`.
- `pnpm install` printed nothing about Electron. The only ignored-build warning was for `better-sqlite3` (`[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: better-sqlite3@13.0.3`).
- Running the binary directly (`ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron t.js`) worked and printed `Downloading Electron binary...` first. That masked the problem until electron-vite was used.

## What Didn't Work

- **Relying on `pnpm install`.** Nothing in its output hinted that the Electron binary was missing; the build (`pnpm build`) also succeeds without it. The failure only appears when electron-vite tries to start Electron.
- **Allowing Electron's build script in pnpm.** In a scratch probe, `onlyBuiltDependencies` (the pnpm 10-era key) had no effect under pnpm 11; switching to `allowBuilds:` made `better-sqlite3`'s script run but still produced no `electron/dist`. Electron 44 has no install script to allow, so no pnpm build-approval setting fixes this.

## Solution

Add a root `postinstall` script that requires the `electron` package once. That makes Electron download its binary and write `path.txt`.

Before (`package.json` scripts):

```json
"test:watch": "vitest"
```

After:

```json
"test:watch": "vitest",
"postinstall": "node -e \"require('electron')\""
```

Running `pnpm run postinstall` printed `Downloading Electron binary...`, `node_modules/electron/path.txt` then contained `electron.exe`, and `pnpm start` launched the app.

## Why This Works

- **Electron 44 downloads lazily.** Its `package.json` has no `scripts` entry, so there is no install hook for pnpm to run or block. The binary is fetched from `index.js` instead:
  - `getElectronPath()` calls `downloadElectron()` when `path.txt` or the `dist/` executable is missing; `downloadElectron()` spawns `install.js`; after it ran here, both `dist/` and `path.txt` existed.
  - The module ends with `module.exports = getElectronPath();`, so **any `require('electron')` from Node triggers the download**.
- **electron-vite 5 bypasses that path.** Its own `getElectronPath()` (in the installed package's bundled chunk, `lib-q6ns0vZr.js` for 5.0.0; the chunk name changes between releases, so grep for `Electron uninstall`) never requires `electron`'s entry point. It resolves the module directory, reads `path.txt` directly, and throws `new Error('Electron uninstall')` when the file is absent. Unless `ELECTRON_EXEC_PATH` is set, nothing in `electron-vite dev`/`preview` causes the download.
- The root `postinstall` runs `require('electron')` in plain Node after every `pnpm install`, so the binary and `path.txt` exist before electron-vite looks for them. In this repo (pnpm 11.13.0) the root `postinstall` ran even though it is not listed in `allowBuilds`, which only lists dependencies (observed, not checked against pnpm source).

## Prevention

- **Keep the root `postinstall`** when upgrading Electron or electron-vite. Without it, a fresh clone plus `pnpm install` yields a project that builds but cannot `pnpm dev`/`pnpm start`.
- **It may become unnecessary.** If a future electron-vite resolves the executable through `require('electron')` or triggers the download itself, the line can go. To check: remove `node_modules`, drop the postinstall, `pnpm install`, confirm `node_modules/electron/path.txt` is absent, then run `pnpm start`. If the app launches, the workaround is obsolete.
- **Verify setup changes with `pnpm start`, not only `pnpm build`.** The build succeeds even when the Electron binary is missing.
- Neighbouring constraints on the same toolchain, which fail loudly on their own but are easy to trip during upgrades:
  - Under pnpm 11.13.0, dependency install scripts were blocked (`ERR_PNPM_IGNORED_BUILDS`) until listed under `allowBuilds:` in `pnpm-workspace.yaml`; the older `onlyBuiltDependencies` key had no effect in the probe. The file lists `better-sqlite3`, `esbuild` and `electron` (the last is harmless — Electron 44 has no install script).
  - electron-vite 5 declares the peer range `vite ^5 || ^6 || ^7`, so `vite` stays on the 7.x line and `@vitejs/plugin-react` on 5.x (6.x requires Vite 8).

## Related Issues

- [Stage 1 foundation plan](../../superpowers/plans/2026-09-30-stage1-foundation.md) — the pre-check table row where this was first recorded during implementation.
