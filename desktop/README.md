# DSH Tauri desktop client — DEPRECATED

> Replaced by the native Rust client in `../native` (egui, no webview, no
> served WebUI). Kept for reference only; CI no longer builds this shell.

This Tauri 2 shell is the separated desktop client for the local DeepSeek
Harness web runtime at http://127.0.0.1:3080. It owns the backend lifecycle:

- **Start** — when the port is not listening, the shell spawns `dsh web`
  (the `web` profile) and waits for the `GET /api/health` heartbeat before
  navigating the desktop WebView to the DSH GUI. Older dsh builds without the
  health route are detected through the boot marker in the served page.
- **Heartbeat / status** — a small floating panel (bottom-right, injected by
  the shell) polls the `backend_status` command every two seconds and shows
  whether the backend is running, with **停止后台 / 启动后台** buttons.
- **Stop** — the panel's stop button sends `POST /api/shutdown` first (the
  backend acknowledges 202 and exits cleanly); if the service is still up
  after four seconds the shell kills the owned process tree (`taskkill /T`).
- **Close** — closing the window runs the same graceful sequence: shutdown
  request, brief wait, then process-tree cleanup. A backend the shell did not
  start is never force-killed.

The web profile therefore disables the browser close-beacon
(`shutdownOnClose: false`): the shell owns lifecycle, and the beacon would
otherwise shut the backend down on an in-WebView page reload (F5).

## Prerequisites

- Rust and the Windows MSVC toolchain
- WebView2
- Node.js and a working `dsh` command
- A configured web profile containing `the-multiple-deepseek`

## Run and build

- `pnpm desktop:dev` — cargo-run the Tauri shell in development mode.
- `pnpm desktop:build` — runs the Tauri CLI (`tauri build`) and produces:
  - executable: `desktop/src-tauri/target/release/tmd-desktop.exe`
  - NSIS installer: `desktop/src-tauri/target/release/bundle/nsis/DeepSeek Harness Team_0.1.0_x64-setup.exe`

The signed side-by-side runtime and updater design is documented in
`../docs/update-architecture.md`.
