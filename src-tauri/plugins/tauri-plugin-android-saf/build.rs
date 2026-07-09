const COMMANDS: &[&str] = &["ping", "select_folder", "select_files", "solve_cloudflare", "enumerate_tree", "copy_document"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
