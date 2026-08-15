# Core functionality and programmatic access

## 1. Core (packages/core) and what the agent loop does

The product API spine lives in packages/core/{session,system-prompt,tools,agent,agent-loop}. The heart is ReactLoopAgent (packages/core/agent-loop/src/agent.ts) — a driver over one Session, with every model request derived from the session log:

- Inbox-driven turns: two pending queues (next-turn, next-step); send/followup/steer/inject/cancel are the entry points (agent.ts:113-140).
- Pre-step hook: each step claims inbox messages, assembles the system prompt, and runs the agent/pre-step plugin waterfall (agent.ts:225-243).
- Turn/step lifecycle: appends turn/start, user/message, step/start|end, turn/end (with structured reason) to the durable session log (agent.ts:246-330).
- Streaming LLM step: streams assistant/chunk events, assembles the assistant/message, and executes tool calls, looping until no pending work; max-tokens is sticky (agent.ts:332-401).
- Request composition: provider/model defaults flow through the agent/request waterfall and llm.prepareCall; the frozen request/header is logged on initial/resume/change (agent.ts:407-495).
- Lifecycle/status: idle/maintenance/running phase machine with agent/status events, abort-based cancel, and whenIdle() quiescence (agent.ts:99-200).
- Factory service: AgentLoop (packages/core/agent-loop/src/index.ts) publishes create/createAgent/resume, config-driven agents (sessionId vs resumeSessionId), launcher-owned identities, and scoped teardown.

**Session resume** (packages/session/session-persistence/*): persistence backends (JSONL/SQLite) store the whole event log per session id. Resume = persistence.prepare(id) rehydrates that log into a Session, then agentLoop.resume() builds a fresh ReactLoopAgent over it — new turns continue the same history, and the first request header is logged with reason resume (agent-loop/src/index.ts:653-710). A launcher distinguishes resume (rehydrate existing) from sessionId (create fresh under an exact id) (LauncherAgentIdentity, index.ts:189-200).

## 2. ACP server (packages/acp/acp)

"Automation-only Agent Client Protocol server over JSON-RPC stdio" (src/index.ts:1-10). Transport: newline-delimited JSON-RPC over process.stdin/stdout via @agentclientprotocol/sdk AgentSideConnection (index.ts:348-353); config.stream is a test-only override — no HTTP. Methods: initialize, authenticate, newSession (fresh random-UUID session; rejects mcpServers/additionalDirectories), prompt (text + resource_link only, one in-flight per session, settles at whole-agent idle), cancel. Notification: session/update (committed assistant text only — no reasoning/tools/plans). Approvals: requestPermission with one-shot allow-once/reject-once (index.ts:215-229). Posture is deliberately automation-only: fresh sessions per connection, no session list/resume, no settings, no history.

## 3. SDK JSON-RPC (packages/sdk)

- Protocol (packages/sdk/protocol/src/types.ts): requests initialize (cwd/provider/model/maxTokens), session/prompt (unknown sessionId lazily creates agent+session), shutdown; notifications session.event (every session-log event in the runtime), session.status (idle|running), subagent.started|finished.
- Transport (protocol/src/transport.ts): newline-delimited JSON-RPC 2.0 over byte streams — stdio only; the TS client spawns the runtime subprocess itself (client/src/client.ts:206-210).
- TS client: HarnessClient (low-level request/subscribe) and DeepSeekHarness/HarnessSession.run() with a streaming notification observer that settles on session.status=idle (client/src/api.ts:146-194). A Python twin exists (python/sdk).
- Binaries: no apps/ entry uses it — the server is mounted by example bundles: packages/examples/jsonrpc-demo (bin dsh-jsonrpc-agent) and consumed by examples/jsonrpc-agent/cordis.yml. ACP is likewise packages/examples/acp-demo (bin dsh-acp-demo).

## 4. CLI (apps/cli) and what "dsh web" is

bin.ts + args.ts are a thin profile launcher: dsh --profile <name> [args] (headless = one-shot task, prints the final answer, exits); dsh web (alias of --profile web); dsh plugin --profile <name> <pnpm args>; dsh --dump-config|--dump-default-config. Profiles compose ordered plugin-bundle patch layers under $DSH_HOME/profiles (args.ts:64-72, README.md). **dsh web is the browser GUI server**: @deepseek-ai/dsh-web-app over @deepseek-ai/dsh-base — a node:http server (default 127.0.0.1:3080, packages/host/webserver), serving the SPA dist, plus the host apiproxy: JSON-RPC-style POST /api/<method> plus SSE (/api/events.mux, /api/events.host) and WebSocket downlinks (packages/host/apiproxy/src/fetch/handler.ts:254-302, packages/client/connection/src/websocket-downlink.ts). A Host-header trust fence admits loopback/LAN clients without tokens (client/connection/src/api-request-trust.ts:1-14).

## 5. Runnable examples (examples/)

examples/headless-agent/cordis.yml (one-shot), examples/acp-agent/cordis.yml (dsh-acp-demo ACP stdio server + JSONL persistence + sandbox/approval stack), examples/jsonrpc-agent/cordis.yml (dsh-jsonrpc-agent SDK runtime), examples/web-cordis/cordis.yml, examples/web-schedule/cordis.yml. These are the real client-facing leaves: ACP and JSON-RPC are demonstrated end-to-end here.

## 6. Conclusion: best interface for a native (Rust) desktop client

**Recommendation: the web HTTP + gateway interface (dsh web)** — it is the shipped default profile (no dsh modification needed), and it already supports everything required:

- **Chat turns with streaming**: session.prompt (POST /api/session.prompt) plus session-event streaming over SSE /api/events.mux or WebSocket (session/subscribed frames, chunk/assistant events; apiproxy/src/api-proxy.ts:480-481, fetch/client.ts:354).
- **Session list/resume**: session.list, session.search, session.create, session.history, session.rename, session.fork, session.models/selectModel (apiproxy/src/api/rpc-map.ts:25-36); "resume" = open an existing sessionId and continue prompting (persistence rehydrates the log).
- **Settings read/write**: settings.describe/update/replace/mutate/openDocument (rpc-map.ts:66-70).
- **Approvals**: server-request frames (approval requested) answered via POST /api/respond with allowed-once|rejected (apiproxy/src/api/approvals.ts:1-21); ask-user questions likewise.
- Plain HTTP+SSE/WS is trivially consumable from Rust (reqwest/axum + ws), and the loopback trust fence fits a local companion process.

**ACP** is a solid automation fallback (streaming agent_message_chunk works) but lacks session list/resume, settings, and durable history — fresh sessions only. **JSON-RPC SDK** streams session.event but has only 3 methods, no settings/approvals/list, and assumes the client owns/spawns the runtime subprocess. Web wins on coverage: everything in the four requirements is a published ApiProxy method over the same 127.0.0.1 port.
