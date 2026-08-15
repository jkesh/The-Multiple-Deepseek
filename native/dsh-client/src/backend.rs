//! Backend bridge: a worker thread owns the blocking RPC client, the
//! WebSocket downlink, and the dsh sidecar process lifecycle (spawn on
//! demand, heartbeat, graceful stop, process-tree cleanup). The UI thread
//! talks to it through two mpsc channels (commands in, events out).

use dsh_remote::{DshClient, Frame, WsDownlink};
use serde_json::Value;
use std::process::{Child, Command, Stdio};
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
    /// Periodic heartbeat snapshot.
    Status(BackendStatus),
}

/// Backend liveness facts for the status bar.
#[derive(Clone, Debug)]
pub struct BackendStatus {
    pub running: bool,
    pub owned: bool,
}

enum WorkerCommand {
    Call { method: String, payload: Value, reply: Sender<Result<Value, String>> },
    StartBackend,
    StopBackend,
    Quit,
}

/// Cloneable UI-side handle for RPC calls (cheap to pass around, so no
/// self-borrow survives across a mutation).
#[derive(Clone)]
pub struct BackendHandle {
    commands: Sender<WorkerCommand>,
    client: DshClient,
}

impl BackendHandle {
    /// One unary RPC executed on the worker thread (keeps the UI responsive).
    pub fn call(&self, method: &str, payload: Value) -> Result<Value, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.commands
            .send(WorkerCommand::Call { method: method.to_string(), payload, reply: reply_tx })
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

    /// Ask the worker to (re)start the sidecar backend.
    pub fn start_backend(&self) {
        let _ = self.commands.send(WorkerCommand::StartBackend);
    }

    /// Ask the worker to stop the backend (graceful first, then tree cleanup).
    pub fn stop_backend(&self) {
        let _ = self.commands.send(WorkerCommand::StopBackend);
    }

    /// Ask the worker to stop the backend and exit.
    pub fn quit(&self) {
        let _ = self.commands.send(WorkerCommand::Quit);
    }
}

