//! Backend bridge: a worker thread owns the blocking RPC client and the
//! WebSocket downlink; the UI thread talks to it through two mpsc channels
//! (commands in, events out).

use dsh_remote::{DshClient, Frame, WsDownlink};
use serde_json::Value;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

/// Worker→UI notifications.
pub enum Event {
    /// One server-initiated frame off the mux downlink.
    Frame(Frame),
    /// The downlink failed; the worker will reconnect.
    DownlinkError(String),
    /// The downlink (re)connected.
    Reconnected,
}

struct Command {
    method: String,
    payload: Value,
    reply: Sender<Result<Value, String>>,
}

/// Cloneable UI-side handle for RPC calls (cheap to pass around, so no
/// self-borrow survives across a mutation).
#[derive(Clone)]
pub struct BackendHandle {
    commands: Sender<Command>,
    client: DshClient,
}

impl BackendHandle {
    /// One unary RPC executed on the worker thread (keeps the UI responsive).
    pub fn call(&self, method: &str, payload: Value) -> Result<Value, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.commands
            .send(Command { method: method.to_string(), payload, reply: reply_tx })
            .map_err(|_| "backend worker is gone".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(120))
            .map_err(|_| "rpc timed out".to_string())?
    }

    /// Direct handle for typed helpers that must not run on the UI thread
    /// (callers keep to cheap, non-blocking uses).
    pub fn client(&self) -> &DshClient {
        &self.client
    }
}

/// UI-side backend bridge: a cloneable RPC handle plus the worker event queue.
pub struct Backend {
    handle: BackendHandle,
    events: Receiver<Event>,
}

impl Backend {
    /// Spawn the worker and open the command/event channels.
    pub fn connect(base: &str) -> Result<Self, String> {
        let client = DshClient::new(base).map_err(|error| error.to_string())?;
        let (command_tx, command_rx) = mpsc::channel::<Command>();
        let (event_tx, event_rx) = mpsc::channel::<Event>();
        let worker_client = client.clone();
        thread::Builder::new()
            .name("dsh-backend".to_string())
            .spawn(move || worker_loop(worker_client, command_rx, event_tx))
            .map_err(|error| format!("worker spawn failed: {error}"))?;
        Ok(Backend { handle: BackendHandle { commands: command_tx, client }, events: event_rx })
    }

    /// Cloneable RPC handle.
    pub fn handle(&self) -> BackendHandle {
        self.handle.clone()
    }

    /// Drain all currently queued worker events.
    pub fn drain_events(&self) -> Vec<Event> {
        let mut events = Vec::new();
        while let Ok(event) = self.events.try_recv() {
            events.push(event);
        }
        events
    }
}

/// Worker loop: serve RPC commands, keep the downlink connected, pump frames.
fn worker_loop(client: DshClient, commands: Receiver<Command>, events: Sender<Event>) {
    let mut downlink: Option<WsDownlink> = None;
    loop {
        // Serve every queued command first (an RPC may take seconds; frames
        // stay buffered in the socket meanwhile).
        while let Ok(command) = commands.try_recv() {
            let result = client
                .call(&command.method, command.payload)
                .map_err(|error| error.to_string());
            if command.reply.send(result).is_err() {
                return;
            }
        }

        if downlink.is_none() {
            match WsDownlink::connect(&client, "/api/events.mux") {
                Ok(link) => {
                    downlink = Some(link);
                    if events.send(Event::Reconnected).is_err() {
                        return;
                    }
                }
                Err(_) => {
                    thread::sleep(Duration::from_secs(2));
                    continue;
                }
            }
        }

        let link = downlink.as_ref().expect("connected above");
        let deadline = Instant::now() + Duration::from_millis(150);
        loop {
            match link.next_timeout(Duration::from_millis(40)) {
                Some(Ok(frame)) => {
                    if events.send(Event::Frame(frame)).is_err() {
                        return;
                    }
                }
                Some(Err(error)) => {
                    let _ = events.send(Event::DownlinkError(error.to_string()));
                    downlink = None;
                    break;
                }
                None => break,
            }
            if Instant::now() >= deadline {
                break;
            }
        }
    }
}
