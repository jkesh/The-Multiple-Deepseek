# dsh native client

Rust workspace for the native DeepSeek Harness client. It replaces the
served WebUI while keeping the dsh backend (the `web` profile) as the
product core — see [docs/native-client.md](../docs/native-client.md) for the
architecture decision and the pinned wire contract.

## Crates

- `dsh-remote` — transport (`POST /api/<method>` RPC envelopes,
  chunked decoding, WebSocket event downlinks over `std::net::TcpStream`;
  serde/serde_json only, no TLS, no async runtime) plus typed domains:
  - `model` — sessions: list/create/history/prompt/rename/cancel/search.
  - `chat` — content blocks, streaming chunks, session-event vocabulary,
    incremental transcript assembler.
  - `domains` — settings (describe/update/replace/mutate + revisions),
    model catalog + reasoning efforts + `session.selectModel`,
    agent presets, goals (create/edit/pause/resume/complete/clear),
    workspaces/archive, approvals & questions via `/api/respond`.
- `dsh-client` — native egui desktop application: session sidebar with
  running dots, streaming markdown transcript (CJK fonts loaded from the
  system), multiline composer, model/preset pickers with reasoning effort,
  approval and ask-user question modals, settings (read-only) window, goal
  panel, background worker thread for RPC and the WebSocket downlink, and
  the sidecar lifecycle: heartbeat (`/api/health` with boot-marker
  fallback for older dsh builds), spawn `dsh web` on demand, start/stop
  buttons, and stop-with-the-window on close (graceful `/api/shutdown`
  when available, process-tree cleanup otherwise). `DSH_SIDECAR_CMD`
  overrides the sidecar argv; `DSH_NO_SIDECAR` disables sidecar
  management.
- `dsh-smoke` (bin) — read-only transport probe.
- `dsh-healthprobe` (bin) — heartbeat/shutdown-route probe.
- `dsh-chat` (bin) — conversation CLI: `new`, `continue`, `history`,
  `list`, `rename`, `settings`, `models`, `presets`, `workspaces`,
  `goal`, `respond-test`.

## Run

```sh
cargo run -p dsh-client
cargo run -p dsh-remote --bin dsh-smoke
cargo run -p dsh-remote --bin dsh-chat -- new "你好"
```

Requires a running `dsh web` on 127.0.0.1:3080 (override with
`DSH_BASE_URL`); without one, `dsh-client` starts it via the sidecar.