/// UI-side backend bridge: a cloneable RPC handle plus the worker event queue.
pub struct Backend {
    handle: BackendHandle,
    events: Receiver<Event>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Backend {
    /// Spawn the worker. `sidecar` is the argv used to start `dsh web`
    /// (None disables sidecar management for externally-owned backends).
    pub fn connect(base: &str, sidecar: Option<Vec<String>>) -> Result<Self, String> {
        let client = DshClient::new(base).map_err(|error| error.to_string())?;
        let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>();
        let (event_tx, event_rx) = mpsc::channel::<Event>();
        let worker_client = client.clone();
        let worker = thread::Builder::new()
            .name("dsh-backend".to_string())
            .spawn(move || worker_loop(worker_client, sidecar, command_rx, event_tx))
            .map_err(|error| format!("worker spawn failed: {error}"))?;
        Ok(Backend {
            handle: BackendHandle { commands: command_tx, client },
            events: event_rx,
            worker: Some(worker),
        })
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

    /// Stop the backend (graceful first, tree cleanup after) and join the
    /// worker. Blocking by design: the caller is exiting.
    pub fn shutdown(self) {
        self.handle.quit();
        if let Some(worker) = self.worker {
            let _ = worker.join();
        }
    }
}

/// Spawn the dsh sidecar with a hidden console on Windows. `dsh` is an npm
/// `.cmd` shim, which CreateProcess cannot execute directly — route it
/// through `cmd /C` like any shell invocation.
#[cfg(target_os = "windows")]
fn spawn_sidecar(argv: &[String]) -> std::io::Result<Child> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("cmd");
    command.arg("/C");
    for arg in argv {
        command.arg(arg);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    command.spawn()
}

#[cfg(not(target_os = "windows"))]
fn spawn_sidecar(argv: &[String]) -> std::io::Result<Child> {
    let (program, args) = argv.split_first().expect("sidecar argv is non-empty");
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.spawn()
}

/// Kill the whole sidecar process tree we own (`cmd /C dsh web` nests
/// cmd/node descendants).
#[cfg(target_os = "windows")]
fn kill_tree(child: &mut Child) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(not(target_os = "windows"))]
fn kill_tree(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Worker loop: serve RPC commands, manage the sidecar, keep the downlink
/// connected, pump frames, emit heartbeats.
fn worker_loop(
    client: DshClient,
    sidecar: Option<Vec<String>>,
    commands: Receiver<WorkerCommand>,
    events: Sender<Event>,
) {
    let mut child: Option<Child> = None;
    let mut downlink: Option<WsDownlink> = None;
    let mut last_status = Instant::now() - Duration::from_secs(10);

    loop {
        // Commands first (an RPC may take seconds; frames stay buffered).
        let mut quit = false;
        while let Ok(command) = commands.try_recv() {
            match command {
                WorkerCommand::Call { method, payload, reply } => {
                    let result = client.call(&method, payload).map_err(|error| error.to_string());
                    if reply.send(result).is_err() {
                        cleanup_child(&mut child);
                        return;
                    }
                }
                WorkerCommand::StartBackend => {
                    ensure_runtime(&client, sidecar.as_deref(), &mut child, &events);
                }
                WorkerCommand::StopBackend => {
                    stop_runtime(&client, &mut child);
                }
                WorkerCommand::Quit => {
                    quit = true;
                    break;
                }
            }
        }
        if quit {
            stop_runtime(&client, &mut child);
            return;
        }

        // Heartbeat every two seconds.
        if last_status.elapsed() >= Duration::from_secs(2) {
            last_status = Instant::now();
            let _ = events.send(Event::Status(BackendStatus {
                running: client.health(),
                owned: child.is_some(),
            }));
        }

        // Keep the backend up when we manage it.
        if sidecar.is_some() && !client.health() {
            ensure_runtime(&client, sidecar.as_deref(), &mut child, &events);
            downlink = None;
        }

        if downlink.is_none() {
            match WsDownlink::connect(&client, "/api/events.mux") {
                Ok(link) => {
                    downlink = Some(link);
                    if events.send(Event::Reconnected).is_err() {
                        cleanup_child(&mut child);
                        return;
                    }
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(800));
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
                        cleanup_child(&mut child);
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

/// Kill the owned process tree (used on worker exit paths without a Quit).
fn cleanup_child(child: &mut Option<Child>) {
    if let Some(existing) = child.as_mut() {
        kill_tree(existing);
    }
    *child = None;
}

/// Start the sidecar when the backend is down (no-op when an external
/// backend answers, or when sidecar management is disabled).
fn ensure_runtime(
    client: &DshClient,
    sidecar: Option<&[String]>,
    child: &mut Option<Child>,
    events: &Sender<Event>,
) {
    if client.health() {
        return;
    }
    let Some(argv) = sidecar else { return };
    // Drop a dead handle before respawning.
    if let Some(existing) = child.as_mut() {
        if existing.try_wait().ok().flatten().is_some() {
            *child = None;
        }
    }
    if child.is_none() {
        match spawn_sidecar(argv) {
            Ok(spawned) => {
                *child = Some(spawned);
                let _ = events.send(Event::Status(BackendStatus { running: false, owned: true }));
            }
            Err(error) => {
                let _ = events.send(Event::Status(BackendStatus { running: false, owned: false }));
                let _ = events.send(Event::DownlinkError(format!("未找到可用的 dsh 命令：{error}")));
            }
        }
    }
    if child.is_some() {
        // Wait up to 30s for the sidecar to start answering.
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline && !client.health() {
            thread::sleep(Duration::from_millis(250));
        }
    }
}

/// Stop sequence: graceful `/api/shutdown`, brief wait, then tree cleanup
/// for the child we own. Backends without the shutdown route skip the wait
/// and go straight to the tree cleanup.
fn stop_runtime(client: &DshClient, child: &mut Option<Child>) {
    let graceful = client.request_shutdown();
    if graceful {
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline && client.health() {
            thread::sleep(Duration::from_millis(200));
        }
    }
    if !client.health() {
        // The backend exited on its own; reap the handle if we own one.
        if let Some(existing) = child.as_mut() {
            let _ = existing.wait();
        }
        *child = None;
        return;
    }
    if let Some(existing) = child.as_mut() {
        kill_tree(existing);
    }
    *child = None;
}
