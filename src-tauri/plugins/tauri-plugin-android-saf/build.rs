const COMMANDS: &[&str] = &[
    "ping",
    "select_folder",
    "select_files",
    "solve_cloudflare",
    "enumerate_tree",
    "copy_document",
    "check_storage_permission",
    "open_app_settings",
    "create_document",
    "write_document",
    "create_file_in_tree",
    "delete_file_in_tree",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
