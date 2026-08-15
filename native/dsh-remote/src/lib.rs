//! `dsh-remote`: a dependency-light Rust client for the DeepSeek Harness
//! web API — unary RPC over `POST /api/<method>` envelopes and WebSocket
//! event downlinks, implemented over `std::net::TcpStream` so the crate
//! builds offline (no TLS, no async runtime; the channel is local plain HTTP).
//!
//! Wire contract (pinned in `docs/native-client.md`):
//! - client-request  `{type, rpcId, method, payload}`
//! - server-response `{type, rpcId, result}`, `result = {ok:true, value?} | {ok:false, error}`
//! - server-request  `{type, rpcId, method, payload}` (event frames + answerable pushes)
//! - client-response `{type, rpcId, result}` (answers a server-request)

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod chat;
pub mod model;
use std::fmt;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Maximum bytes buffered for one HTTP response or WebSocket frame.
const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;
/// Maximum bytes buffered for one HTTP handshake header block.
const MAX_HEADER_BYTES: usize = 16 * 1024;

// ---------------------------------------------------------------------------
// Errors

/// Every failure a client call can surface.
#[derive(Debug)]
pub enum RemoteError {
    /// TCP-level or DNS failure.
    Connect(String),
    /// Carrier-level HTTP failure (business errors ride 200 and are `Rpc`).
    Http { status: u16, body: String },
    /// Socket read/write failure.
    Io(String),
    /// Invalid JSON anywhere on the wire.
    Json(String),
    /// Protocol violation (bad frame, missing fields).
    Protocol(String),
    /// Business error inside a 200 `server-response`.
    Rpc { code: String, message: String, details: Option<Value> },
}

impl fmt::Display for RemoteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RemoteError::Connect(detail) => write!(f, "connect failed: {detail}"),
            RemoteError::Http { status, body } => {
                write!(f, "http {status}: {}", truncate_for_display(body))
            }
            RemoteError::Io(detail) => write!(f, "io error: {detail}"),
            RemoteError::Json(detail) => write!(f, "json error: {detail}"),
            RemoteError::Protocol(detail) => write!(f, "protocol error: {detail}"),
            RemoteError::Rpc { code, message, .. } => write!(f, "rpc {code}: {message}"),
        }
    }
}

impl std::error::Error for RemoteError {}

fn truncate_for_display(text: &str) -> String {
    const CAP: usize = 200;
    if text.len() <= CAP {
        text.to_string()
    } else {
        format!("{}…(+{} bytes)", &text[..CAP], text.len() - CAP)
    }
}

// ---------------------------------------------------------------------------
// Wire envelopes

/// The four wire full forms share this result body.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RpcResultBody {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcErrorBody>,
}

/// Business error inside `{ok:false, error}`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RpcErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

/// Outgoing unary request.
#[derive(Serialize, Debug)]
struct ClientRequest<'a> {
    #[serde(rename = "type")]
    typ: &'static str,
    #[serde(rename = "rpcId")]
    rpc_id: String,
    method: &'a str,
    payload: Value,
}

/// Incoming unary response.
#[derive(Deserialize, Debug, Clone)]
pub struct ServerResponse {
    #[serde(rename = "type")]
    pub typ: String,
    #[serde(rename = "rpcId")]
    pub rpc_id: String,
    pub result: RpcResultBody,
}

/// Incoming server-initiated message: event frame or answerable push.
#[derive(Deserialize, Debug, Clone)]
pub struct ServerRequest {
    #[serde(rename = "type")]
    pub typ: String,
    #[serde(rename = "rpcId")]
    pub rpc_id: String,
    pub method: String,
    pub payload: Value,
}

/// Outgoing answer to a server-request.
#[derive(Serialize, Debug)]
struct ClientResponse {
    #[serde(rename = "type")]
    typ: &'static str,
    #[serde(rename = "rpcId")]
    rpc_id: String,
    result: RpcResultBody,
}

