# Native client architecture

Decision record for replacing the dsh WebUI with a native client that keeps
dsh's core functionality untouched.

## Verdict: feasible, and the WebUI is abandonable

The dsh web backend (the `web` profile, `dsh web`, 127.0.0.1:3080) already
exposes the complete product over a protocol that was designed for remote
clients — the browser React app is one consumer among several. Evidence:

- 51 unary RPC methods over `POST /api/<method>` (sessions, workspaces,
  presets, goals, settings, credentials, llm catalogs, subagents, host).
- Event streams (`/api/events.mux`, `/api/events.host`) carrying every
  session event (streaming `assistant/chunk` tokens included), approvals,
  questions, queue/jobs/projection snapshots. In the web deployment these
  upgrade to WebSocket (GET answers 426); SSE exists at the fetch level for
  in-process consumers.
- `POST /api/respond` answers server-initiated requests (approvals,
  questions) with a stable `rpcId`.
- Loopback trust fence admits any local client: `Host: 127.0.0.1:3080`,
  no Origin header, plain HTTP.

Everything the WebUI renders (chat stream, session sidebar, settings, model
picker, approvals, goal bar, plan, todos, jobs, presets, subagent views) is
reachable through this surface. Nothing model-visible or durable lives in the
browser: sessions and state are server-side, replayable from the session log.

## Architecture

- **dsh backend stays the product core** (agent loop, sessions, tools,
  settings persistence, LLM providers). No monorepo changes are required.
- **New native client in Rust** under `native/` in this repository:
  - `dsh-remote` — transport crate: HTTP RPC + WebSocket downlinks over
    `std::net::TcpStream`, JSON via serde. No async runtime, no TLS: the
    transport is a local plain-HTTP channel, so the crate builds offline.
  - `dsh-client` — egui/eframe desktop application (planned; form factor
    decided: native GUI, not a webview wrapper).
- The existing Tauri shell (`desktop/`) wraps the served WebUI; it stays as
  the fallback until the native client reaches parity, then gets replaced.

## Wire contract (pinned)

Four message forms, discriminated by `type`; correlation via `rpcId`
minted by the initiator and echoed by the responder:

- client-request `{type,rpcId,method,payload}`
- server-response `{type,rpcId,result}` where
  `result = {ok:true,value?} | {ok:false,error:{code,message,details?}}`
- server-request `{type,rpcId,method,payload}` (server-initiated)
- client-response `{type,rpcId,result}` (answers a server-request)

Unary RPC: `POST /api/<method>`, `Content-Type: application/json`,
envelope body; business results always HTTP 200; carrier codes 403 (untrusted
Host / privileged method off-loopback), 404, 400, 413, 415, 426, 500.

Method surface (all 51): `session.list/search/create/history/models/
selectModel/rename/fork/prompt/attachment/updateQueue/cancel`,
`subagent.list/history/prompt/interrupt`,
`host.describe/pickDirectory/listDirectory/createDirectory/openPath`,
`workspace.list/create/rename/delete/insertBefore/insertSessionBefore/
archiveSession`, `skill.list`,
`agentPreset.list/select/read/copy/openDocument/remove`,
`goal.create/edit/pause/resume/complete/clear`,
`settings.describe/openDocument/update/replace/mutate`,
`credentials.describe/set/unset`,
`llm.providers/models/discoverModels`.

Loopback-pinned (privileged): `agentPreset.read/copy/openDocument/remove`,
`host.pickDirectory/openPath`, `settings.*`, `credentials.*`,
`llm.discoverModels`.

No-envelope reads: `GET /api/session.export?sessionId=<id>` (session log
download), `GET|HEAD /api/health` (`200 {"ok":true}`),
`POST|GET /api/shutdown` (graceful exit, 202).

Event downlinks (WebSocket, downlink-only; client messages close 1008):
each frame is a `server-request` whose `method` is the frame type. Mux:
`session/event`, `session/subscribed`, `approval/requested|resolved`,
`question/requested|resolved`, `session/queue`, `session/jobs`,
`session/projection`, `stream/error`. Host:
`host/session-added|removed|status|agent-error`,
`host/workspace-changed|removed|order-changed`,
`host/archived-sessions-changed`, `host/remote-event`, `stream/error`.

Approvals/questions: a `server-request` arrives with a stable rpcId; the
client answers `POST /api/respond` with a `client-response` whose result
value is `{sessionId, approvalId, outcome: "allowed-once"|"rejected"}` or
`{sessionId, answer}` for questions; receipt is `{accepted:bool,reason?}`.
Pending entries survive disconnects and replay on reconnect.

## Roadmap

1. **M1 transport (done in this round)** — `dsh-remote` crate + `dsh-smoke`
   probe (host.describe, session.list, settings.describe, llm.models, WS mux
   frames) verified against a live backend.
2. **M2 session/chat core** — typed session model, session create/list/history,
   prompt with streaming block assembly, markdown rendering, composer.
3. **M3 product parity** — settings forms, model picker (incl. reasoning
   effort), approvals/questions UI, goal/plan/todo/jobs surfaces, workspaces,
   presets, subagent views, /api/respond plumbing, reconnection with replay
   of pending approvals/questions.
4. **M4 packaging** — egui window, spawn `dsh web` sidecar lifecycle (port
   of the Tauri shell's start/stop/heartbeat), NSIS installer, CI.
