//! Conversion corpus probe (Q-owned harness).
//!
//! Converts every file in `convert/corpus/src/**` to EPUB through the same
//! `convert_to_epub_new` entry point the app uses, writing outputs to
//! `convert/out/`. Scoring (EPUBCheck, fidelity, determinism) is done by
//! `convert/tools/score.py` — this test only performs the conversions and
//! prints a structured summary line per file.
//!
//! Run:  cargo test --test convert_probe -- --nocapture
//!       python3 convert/tools/score.py
use shiori::conversion::convert_to_epub_new;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const CORPUS_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../convert/corpus/src");
const OUT_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../convert/out");

fn discover() -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(CORPUS_ROOT)
        .min_depth(1)
        .follow_links(false)
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if matches!(
            ext.as_str(),
            "txt" | "epub" | "pdf" | "fb2" | "fbz" | "mobi" | "azw3" | "docx" | "html"
                | "htm" | "xhtml" | "md" | "markdown" | "rtf" | "gz" | "zip" | "cbz" | "cbr"
        ) {
            files.push(p.to_path_buf());
        }
    }
    files.sort();
    files
}

#[tokio::test(flavor = "multi_thread")]
async fn convert_entire_corpus() {
    let files = discover();
    assert!(!files.is_empty(), "no corpus files found under {CORPUS_ROOT}");
    let mut summary: BTreeMap<String, (usize, usize)> = BTreeMap::new(); // ext -> (ok, fail)

    for src in &files {
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
        let rel = src.strip_prefix(CORPUS_ROOT).unwrap();
        let out = Path::new(OUT_ROOT).join(rel).with_extension("epub");
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).expect("create out dir");
        }

        let result = convert_to_epub_new(src, None, None).await;
        let entry = summary.entry(ext.to_string()).or_default();
        match result {
            Ok(path) => {
                // Copy into convert/out so score.py can validate deterministically.
                if path != *out {
                    let _ = std::fs::copy(&path, &out);
                }
                let sz = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                println!("OK   {:30} -> {} ({} bytes)", rel.display(), path.display(), sz);
                entry.0 += 1;
            }
            Err(e) => {
                println!("FAIL {:30} -> {}", rel.display(), e);
                entry.1 += 1;
            }
        }
    }

    println!("\n=== SUMMARY (conversion) ===");
    for (ext, (ok, fail)) in &summary {
        println!("  {:8} ok={} fail={}", ext, ok, fail);
    }
}
/// Hostile-input smoke test (Phase 3 fuzz gate): every malformed input must
/// fail with a clean error or a bounded success — never a hang or a panic.
#[tokio::test(flavor = "multi_thread")]
async fn hostile_inputs_do_not_break_the_pipeline() {
    let edge = std::path::Path::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../convert/corpus/src/edge"),
    );
    let mut failures = Vec::new();
    for entry in std::fs::read_dir(edge).unwrap().flatten() {
        let p = entry.path();
        let start = std::time::Instant::now();
        let result = convert_to_epub_new(&p, None, None).await;
        let elapsed = start.elapsed();
        let verdict = match &result {
            Ok(_) => "ok",
            Err(_) => "clean-error",
        };
        println!("HOSTILE {:30} -> {verdict} in {:?}", p.file_name().unwrap().to_string_lossy(), elapsed);
        if elapsed > std::time::Duration::from_secs(20) {
            failures.push(format!("{}: hung for {:?}", p.display(), elapsed));
        }
    }
    assert!(failures.is_empty(), "hostile inputs hung: {failures:?}");
}
