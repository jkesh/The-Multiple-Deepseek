//! dsh-chat: run one conversation turn through the native transport.
//!
//! Usage:
//!   dsh-chat new <prompt...>              create a session, prompt, stream
//!   dsh-chat continue <sessionId> <prompt...>   prompt an existing session
//!   dsh-chat history <sessionId>          dump the event-log tail summary
//!   dsh-chat list                         list sessions
//!
//! Streaming arrives as `session/event` frames on /api/events.mux; the
//! command prints visible text deltas as they arrive and exits when the turn
//! ends (or the deadline passes).

use dsh_remote::chat::{parse_event_data, SessionEventData, Transcript};
use dsh_remote::model::{CreateSessionRequest, PromptPart, SessionEvent};
use dsh_remote::{DshClient, WsDownlink};
use serde_json::Value;
use std::io::Write;
use std::time::{Duration, Instant};

const DEFAULT_BASE: &str = "http://127.0.0.1:3080";
const QUIET_AFTER_TURN: Duration = Duration::from_millis(1500);
const OVERALL_DEADLINE: Duration = Duration::from_secs(120);

fn main() {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| {
        eprintln!("usage: dsh-chat <new|continue|history|list> ...");
        std::process::exit(2)
    });
    let base = std::env::var("DSH_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE.to_string());
    let client = match DshClient::new(&base) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("bad base URL: {error}");
            std::process::exit(2);
        }
    };

    let outcome = match command.as_str() {
        "list" => list(&client),
        "new" => {
            let prompt = args.collect::<Vec<_>>().join(" ");
            if prompt.is_empty() {
                eprintln!("usage: dsh-chat new <prompt...>");
                std::process::exit(2);
            }
            new_turn(&client, &prompt)
        }
        "continue" => {
            let session_id = args.next().unwrap_or_default();
            let prompt = args.collect::<Vec<_>>().join(" ");
            if session_id.is_empty() || prompt.is_empty() {
                eprintln!("usage: dsh-chat continue <sessionId> <prompt...>");
                std::process::exit(2);
            }
            continue_turn(&client, &session_id, &prompt)
        }
        "history" => {
            let session_id = args.next().unwrap_or_default();
            if session_id.is_empty() {
                eprintln!("usage: dsh-chat history <sessionId>");
                std::process::exit(2);
            }
            history(&client, &session_id)
        }
        "rename" => {
            let session_id = args.next().unwrap_or_default();
            let title = args.collect::<Vec<_>>().join(" ");
            if session_id.is_empty() || title.is_empty() {
                eprintln!("usage: dsh-chat rename <sessionId> <title...>");
                std::process::exit(2);
            }
            client
                .rename_session(&session_id, &title)
                .map(|_| println!("renamed {session_id} to {title}"))
        }
        other => {
            eprintln!("unknown command: {other}");
            std::process::exit(2);
        }
    };

    match outcome {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            eprintln!("dsh-chat failed: {error}");
            std::process::exit(1);
        }
    }
}

fn list(client: &DshClient) -> Result<(), dsh_remote::RemoteError> {
    for session in client.list_sessions()? {
        let marker = if session.running { "▶" } else { " " };
        println!(
            "{marker} {}  {:<28}  {}",
            session.session_id,
            session.display_name(),
            session.agent_preset.as_deref().unwrap_or("-"),
        );
    }
    Ok(())
}

fn new_turn(client: &DshClient, prompt: &str) -> Result<(), dsh_remote::RemoteError> {
    let created = client.create_session(&CreateSessionRequest::default())?;
    println!("[session] {}", created.session_id);
    match run_turn(client, &created.session_id, prompt) {
        Ok(()) => {
            let label = "[dsh-native 测试]";
            let _ = client.rename_session(&created.session_id, label);
            println!("[renamed] {label}");
            Ok(())
        }
        Err(error) => {
            let _ = client.rename_session(&created.session_id, "[dsh-native 失败]");
            Err(error)
        }
    }
}

fn continue_turn(client: &DshClient, session_id: &str, prompt: &str) -> Result<(), dsh_remote::RemoteError> {
    run_turn(client, session_id, prompt)
}

/// Connect the mux, queue the prompt, and stream until the turn ends.
fn run_turn(client: &DshClient, session_id: &str, prompt: &str) -> Result<(), dsh_remote::RemoteError> {
    let downlink = WsDownlink::connect(client, "/api/events.mux")?;
    let ack = client.prompt(session_id, &[PromptPart::text(prompt)], "queue")?;
    if !ack.accepted {
        return Err(dsh_remote::RemoteError::Protocol(format!("prompt not accepted: {:?}", ack.command)));
    }

    let mut transcript = Transcript::default();
    let mut turn_seen = false;
    let mut last_event = Instant::now();
    let deadline = Instant::now() + OVERALL_DEADLINE;
    let stdout = std::io::stdout();

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            eprintln!("[timeout] turn did not settle in {OVERALL_DEADLINE:?}");
            break;
        }
        let wait = if turn_seen { QUIET_AFTER_TURN } else { Duration::from_millis(250) };
        match downlink.next_timeout(wait) {
            Some(Ok(frame)) => {
                if frame.method != "session/event" {
                    continue;
                }
                let payload: Value = frame.payload;
                let frame_session = payload.get("sessionId").and_then(Value::as_str).unwrap_or_default();
                if frame_session != session_id {
                    continue;
                }
                let event: SessionEvent = match serde_json::from_value(payload.get("event").cloned().unwrap_or(Value::Null)) {
                    Ok(event) => event,
                    Err(_) => continue,
                };
                last_event = Instant::now();
                transcript.apply(&event);
                match parse_event_data(&event) {
                    SessionEventData::AssistantChunk { chunk, .. } => match chunk {
                        dsh_remote::chat::StreamChunk::TextDelta { text, .. } => {
                            let mut lock = stdout.lock();
                            let _ = lock.write_all(text.as_bytes());
                            let _ = lock.flush();
                        }
                        dsh_remote::chat::StreamChunk::ReasoningDelta { text, .. } => {
                            eprint!("[reasoning] {text}");
                        }
                        _ => {}
                    },
                    SessionEventData::TurnStart { .. } => {
                        turn_seen = true;
                    }
                    SessionEventData::TurnEnd { .. } => {
                        // Keep draining until the stream goes quiet.
                    }
                    _ => {}
                }
            }
            Some(Err(error)) => {
                eprintln!("[downlink] {error}");
                break;
            }
            None => {
                if turn_seen && last_event.elapsed() >= QUIET_AFTER_TURN {
                    break;
                }
            }
        }
    }

    println!();
    match transcript.live_text() {
        Some(text) if !text.is_empty() => {
            println!("---- final assistant text ----");
            println!("{text}");
        }
        _ => {
            println!("---- no assistant text captured ----");
        }
    }
    Ok(())
}

fn history(client: &DshClient, session_id: &str) -> Result<(), dsh_remote::RemoteError> {
    let page = client.session_history(session_id, None, None)?;
    println!("{} events (hasMore={})", page.events.len(), page.has_more);
    for entry in &page.events {
        let event = &entry.event;
        println!(
            "#{:>6} {} {}",
            event.seq,
            event.typ,
            serde_json::to_string(&event.data)
                .map(|text| truncate(&text, 120))
                .unwrap_or_default(),
        );
    }
    Ok(())
}

fn truncate(text: &str, cap: usize) -> String {
    if text.len() <= cap {
        text.to_string()
    } else {
        format!("{}…", &text[..cap])
    }
}