/// Receipt returned by `POST /api/respond`.
#[derive(Deserialize, Debug, Clone)]
pub struct RespondReceipt {
    pub accepted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// RPC client

/// Handle for unary RPC against one dsh web server.
#[derive(Debug, Clone)]
pub struct DshClient {
    host: String,
    port: u16,
    seq: Arc<AtomicU64>,
}

impl DshClient {
    /// Build a client for a base URL like `http://127.0.0.1:3080`.
    /// Fails loudly when the URL is not `http://host[:port]`.
    pub fn new(base: &str) -> Result<Self, RemoteError> {
        let rest = base
            .trim_end_matches('/')
            .strip_prefix("http://")
            .ok_or_else(|| RemoteError::Protocol(format!("unsupported base URL (http only): {base}")))?;
        let authority = rest
            .split('/')
            .next()
            .ok_or_else(|| RemoteError::Protocol(format!("base URL has no authority: {base}")))?;
        let (host, port) = match authority.rsplit_once(':') {
            Some((h, p)) => (
                h.to_string(),
                p.parse::<u16>()
                    .map_err(|_| RemoteError::Protocol(format!("bad port in base URL: {base}")))?,
            ),
            None => (authority.to_string(), 80),
        };
        if host.is_empty() {
            return Err(RemoteError::Protocol(format!("base URL has no host: {base}")));
        }
        Ok(DshClient {
            host,
            port,
            seq: Arc::new(AtomicU64::new(0)),
        })
    }

    fn next_rpc_id(&self) -> String {
        format!(
            "rs-{}-{}-{}",
            std::process::id(),
            now_millis(),
            self.seq.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn socket_addr(&self) -> Result<SocketAddr, RemoteError> {
        (self.host.as_str(), self.port)
            .to_socket_addrs()
            .map_err(|error| RemoteError::Connect(format!("resolve {}:{}: {error}", self.host, self.port)))?
            .next()
            .ok_or_else(|| RemoteError::Connect(format!("no address for {}:{}", self.host, self.port)))
    }

    /// One `POST /api/<method>` envelope call. Returns the business value on
    /// `{ok:true}` (possibly `Value::Null` for void results).
    pub fn call(&self, method: &str, payload: Value) -> Result<Value, RemoteError> {
        let envelope = ClientRequest {
            typ: "client-request",
            rpc_id: self.next_rpc_id(),
            method,
            payload,
        };
        let body = serde_json::to_vec(&envelope)
            .map_err(|error| RemoteError::Json(error.to_string()))?;
        let (status, response_body) = self.http_post(&format!("/api/{method}"), &body)?;
        if status != 200 {
            return Err(RemoteError::Http {
                status,
                body: String::from_utf8_lossy(&response_body).into_owned(),
            });
        }
        let response: ServerResponse = serde_json::from_slice(&response_body)
            .map_err(|error| RemoteError::Json(format!("server-response: {error}")))?;
        if response.typ != "server-response" {
            return Err(RemoteError::Protocol(format!(
                "expected server-response, got {}",
                response.typ
            )));
        }
        match response.result {
            RpcResultBody { ok: true, value, .. } => Ok(value.unwrap_or(Value::Null)),
            RpcResultBody { ok: false, error: Some(error), .. } => Err(RemoteError::Rpc {
                code: error.code,
                message: error.message,
                details: error.details,
            }),
            other => Err(RemoteError::Protocol(format!("malformed result body: {other:?}"))),
        }
    }

    /// Convenience for the many methods whose payload is the empty object.
    pub fn call_empty(&self, method: &str) -> Result<Value, RemoteError> {
        self.call(method, serde_json::json!({}))
    }

    /// Answer a server-request (approval or question) through `POST /api/respond`.
    pub fn respond(&self, rpc_id: &str, value: Value) -> Result<RespondReceipt, RemoteError> {
        let envelope = ClientResponse {
            typ: "client-response",
            rpc_id: rpc_id.to_string(),
            result: RpcResultBody { ok: true, value: Some(value), error: None },
        };
        let body = serde_json::to_vec(&envelope)
            .map_err(|error| RemoteError::Json(error.to_string()))?;
        let (status, response_body) = self.http_post("/api/respond", &body)?;
        if status != 200 {
            return Err(RemoteError::Http {
                status,
                body: String::from_utf8_lossy(&response_body).into_owned(),
            });
        }
        serde_json::from_slice(&response_body)
            .map_err(|error| RemoteError::Json(format!("respond receipt: {error}")))
    }

    /// Raw HTTP POST with Content-Type json and Connection close.
    fn http_post(&self, path: &str, body: &[u8]) -> Result<(u16, Vec<u8>), RemoteError> {
        let address = self.socket_addr()?;
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
            .map_err(|error| RemoteError::Connect(format!("{address}: {error}")))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(120)))
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(30)))
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        let authority = format!("{}:{}", self.host, self.port);
        let head = format!(
            "POST {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream
            .write_all(head.as_bytes())
            .and_then(|_| stream.write_all(body))
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        let mut raw = Vec::new();
        stream
            .take(MAX_BODY_BYTES as u64 + MAX_HEADER_BYTES as u64)
            .read_to_end(&mut raw)
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        parse_http_response(&raw)
    }
}

