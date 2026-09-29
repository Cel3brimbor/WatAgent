const COMMANDS: &[&str] = &["store_refresh_token", "load_refresh_token", "clear_session"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
