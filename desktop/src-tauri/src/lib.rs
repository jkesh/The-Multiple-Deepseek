use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use serde::Serialize;
use tauri::{Manager, WebviewWindow};
use url::Url;

const DSH_URL: &str = "http://127.0.0.1:3080";
const HEALTH_PATH: &str = "/api/health";
const SHUTDOWN_PATH: &str = "/api/shutdown";
const BOOT_MARKER: &[u8] = b"window.__DSH_BOOT__";
const MAX_RESPONSE_BYTES: u64 = 64 * 1024;

struct RuntimeState(Mutex<Option<Child>>);

/// One short best-effort HTTP exchange with the local DSH service.
/// Returns the response status code and body, or `None` when unreachable.
fn http_exchange(method: &str, path: &str) -> Option<(u16, Vec<u8>)> {
    let address = "127.0.0.1:3080".to_socket_addrs().ok()?.next()?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(300)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let request = format!("{method} {path} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = Vec::with_capacity(1024);
    stream
        .take(MAX_RESPONSE_BYTES)
        .read_to_end(&mut response)
        .ok()?;
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")?;
    let status = std::str::from_utf8(&response[..header_end])
        .ok()?
        .lines()
        .next()?;
    let code = status.split_whitespace().nth(1)?.parse::<u16>().ok()?;
    Some((code, response[header_end + 4..].to_vec()))
}

/// The service counts as ready when its `/api/health` endpoint answers
/// `200 {"ok":true}`. Older dsh builds without that route fall back to the
/// boot-marker scan of the served index page.
fn service_ready() -> bool {
    if let Some((200, body)) = http_exchange("GET", HEALTH_PATH) {
        if body.windows(9).any(|window| window == b"{\"ok\":true}") {
            return true;
        }
    }
    matches!(
        http_exchange("GET", "/"),
        Some((200, body)) if body.windows(BOOT_MARKER.len()).any(|window| window == BOOT_MARKER)
    )
}

/// Ask the service to shut down over its control route. True when acknowledged.
fn request_shutdown() -> bool {
    matches!(http_exchange("POST", SHUTDOWN_PATH), Some((200 | 202, _)))
}

/// Drop a dead child handle and report the pid of a child we still own, if any.
fn owns_live_child(state: &RuntimeState) -> Option<u32> {
    let Ok(mut runtime) = state.0.lock() else {
        return None;
    };
    let pid = match runtime.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => Some(child.id()),
            _ => {
                *runtime = None;
                None
            }
        },
        None => None,
    };
    pid
}

#[cfg(target_os = "windows")]
fn dsh_command() -> Command {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: run the dsh sidecar without flashing a console window.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("cmd");
    command.args(["/C", "dsh", "web"]);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(target_os = "windows"))]
fn dsh_command() -> Command {
    let mut command = Command::new("dsh");
    command.arg("web");
    command
}

fn ensure_runtime(state: &RuntimeState) -> Result<(), String> {
    if service_ready() {
        return Ok(());
    }
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "DSH 运行时状态不可用".to_string())?;
    if runtime
        .as_mut()
        .is_some_and(|child| child.try_wait().ok().flatten().is_some())
    {
        *runtime = None;
    }
    if runtime.is_none() {
        let child = dsh_command()
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("未找到可用的 dsh 命令。请先安装 @deepseek-ai/dsh：{error}"))?;
        *runtime = Some(child);
    }
    drop(runtime);

    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if service_ready() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err("DSH 服务在 30 秒内没有监听 127.0.0.1:3080。请在终端运行 dsh web 查看启动错误。".to_string())
}

/// Snapshot for the frontend control panel: is the backend alive, and do we own it.
#[derive(Clone, Serialize)]
struct BackendStatus {
    running: bool,
    owned: bool,
    pid: Option<u32>,
}

#[tauri::command]
async fn backend_status(state: tauri::State<'_, RuntimeState>) -> Result<BackendStatus, String> {
    let pid = owns_live_child(&state);
    Ok(BackendStatus {
        running: service_ready(),
        owned: pid.is_some(),
        pid,
    })
}

#[tauri::command]
async fn launch_dsh(window: WebviewWindow, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    ensure_runtime(&state)?;
    let url = Url::parse(DSH_URL).map_err(|error| error.to_string())?;
    window
        .navigate(url)
        .map_err(|error| format!("无法打开 DSH 页面：{error}"))
}

/// Stop the backend: prefer the graceful `/api/shutdown` command, then kill
/// the child tree we own when the service stays up past the grace period.
#[tauri::command]
async fn stop_dsh(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    request_shutdown();
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline && service_ready() {
        thread::sleep(Duration::from_millis(200));
    }
    if !service_ready() {
        return Ok(());
    }
    if owns_live_child(&state).is_some() {
        stop_runtime(&state);
        return Ok(());
    }
    Err("DSH 服务已收到关闭指令但仍在运行；它并非由本程序启动，未强制结束。".to_string())
}

fn take_runtime(state: &RuntimeState) -> Option<Child> {
    state.0.lock().ok().and_then(|mut runtime| runtime.take())
}