/// Split one full HTTP/1.x response: status code and decoded body. The dsh
/// server answers with `Transfer-Encoding: chunked` (no Content-Length), so
/// the body is chunk-decoded; Content-Length responses are sliced, and a
/// plain close-delimited body is used as-is.
fn parse_http_response(raw: &[u8]) -> Result<(u16, Vec<u8>), RemoteError> {
    let header_end = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| {
            let preview = String::from_utf8_lossy(&raw[..raw.len().min(200)]);
            RemoteError::Protocol(format!(
                "response has no header terminator (len={}, head={preview:?})",
                raw.len()
            ))
        })?;
    let headers = std::str::from_utf8(&raw[..header_end])
        .map_err(|error| RemoteError::Protocol(format!("non-utf8 response headers: {error}")))?;
    let status_line = headers
        .lines()
        .next()
        .ok_or_else(|| RemoteError::Protocol("empty response".to_string()))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|part| part.parse::<u16>().ok())
        .ok_or_else(|| RemoteError::Protocol(format!("unparsable status line: {status_line}")))?;
    let body_raw = &raw[header_end + 4..];
    let lower = headers.to_ascii_lowercase();
    if lower
        .lines()
        .any(|line| line.starts_with("transfer-encoding:") && line.contains("chunked"))
    {
        return Ok((status, decode_chunked(body_raw)?));
    }
    let body = match lower
        .lines()
        .find(|line| line.starts_with("content-length:"))
        .and_then(|line| line.split(':').nth(1))
        .and_then(|value| value.trim().parse::<usize>().ok())
    {
        Some(length) => body_raw[..length.min(body_raw.len())].to_vec(),
        None => body_raw.to_vec(),
    };
    Ok((status, body))
}

/// Decode an RFC 7230 chunked body (chunk extensions and trailers ignored).
fn decode_chunked(mut input: &[u8]) -> Result<Vec<u8>, RemoteError> {
    let mut out = Vec::new();
    loop {
        let line_end = input
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| RemoteError::Protocol("chunk size line unterminated".to_string()))?;
        let size_text = std::str::from_utf8(&input[..line_end])
            .map_err(|error| RemoteError::Protocol(format!("non-utf8 chunk size: {error}")))?
            .split(';')
            .next()
            .unwrap_or_default();
        let size = usize::from_str_radix(size_text.trim(), 16)
            .map_err(|error| RemoteError::Protocol(format!("bad chunk size {size_text:?}: {error}")))?;
        input = &input[line_end + 2..];
        if size == 0 {
            return Ok(out);
        }
        if input.len() < size + 2 {
            return Err(RemoteError::Protocol("chunk truncated".to_string()));
        }
        out.extend_from_slice(&input[..size]);
        input = &input[size + 2..];
    }
}

// ---------------------------------------------------------------------------
// WebSocket downlink

/// One server-initiated frame off an event downlink.
pub type Frame = ServerRequest;

/// Connected WebSocket downlink. The reader thread owns the socket; dropping
/// this handle best-effort sends a close frame and stops the receiver.
pub struct WsDownlink {
    writer: TcpStream,
    rx: Receiver<Result<Frame, RemoteError>>,
    _reader: Option<thread::JoinHandle<()>>,
}

