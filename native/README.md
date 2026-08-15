# dsh native client

Rust workspace for the native DeepSeek Harness client. It replaces the
served WebUI while keeping the dsh backend (the `web` profile) as the
product core — see [docs/native-client.md](../docs/native-client.md) for the
architecture decision and the pinned wire contract.

## Crates

- `dsh-remote` — transport: `POST /api/<method>` RPC envelopes and
  WebSocket event downlinks over `std::net::TcpStream` (serde/serde_json
  only; no TLS, no async runtime).
- `dsh-smoke` (bin) — read-only probe: host.describe, session.list,
  settings.describe, llm.models, then listens to `/api/events.mux`.

## Run

```sh
cargo run -p dsh-remote --bin dsh-smoke
```

Requires a running `dsh web` on 127.0.0.1:3080.
