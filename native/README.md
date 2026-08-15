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
- `dsh-smoke` (bin) — read-only transport probe.
- `dsh-chat` (bin) — conversation CLI: `new`, `continue`, `history`,
  `list`, `rename`, `settings`, `models`, `presets`, `workspaces`,
  `goal`, `respond-test`.

## Run

```sh
cargo run -p dsh-remote --bin dsh-smoke
cargo run -p dsh-remote --bin dsh-chat -- new "你好"
cargo run -p dsh-remote --bin dsh-chat -- continue <sessionId> "继续"
cargo run -p dsh-remote --bin dsh-chat -- history <sessionId>
```

Requires a running `dsh web` on 127.0.0.1:3080 (override with
`DSH_BASE_URL`).
