# DSH Tauri desktop client

This Tauri 2 shell connects to the local DeepSeek Harness web runtime at
http://127.0.0.1:3080. If the port is not listening it starts `dsh web`, waits
for readiness, and navigates the desktop WebView to the DSH GUI.

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

The MVP reuses the installed DSH runtime and auto-starts `dsh web` when
`127.0.0.1:3080` is not listening. The signed side-by-side runtime and updater
design is documented in `../docs/update-architecture.md`.
