const COMMANDS: &[&str] = &["ping", "select_folder", "select_files"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
