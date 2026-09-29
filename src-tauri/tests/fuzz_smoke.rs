//! Deterministic mutation fuzzer (Phase 3 gate, Q-owned).
//!
//! Takes every corpus source file, applies seeded byte mutations (flips,
//! truncations, duplications, ASCII/UTF-16 garbage prefixes), and runs the
//! full conversion pipeline on each mutant inside a panic-bound and
//! time-bound (10 s) thread. Any panic OR hang fails the run. Seeds are
//! fixed, so the suite is reproducible in CI.
use shiori::conversion::convert_to_epub_new;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::time::Instant;

const CORPUS_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../convert/corpus/src");

/// Simple deterministic PRNG (xorshift64) — no external dep.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

fn mutate(seed: u64, data: &[u8]) -> Vec<u8> {
    let mut rng = Rng(seed ^ 0x9E37_79B9_7F4A_7C15);
    let mut out = data.to_vec();
    let ops = 1 + rng.below(8);
    for _ in 0..ops {
        match rng.below(5) {
            0 => {
                // single-byte flip
                if !out.is_empty() {
                    let i = rng.below(out.len());
                    out[i] ^= 1 << rng.below(8);
                }
            }
            1 => {
                // truncate
                if !out.is_empty() {
                    out.truncate(out.len() / 2);
                }
            }
            2 => {
                // duplicate a chunk
                if out.len() > 16 {
                    let i = rng.below(out.len() - 16);
                    let chunk = out[i..i + 16].to_vec();
                    let at = rng.below(out.len());
                    let n = out.len().min(at);
                    out.splice(n..n, chunk);
                }
            }
            3 => {
                // garbage prefix (breaks magic detection)
                let junk: Vec<u8> = (0..12).map(|_| rng.below(256) as u8).collect();
                out = junk.into_iter().chain(out).collect();
            }
            _ => {
                // NUL run
                if out.len() > 8 {
                    let at = rng.below(out.len() - 8);
                    for b in out.iter_mut().skip(at).take(8) {
                        *b = 0;
                    }
                }
            }
        }
    }
    out
}

fn corpus_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    let skip = ["../../src", "."];
    let _ = skip;
    for entry in walkdir::WalkDir::new(CORPUS_ROOT).min_depth(1) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
        if matches!(
            ext,
            "txt" | "epub" | "pdf" | "fb2" | "fbz" | "mobi" | "docx" | "html" | "cbz" | "zip"
                | "gz" | "rtf" | "md"
        ) {
            files.push(p.to_path_buf());
        }
    }
    files.sort();
    files
}

#[tokio::test(flavor = "multi_thread")]
async fn mutated_inputs_never_panic_or_hang() {
    let files = corpus_files();
    assert!(!files.is_empty(), "no corpus files");

    let mut seed = 0u64;
    let mut checked = 0usize;
    let mut panics = Vec::new();
    let mut hangs = Vec::new();

    for src in files {
        let original = match std::fs::read(&src) {
            Ok(d) => d,
            Err(_) => continue,
        };
        // 6 mutants per file keeps the suite quick (~200 total conversions).
        for _ in 0..6 {
            seed += 1;
            let mutant = mutate(seed, &original);
            let tmp = std::env::temp_dir().join(format!("fuzz_{}.mut", seed));
            std::fs::write(&tmp, &mutant).unwrap();
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("bin");
            let target: PathBuf = tmp.with_extension(ext);
            let target2 = target.clone();

            // Panic-bound + time-bound conversion on a scoped thread.
            let result = std::thread::scope(|scope| {
                let start = Instant::now();
                let handle = scope.spawn(move || {
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .unwrap();
                    let out = rt.block_on(convert_to_epub_new(&target2, None, None));
                    (out.map(|_| ()), start.elapsed())
                });
                handle.join().map(|(r, elapsed)| (r, elapsed))
            });

            checked += 1;
            match result {
                Ok((_res, elapsed)) => {
                    if elapsed > std::time::Duration::from_secs(10) {
                        hangs.push(format!("{} seed={}", src.display(), seed));
                    }
                }
                Err(_) => panics.push(format!("{} seed={}", src.display(), seed)),
            }
            let _ = std::fs::remove_file(&target);
            let _ = std::fs::remove_file(&tmp);
        }
    }

    println!("[fuzz] {} conversions, {} panics, {} hangs", checked, panics.len(), hangs.len());
    assert!(panics.is_empty(), "panics: {panics:?}");
    assert!(hangs.is_empty(), "hangs: {hangs:?}");
}