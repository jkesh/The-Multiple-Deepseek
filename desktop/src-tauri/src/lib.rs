use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};
use url::Url;

const DSH_URL: &str = "http://127.0.0.1:3080";

struct RuntimeState(Mutex<Option<Child>>);

fn service_ready() -> bool {
    let Some(address) = "127.0.0.1:3080".to_socket_addrs().ok().and_then(|mut values| values.next()) else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream.write_all(b"GET / HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
        return false;
    }
    let mut response = Vec::with_capacity(16 * 1024);
    stream.take(64 * 1024).read_to_end(&mut response).is_ok()
        && response.windows(b"window.__DSH_BOOT__".len()).any(|window| window == b"window.__DSH_BOOT__")
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
    let mut runtime = state.0.lock().map_err(|_| "DSH 运行时状态不可用".to_string())?;
    if runtime.as_mut().is_some_and(|child| child.try_wait().ok().flatten().is_some()) {
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

#[tauri::command]
async fn launch_dsh(window: WebviewWindow, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    ensure_runtime(&state)?;
    let url = Url::parse(DSH_URL).map_err(|error| error.to_string())?;
    window.navigate(url).map_err(|error| format!("无法打开 DSH 页面：{error}"))
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![launch_dsh])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<RuntimeState>() {
                    if let Ok(mut runtime) = state.0.lock() {
                        if let Some(child) = runtime.as_mut() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run TMD desktop application");
}