/// Stop the dsh sidecar we own. The child is `cmd /C dsh web`; killing only
/// that direct process leaves the nested `cmd`/`node` descendants behind, so
/// on Windows the whole tree is terminated with `taskkill /T` first.
#[cfg(target_os = "windows")]
fn stop_runtime(state: &RuntimeState) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let Some(mut child) = take_runtime(state) else {
        return;
    };
    let pid = child.id();
    let pid_arg = pid.to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid_arg, "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    // Fallback in case taskkill is unavailable; also reaps the child handle.
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(not(target_os = "windows"))]
fn stop_runtime(state: &RuntimeState) {
    if let Some(mut child) = take_runtime(state) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Close sequence: ask the backend to exit, wait briefly, then kill the child
/// tree we own if the service is still answering.
fn shutdown_runtime(state: &RuntimeState) {
    request_shutdown();
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline && service_ready() {
        thread::sleep(Duration::from_millis(200));
    }
    if service_ready() {
        stop_runtime(state);
    } else if let Some(mut child) = take_runtime(state) {
        // The backend exited on its own; reap the handle.
        let _ = child.wait();
    }
}

/// Panel injected into every page of the webview (app origin and the remote
/// DSH page alike): polls `backend_status` as the heartbeat, shows whether
/// the backend is running, and offers start/stop controls.
const PANEL_SCRIPT: &str = r#"
;(function () {
  'use strict'
  if (!window.isTauri) return
  if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') return

  function invoke(cmd) {
    var internals = window.__TAURI_INTERNALS__
    if (internals && typeof internals.invoke === 'function') return internals.invoke(cmd)
    return Promise.reject(new Error('Tauri IPC 不可用'))
  }

  function mount() {
    if (document.getElementById('__dsh_tmd_panel_host__')) return
    if (!document.body) return

    var host = document.createElement('div')
    host.id = '__dsh_tmd_panel_host__'
    host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483000'
    document.body.appendChild(host)

    var root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<style>' +
      ':host{all:initial}' +
      '.card{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;' +
      'background:rgba(22,24,29,.92);color:#f2f3f5;font:13px/1.4 Segoe UI,Inter,sans-serif;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.35);user-select:none}' +
      '.dot{width:9px;height:9px;border-radius:50%;flex:none}' +
      '.dot.running{background:#3ddc84}' +
      '.dot.stopped{background:#f2544b}' +
      '.dot.starting{background:#f5b944}' +
      '.label{white-space:nowrap}' +
      'button{min-height:26px;padding:3px 10px;border:1px solid rgba(255,255,255,.28);' +
      'border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}' +
      'button:hover{background:rgba(255,255,255,.12)}' +
      'button:disabled{opacity:.45;cursor:default}' +
      '</style>' +
      '<div class="card">' +
      '<span class="dot starting"></span>' +
      '<span class="label">正在检测后台状态...</span>' +
      '<button class="stop" style="display:none">停止后台</button>' +
      '<button class="start" style="display:none">启动后台</button>' +
      '</div>'

    var dot = root.querySelector('.dot')
    var label = root.querySelector('.label')
    var stopButton = root.querySelector('.stop')
    var startButton = root.querySelector('.start')
    var busy = false

    function render(status) {
      if (busy) return
      dot.className = 'dot ' + (status.running ? 'running' : 'stopped')
      label.textContent = status.running
        ? '后台运行中' + (status.owned ? '' : '（外部进程）')
        : '后台已停止'
      stopButton.style.display = status.running ? '' : 'none'
      startButton.style.display = status.running ? 'none' : ''
    }

    function setBusy(text) {
      busy = true
      dot.className = 'dot starting'
      label.textContent = text
      stopButton.style.display = 'none'
      startButton.style.display = 'none'
    }

    function errorText(reason) {
      if (typeof reason === 'string') return reason
      if (reason && reason.message) return String(reason.message)
      return String(reason || '未知错误')
    }

    function refresh() {
      invoke('backend_status').then(render).catch(function () {})
    }

    stopButton.addEventListener('click', function () {
      setBusy('正在停止后台...')
      invoke('stop_dsh').then(
        function () { busy = false; refresh() },
        function (reason) {
          busy = false
          dot.className = 'dot running'
          label.textContent = '停止失败：' + errorText(reason)
          stopButton.style.display = ''
        }
      )
    })

    startButton.addEventListener('click', function () {
      setBusy('正在启动后台...')
      invoke('launch_dsh').then(
        function () { busy = false },
        function (reason) {
          busy = false
          dot.className = 'dot stopped'
          label.textContent = '启动失败：' + errorText(reason)
          startButton.style.display = ''
        }
      )
    })

    refresh()
    setInterval(refresh, 2000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
})()
"#;

pub fn run() {
    let app = tauri::Builder::default()
        .append_invoke_initialization_script(PANEL_SCRIPT)
        .manage(RuntimeState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![launch_dsh, backend_status, stop_dsh])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<RuntimeState>() {
                    shutdown_runtime(&state);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build TMD desktop application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = app_handle.try_state::<RuntimeState>() {
                shutdown_runtime(&state);
            }
        }
    });
}
