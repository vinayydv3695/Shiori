const COMMANDS: &[&str] = &[
    "ping",
    "select_folder",
    "select_files",
    "solve_cloudflare",
    "enumerate_tree",
    "copy_document",
    "check_storage_permission",
    "open_app_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