impl WsDownlink {
    /// Open a downlink at `/api/events.mux` or `/api/events.host`.
    pub fn connect(client: &DshClient, path: &str) -> Result<Self, RemoteError> {
        let address = client.socket_addr()?;
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
            .map_err(|error| RemoteError::Connect(format!("{address}: {error}")))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(180)))
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(30)))
            .map_err(|error| RemoteError::Io(error.to_string()))?;
        let authority = format!("{}:{}", client.host, client.port);
        let key = base64(&nonce_bytes());
        let handshake = format!(
            "GET {path} HTTP/1.1\r\nHost: {authority}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream
            .write_all(handshake.as_bytes())
            .map_err(|error| RemoteError::Io(error.to_string()))?;

        let mut reader = BufReader::new(stream.try_clone().map_err(|error| RemoteError::Io(error.to_string()))?);
        let mut header_bytes = Vec::new();
        loop {
            if header_bytes.len() > MAX_HEADER_BYTES {
                return Err(RemoteError::Protocol("upgrade response headers too large".to_string()));
            }
            let mut line = String::new();
            let read = reader
                .read_line(&mut line)
                .map_err(|error| RemoteError::Io(error.to_string()))?;
            if read == 0 {
                return Err(RemoteError::Protocol("connection closed during upgrade".to_string()));
            }
            if line == "\r\n" || line == "\n" || line.is_empty() {
                break;
            }
            header_bytes.extend_from_slice(line.as_bytes());
        }
        let status_line = String::from_utf8_lossy(&header_bytes)
            .lines()
            .next()
            .map(str::to_string)
            .unwrap_or_default();
        if !status_line.contains("101") {
            return Err(RemoteError::Http {
                status: 426,
                body: status_line,
            });
        }

        let (tx, rx) = mpsc::channel();
        let writer = stream.try_clone().map_err(|error| RemoteError::Io(error.to_string()))?;
        let reader_thread = thread::spawn(move || {
            read_frames(reader, writer, tx);
        });
        Ok(WsDownlink { writer: stream, rx, _reader: Some(reader_thread) })
    }

    /// Next frame; `None` when the downlink closed cleanly.
    pub fn next(&self) -> Option<Result<Frame, RemoteError>> {
        match self.rx.recv() {
            Ok(frame) => Some(frame),
            Err(_) => None,
        }
    }

    /// Next frame with a timeout; `None` on timeout or clean close.
    pub fn next_timeout(&self, timeout: Duration) -> Option<Result<Frame, RemoteError>> {
        match self.rx.recv_timeout(timeout) {
            Ok(frame) => Some(frame),
            Err(mpsc::RecvTimeoutError::Timeout) => None,
            Err(mpsc::RecvTimeoutError::Disconnected) => None,
        }
    }

    /// Send a WS close frame (downlink-only protocol: the only legal client frame).
    pub fn close(&self) {
        let _ = send_frame(&mut &self.writer, 0x8, &[]);
    }
}

