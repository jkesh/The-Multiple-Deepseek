//! Debug probe for http_get / health.
use dsh_remote::DshClient;

fn main() {
    let client = DshClient::new("http://127.0.0.1:3080").unwrap();
    println!("health: {}", client.health());
    println!("request_shutdown: {}", client.request_shutdown());
}
