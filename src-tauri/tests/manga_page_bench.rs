//! F4 micro-benchmark: per-page ZIP reopen (old pattern) vs persistent
//! archive (new pattern). Run: cargo test --test manga_page_bench -- --nocapture
//! Uses the seeded CBZ at perf/seed/files (created by perf/seed/seed_db.py);
//! skips silently when absent.
use std::io::Read;
use std::path::PathBuf;
use zip::ZipArchive;

fn bench_cbz() -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../perf/seed/files/Bench Piece - Chapter 1.cbz");
    p.exists().then_some(p)
}

#[test]
fn page_extraction_reopen_vs_persistent() {
    let Some(path) = bench_cbz() else {
        eprintln!("seed cbz missing; skipping (run perf/seed/seed_db.py)");
        return;
    };

    let file = std::fs::File::open(&path).unwrap();
    let mut archive = ZipArchive::new(file).unwrap();
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();
    assert!(!names.is_empty());

    const N: usize = 100; // 5 full passes over the 20-page archive

    // A: reopen + re-parse central directory per page (pre-F4 behaviour)
    let t0 = std::time::Instant::now();
    for k in 0..N {
        let name = &names[k % names.len()];
        let f = std::fs::File::open(&path).unwrap();
        let mut a = ZipArchive::new(f).unwrap();
        let mut z = a.by_name(name).unwrap();
        let mut buf = Vec::new();
        z.read_to_end(&mut buf).unwrap();
    }
    let reopen = t0.elapsed();

    // B: persistent archive (post-F4 behaviour)
    let t1 = std::time::Instant::now();
    for k in 0..N {
        let name = &names[k % names.len()];
        let mut z = archive.by_name(name).unwrap();
        let mut buf = Vec::new();
        z.read_to_end(&mut buf).unwrap();
    }
    let persistent = t1.elapsed();

    println!(
        "[perf:manga] {N} pages — reopen-per-page={reopen:?} persistent={persistent:?} speedup={:.1}x",
        reopen.as_secs_f64() / persistent.as_secs_f64()
    );
    assert!(persistent <= reopen, "persistent archive should not be slower");
}