impl Drop for WsDownlink {
    fn drop(&mut self) {
        let _ = send_frame(&mut &self.writer, 0x8, &[]);
        let _ = self.writer.shutdown(std::net::Shutdown::Both);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Opcode {
    Continuation,
    Text,
    Binary,
    Close,
    Ping,
    Pong,
}

fn opcode_of(byte: u8) -> Result<Opcode, RemoteError> {
    match byte {
        0x0 => Ok(Opcode::Continuation),
        0x1 => Ok(Opcode::Text),
        0x2 => Ok(Opcode::Binary),
        0x8 => Ok(Opcode::Close),
        0x9 => Ok(Opcode::Ping),
        0xA => Ok(Opcode::Pong),
        other => Err(RemoteError::Protocol(format!("unknown opcode 0x{other:x}"))),
    }
}

/// Reader loop: handshake done; pull frames until close/EOF, dispatch text
/// frames as JSON `ServerRequest`, answer pings, send results down the channel.
fn read_frames(
    mut reader: BufReader<TcpStream>,
    mut writer: TcpStream,
    tx: mpsc::Sender<Result<Frame, RemoteError>>,
) {
    let mut fragments: Vec<u8> = Vec::new();
    loop {
        let frame = match read_frame(&mut reader) {
            Ok(Some(frame)) => frame,
            Ok(None) => break, // EOF: clean close
            Err(error) => {
                let _ = tx.send(Err(error));
                break;
            }
        };
        match frame.opcode {
            Opcode::Ping => {
                let _ = send_frame(&mut writer, 0xA, &frame.payload);
            }
            Opcode::Pong => {}
            Opcode::Close => {
                let _ = send_frame(&mut writer, 0x8, &[]);
                break;
            }
            Opcode::Text | Opcode::Binary | Opcode::Continuation => {
                if frame.opcode == Opcode::Continuation && fragments.is_empty() {
                    let _ = tx.send(Err(RemoteError::Protocol("continuation without start frame".to_string())));
                    break;
                }
                fragments.extend_from_slice(&frame.payload);
                if frame.fin {
                    let text = String::from_utf8(std::mem::take(&mut fragments));
                    let result = match text {
                        Ok(text) => serde_json::from_str::<ServerRequest>(&text)
                            .map_err(|error| RemoteError::Json(format!("frame: {error}"))),
                        Err(error) => Err(RemoteError::Protocol(format!("non-utf8 text frame: {error}"))),
                    };
                    if tx.send(result).is_err() {
                        break;
                    }
                }
            }
        }
    }
}

struct RawFrame {
    fin: bool,
    opcode: Opcode,
    payload: Vec<u8>,
}

/// One RFC 6455 frame from the server (server frames are never masked).
fn read_frame(reader: &mut BufReader<TcpStream>) -> Result<Option<RawFrame>, RemoteError> {
    let mut head = [0u8; 2];
    match reader.read_exact(&mut head) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(RemoteError::Io(error.to_string())),
    }
    let fin = head[0] & 0x80 != 0;
    let opcode = opcode_of(head[0] & 0x0f)?;
    let masked = head[1] & 0x80 != 0;
    if masked {
        return Err(RemoteError::Protocol("server frame is masked (RFC violation)".to_string()));
    }
    let mut len = (head[1] & 0x7f) as u64;
    if len == 126 {
        let mut ext = [0u8; 2];
        reader.read_exact(&mut ext).map_err(|error| RemoteError::Io(error.to_string()))?;
        len = u16::from_be_bytes(ext) as u64;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        reader.read_exact(&mut ext).map_err(|error| RemoteError::Io(error.to_string()))?;
        len = u64::from_be_bytes(ext);
    }
    if len > MAX_BODY_BYTES as u64 {
        return Err(RemoteError::Protocol(format!("frame of {len} bytes exceeds cap")));
    }
    let mut payload = vec![0u8; len as usize];
    reader.read_exact(&mut payload).map_err(|error| RemoteError::Io(error.to_string()))?;
    Ok(Some(RawFrame { fin, opcode, payload }))
}

/// Write one client frame. RFC 6455 requires client frames to be masked;
/// the `ws` server enforces that even for a close frame.
fn send_frame(mut stream: impl Write, opcode: u8, payload: &[u8]) -> std::io::Result<()> {
    let mut head = vec![0x80 | opcode];
    if payload.len() <= 125 {
        head.push(0x80 | payload.len() as u8);
    } else if payload.len() <= u16::MAX as usize {
        head.push(0x80 | 126);
        head.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        head.push(0x80 | 127);
        head.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }
    let mask = nonce_bytes();
    head.extend_from_slice(&mask[..4]);
    stream.write_all(&head)?;
    let masked: Vec<u8> = payload
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ mask[index % 4])
        .collect();
    stream.write_all(&masked)?;
    stream.flush()
}

// ---------------------------------------------------------------------------
// Small std-only helpers

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 16 semi-random bytes for the WS handshake nonce and frame masks.
/// RFC 6455 only asks for an unpredictable value; timestamp/pid/index mixing
/// is sufficient for a local loopback channel.
fn nonce_bytes() -> [u8; 16] {
    let mut bytes = [0u8; 16];
    let millis = now_millis();
    let pid = std::process::id();
    for (index, slot) in bytes.iter_mut().enumerate() {
        let mixed = millis
            .wrapping_mul(0x9E3779B97F4A7C15)
            .wrapping_add((pid as u128) << 32)
            .wrapping_add((index as u128).wrapping_mul(0x517CC1B727220A95));
        *slot = ((mixed >> ((index % 8) * 8)) as u8) ^ (index as u8).wrapping_mul(31);
    }
    bytes
}

/// Standard base64 over bytes (no padding needed for 16-byte nonce).
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}
