const COMMANDS: &[&str] = &[
    "ping",
    "start_oauth_login",
    "set_secure_token",
    "get_secure_token",
    "clear_secure_token",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
