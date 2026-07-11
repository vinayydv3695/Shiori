fn main() {
    // Load .env at build time and forward secrets to the compiler via rustc-env.
    // .env lives at the project root; build.rs runs from src-tauri/.
    let env_paths = [
        std::path::Path::new("../.env"),
        std::path::Path::new(".env"),
    ];
    for path in &env_paths {
        if dotenvy::from_path(path).is_ok() {
            break;
        }
    }

    // Forward AniList secrets to the compiler with fallback defaults.
    // Builds work without .env — values fall back to empty strings.
    let vars: &[(&str, &str)] = &[
        ("ANILIST_DESKTOP_CLIENT_ID", ""),
        ("ANILIST_DESKTOP_CLIENT_SECRET", ""),
        ("ANILIST_DESKTOP_REDIRECT_URI", "https://shiori.local/auth"),
        ("ANILIST_ANDROID_CLIENT_ID", ""),
        ("ANILIST_ANDROID_CLIENT_SECRET", ""),
        ("ANILIST_ANDROID_REDIRECT_URI", "shiori://auth"),
    ];
    for &(var, default) in vars {
        let val = std::env::var(var).unwrap_or_else(|_| default.to_string());
        println!("cargo:rustc-env={}={}", var, val);
    }

    tauri_build::build()
}
