//! Smoke probe: verify the dsh web API surface from a standalone Rust
//! process (read-only calls + a short events.mux listen).
//!
//! Usage: dsh-smoke [base-url] [listen-seconds]

use dsh_remote::{DshClient, WsDownlink};
use std::time::{Duration, Instant};

fn main() {
    let mut args = std::env::args().skip(1);
    let base = args.next().unwrap_or_else(|| "http://127.0.0.1:3080".to_string());
    let listen_secs = args
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(4);

    let client = match DshClient::new(&base) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("bad base URL: {error}");
            std::process::exit(2);
        }
    };

    let mut failures = 0u32;
    let mut step = |name: &str, result: Result<serde_json::Value, dsh_remote::RemoteError>| {
        match result {
            Ok(value) => println!("== {name} ==\n{}", value),
            Err(error) => {
                failures += 1;
                println!("== {name} == FAILED: {error}");
            }
        }
    };

    step("host.describe", client.call_empty("host.describe"));
    step("session.list", client.call_empty("session.list"));
    step("settings.describe", client.call_empty("settings.describe"));
    step("llm.models", client.call_empty("llm.models"));

    println!("== events.mux ({}s) ==", listen_secs);
    match WsDownlink::connect(&client, "/api/events.mux") {
        Ok(downlink) => {
            let deadline = Instant::now() + Duration::from_secs(listen_secs);
            let mut frames = 0u32;
            let mut methods: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
            while Instant::now() < deadline {
                match downlink.next_timeout(Duration::from_millis(250)) {
                    Some(Ok(frame)) => {
                        frames += 1;
                        *methods.entry(frame.method.clone()).or_default() += 1;
                        let preview = frame.payload.to_string();
                        let preview = if preview.len() > 160 { format!("{}…", &preview[..160]) } else { preview };
                        println!("  frame {} {} | {} | {preview}", frames, frame.rpc_id, frame.method);
                    }
                    Some(Err(error)) => {
                        failures += 1;
                        println!("  downlink error: {error}");
                        break;
                    }
                    None => {}
                }
            }
            downlink.close();
            println!("frames received: {frames}; by method: {methods:?}");
        }
        Err(error) => {
            failures += 1;
            println!("== events.mux == FAILED: {error}");
        }
    }

    if failures == 0 {
        println!("SMOKE OK");
    } else {
        println!("SMOKE FAILED ({failures} step(s))");
        std::process::exit(1);
    }
}
