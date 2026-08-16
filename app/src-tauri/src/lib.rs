//! Tauri shell for the DeepSeek Harness web client.
//!
//! Rust core (unchanged from the native client): dsh-remote transport and
//! typed domains, the sidecar lifecycle (heartbeat, spawn dsh web, start/stop,
//! graceful close), and a frame pump that forwards server events to the page.
//! The React frontend only renders; every protocol decision stays here.

use dsh_remote::{DshClient, Frame, WsDownlink};
use serde::Serialize;
use serde_json::Value;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use url::Url;

const DEFAULT_BASE: &str = "http://127.0.0.1:3080";

/// Shared runtime: the RPC client and the owned sidecar child.
struct Runtime {
    client: DshClient,
    child: Mutex<Option<Child>>,
}

impl Runtime {
    fn new(base: &str) -> Result<Self, String> {
        let client = DshClient::new(base).map_err(|error| error.to_string())?;
        Ok(Runtime { client, child: Mutex::new(None) })
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

/// Kill the whole sidecar process tree we own.
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

/// Sidecar argv for `dsh web`: DSH_SIDECAR_CMD overrides, DSH_NO_SIDECAR
/// disables sidecar management (external backends).
fn sidecar_argv() -> Option<Vec<String>> {
    if std::env::var("DSH_NO_SIDECAR").is_ok() {
        return None;
    }
    if let Ok(command) = std::env::var("DSH_SIDECAR_CMD") {
        let argv: Vec<String> = command.split_whitespace().map(str::to_string).collect();
        return if argv.is_empty() { None } else { Some(argv) };
    }
    Some(vec!["dsh".to_string(), "web".to_string()])
}

/// Start the sidecar when the backend is down (no-op when an external
/// backend answers, or when sidecar management is disabled).
fn ensure_runtime(runtime: &Runtime, sidecar: Option<&[String]>) {
    if runtime.client.health() {
        return;
    }
    let Some(argv) = sidecar else { return };
    let mut child = runtime.child.lock().expect("runtime child lock");
    if let Some(existing) = child.as_mut() {
        if existing.try_wait().ok().flatten().is_some() {
            *child = None;
        }
    }
    if child.is_none() {
        if let Ok(spawned) = spawn_sidecar(argv) {
            *child = Some(spawned);
        }
    }
    if child.is_some() {
        drop(child);
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline && !runtime.client.health() {
            thread::sleep(Duration::from_millis(250));
        }
    }
}

/// Stop sequence: graceful `/api/shutdown`, brief wait, then tree cleanup
/// for the child we own. Backends without the shutdown route skip the wait.
fn stop_runtime(runtime: &Runtime) {
    let graceful = runtime.client.request_shutdown();
    if graceful {
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline && runtime.client.health() {
            thread::sleep(Duration::from_millis(200));
        }
    }
    let mut child = runtime.child.lock().expect("runtime child lock");
    if runtime.client.health() {
        if let Some(existing) = child.as_mut() {
            kill_tree(existing);
        }
    } else if let Some(existing) = child.as_mut() {
        let _ = existing.wait();
    }
    *child = None;
}

/// Backend liveness facts for the page's status bar.
#[derive(Clone, Serialize)]
struct BackendStatus {
    running: bool,
    owned: bool,
    base: String,
}

fn current_status(runtime: &Runtime) -> BackendStatus {
    let owned = runtime
        .child
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false);
    BackendStatus {
        running: runtime.client.health(),
        owned,
        base: DEFAULT_BASE.to_string(),
    }
}

/// rpc_call: one unary RPC through the Rust core.
#[tauri::command]
async fn rpc_call(
    state: tauri::State<'_, Arc<Runtime>>,
    method: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime
            .client
            .call(&method, payload.unwrap_or(Value::Null))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("rpc task failed: {error}"))?
}

/// respond: answer an approval or question (client-response over /api/respond).
#[tauri::command]
async fn respond(
    state: tauri::State<'_, Arc<Runtime>>,
    rpc_id: String,
    value: Value,
) -> Result<dsh_remote::RespondReceipt, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime
            .client
            .respond(&rpc_id, value)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("respond task failed: {error}"))?
}

/// backend_status: heartbeat facts.
#[tauri::command]
fn backend_status(state: tauri::State<'_, Arc<Runtime>>) -> BackendStatus {
    current_status(&state)
}

/// start_backend: (re)start the sidecar.
#[tauri::command]
fn start_backend(state: tauri::State<'_, Arc<Runtime>>) -> BackendStatus {
    ensure_runtime(&state, sidecar_argv().as_deref());
    current_status(&state)
}

/// stop_backend: graceful stop + tree cleanup when owned.
#[tauri::command]
fn stop_backend(state: tauri::State<'_, Arc<Runtime>>) -> BackendStatus {
    stop_runtime(&state);
    current_status(&state)
}

/// health: raw heartbeat for the page.
#[tauri::command]
fn health(state: tauri::State<'_, Arc<Runtime>>) -> bool {
    state.client.health()
}

/// close_app: the page's own close path (auto-exit test hook and menu use).
#[tauri::command]
fn close_app(window: tauri::WebviewWindow) {
    let _ = window.close();
}

/// Frame pump: own the mux downlink on a dedicated thread and forward every
/// server frame plus periodic heartbeats to the page as Tauri events.
fn start_frame_pump(app: tauri::AppHandle, runtime: Arc<Runtime>) {
    thread::Builder::new()
        .name("dsh-frames".to_string())
        .spawn(move || {
            let mut downlink: Option<WsDownlink> = None;
            let mut last_status = Instant::now() - Duration::from_secs(10);
            loop {
                if last_status.elapsed() >= Duration::from_secs(2) {
                    last_status = Instant::now();
                    let _ = app.emit("backend-status", current_status(&runtime));
                }
                if downlink.is_none() {
                    match WsDownlink::connect(&runtime.client, "/api/events.mux") {
                        Ok(link) => downlink = Some(link),
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
                            if app.emit("frame", &frame).is_err() {
                                return;
                            }
                        }
                        Some(Err(_)) => {
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
        })
        .expect("frame pump spawn failed");
}

pub fn run() {
    let base = std::env::var("DSH_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE.to_string());
    let runtime = match Runtime::new(&base) {
        Ok(runtime) => Arc::new(runtime),
        Err(error) => {
            eprintln!("dsh-web-client: bad DSH_BASE_URL: {error}");
            std::process::exit(2);
        }
    };
    // Auto-exit test hook: the page asks for the close via close_app.
    let app = tauri::Builder::default()
        .manage(runtime.clone())
        .invoke_handler(tauri::generate_handler![
            rpc_call, respond, backend_status, start_backend, stop_backend, health, close_app
        ])
        .setup(move |app| {
            // Auto-exit test hook: close the window after N ms (exercises the
            // real close → graceful-stop path in smoke runs).
            if let Some(millis) = std::env::var("DSH_AUTO_EXIT_MS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
            {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(millis));
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.close();
                    }
                });
            }
            // Start the sidecar eagerly when we manage it, so the page opens
            // onto a live backend.
            if let Some(runtime_state) = app.try_state::<Arc<Runtime>>() {
                let sidecar = sidecar_argv();
                if sidecar.is_some() {
                    let runtime_clone = runtime_state.inner().clone();
                    thread::spawn(move || ensure_runtime(&runtime_clone, sidecar.as_deref()));
                }
            }
            start_frame_pump(app.handle().clone(), runtime.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(runtime_state) = window.try_state::<Arc<Runtime>>() {
                    stop_runtime(runtime_state.inner());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build dsh-web-client");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(runtime_state) = app_handle.try_state::<Arc<Runtime>>() {
                stop_runtime(runtime_state.inner());
            }
        }
    });
}

/// Keep the Url import honest: the shell navigates only to its own dist.
#[allow(dead_code)]
fn _parse(url: &str) -> Option<Url> {
    Url::parse(url).ok()
}

/// Keep Frame re-exported for tests.
#[allow(dead_code)]
fn _frame_type(_: &Frame) {}
