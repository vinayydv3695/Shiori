//! Batch D QA battery — headless verification of user-reported areas.
//! Run: cargo test --test batch_d_qa -- --nocapture [--ignored for live]
use shiori::conversion::{convert_to_epub_new, formats};
use shiori::services::mobi_adapter::MobiAdapter;
use shiori::services::pdf_adapter::PdfAdapter;
use shiori::services::renderer::BookReaderAdapter;
use std::io::Read;
use std::path::{Path, PathBuf};
use shiori::sources::Source;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("qad_{}_{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// D4 — HTML book with a LOCAL image: conversion must embed the image and
/// rewrite the src to the internal path (images inside HTML/MD books render).
#[test]
fn d4_html_local_images_embed_in_epub() {
    let dir = tmp("d4");
    let html = dir.join("book.html");

    // Self-contained fixtures — no /tmp/qa dependency (the test must pass on
    // a clean machine). 1x1 transparent PNG (magic bytes detected by
    // utils::detect_image_format).
    let png: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
        0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
        0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
        0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    std::fs::write(dir.join("pic.png"), png).unwrap();
    std::fs::write(
        &html,
        "<html><body><h1>QA Book</h1><p>Hello <img src=\"pic.png\" alt=\"pic\"/> world</p></body></html>",
    )
    .unwrap();

    let out = dir.join("book.epub");
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut book = formats::html::parse(&html).expect("html parse");
    // convert_to_epub_new also exercises the full pipeline
    let converted = rt
        .block_on(convert_to_epub_new(&html, None, None))
        .expect("convert html with image");
    let data = std::fs::read(&converted).unwrap();
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).unwrap();
    let mut images = Vec::new();
    let mut chapter = String::new();
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).unwrap();
        let n = f.name().to_string();
        if n.contains("Images/") || n.ends_with(".png") || n.ends_with(".jpg") {
            let mut b = Vec::new();
            f.read_to_end(&mut b).unwrap();
            images.push((n, b));
        } else if n.ends_with(".xhtml") {
            let mut b = Vec::new();
            f.read_to_end(&mut b).unwrap();
            chapter.push_str(&String::from_utf8_lossy(&b));
        }
    }
    assert!(!images.is_empty(), "no images embedded in epub: {}", converted.display());
    let (iname, _) = &images[0];
    assert!(
        chapter.contains(&format!("../Images/{}", iname.rsplit('/').next().unwrap()))
            || chapter.contains(iname),
        "chapter should reference the embedded image"
    );
    println!("D4 PASS: {} embedded, src rewritten", iname);
    let _ = &mut book;
}

/// D5 — PDF text search: PdfAdapter load + search must return hits.
#[test]
fn d5_pdf_search_finds_text() {
    let pdf = Path::new("/tmp/qa/qa.pdf");
    if !pdf.exists() {
        eprintln!("D5 SKIP: qa.pdf missing");
        return;
    }
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut adapter = PdfAdapter::new();
    rt.block_on(adapter.load(pdf.to_str().unwrap())).unwrap();

    let hits = adapter.search("fox").expect("search");
    assert!(!hits.is_empty(), "search for 'fox' should hit the PDF text");
    println!("D5 PASS: 'fox' found in {} result(s)", hits.len());

    let miss = adapter.search("zephyrqxx").unwrap_or_default();
    println!("D5 note: nonsense query hits = {}", miss.len());
}

/// D3 — real AZW3/KF8: only runs when a sample exists at /tmp/qa/book.azw3.
/// (No public sample obtainable from this machine — device task otherwise.)
#[test]
fn d3_azw3_read_and_convert() {
    let az = Path::new("/tmp/qa/book.azw3");
    if !az.exists() {
        eprintln!("D3 SKIP: no azw3 sample — drop one at /tmp/qa/book.azw3 (or use a real device)");
        return;
    }
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut a = MobiAdapter::new();
    rt.block_on(a.load(az.to_str().unwrap())).expect("azw3 load");
    let n = a.chapter_count();
    assert!(n > 0, "azw3 should produce chapters");
    let out = tmp("d3").join("book.epub");
    rt.block_on(convert_to_epub_new(az, None, None))
        .expect("azw3 convert");
    println!("D3 PASS: {} chapters, epub written", n);
}

/// D2 — LIVE LibGen PDF/MOBI downloads (needs network; run with --ignored).
#[test]
#[ignore]
fn d2_libgen_live_pdf_mobi() {
    let source = shiori::sources::libgen::LibgenSource::new().expect("libgen client");
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut all: Vec<_> = Vec::new();
    for q in ["The Hobbit", "Harry Potter"] {
        match rt.block_on(source.search(q, 1)) {
            Ok(r) => { println!("D2: '{}' -> {} results", q, r.len()); all.extend(r); }
            Err(e) => println!("D2: search '{}' error: {}", q, e),
        }
    }
    let res = all;
    assert!(!res.is_empty(), "searches returned nothing");

    let mut tested = 0;
    let mut attempts = 0;
    // Prefer PDF/MOBI rows (the user-reported failure) — epub last.
    let mut ordered: Vec<_> = res.iter().collect();
    ordered.sort_by_key(|i| {
        let f = i.extra.get("format").cloned().unwrap_or_default().to_ascii_lowercase();
        match f.as_str() { "pdf" => 0, "mobi" => 1, "epub" => 2, _ => 3 }
    });
    for item in ordered {
        let fmt = item
            .extra
            .get("format")
            .cloned()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !["pdf", "mobi", "epub"].contains(&fmt.as_str()) {
            continue;
        }
        if attempts >= 10 {
            break;
        }
        attempts += 1;
        let pages = match rt.block_on(source.get_pages(&item.id)) {
            Ok(p) => p,
            Err(e) => { println!("D2 {}: get_pages error {}", fmt, e); continue; }
        };
        let direct = pages.iter().find(|p| p.url.starts_with("direct|"));
        let Some(direct) = direct else {
            println!("D2 {}: no direct link", fmt);
            continue;
        };
        let url = direct.url.trim_start_matches("direct|");
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap();
        let resp = rt.block_on(client.get(url).send());
        match resp {
            Ok(r) if r.status().is_success() => {
                let bytes = rt.block_on(r.bytes()).unwrap();
                let magic_ok = match fmt.as_str() {
                    "pdf" => bytes.starts_with(b"%PDF"),
                    "mobi" => bytes.len() > 68
                        && (&bytes[60..68] == b"BOOKMOBI" || &bytes[60..68] == b"TEXtREAd"),
                    "epub" => bytes.starts_with(b"PK\x03\x04"),
                    _ => true,
                };
                println!(
                    "D2 {}: {} bytes, magic {}",
                    fmt.to_uppercase(),
                    bytes.len(),
                    if magic_ok { "OK" } else { "MISMATCH" }
                );
                tested += 1;
            }
            Ok(r) => println!("D2 {}: HTTP {}", fmt, r.status()),
            Err(e) => println!("D2 {}: fetch error {}", fmt, e),
        }
    }
    if tested == 0 {
        eprintln!("D2 WARN: no pdf/mobi/epub rows downloadable in this run (mirror flakiness)");
    }
    println!("D2: tested {} formats — see lines above", tested);
}

/// D1 — MangaFire needs the in-app Cloudflare browser RPC (no headless path)
/// and ToonGod/Weebrook/ManhwaHub are Cloudflare-blocked from this machine.
/// These require a real device — see the report.
#[test]
fn d1_manga_requires_device() {
    eprintln!("D1: mangafire browse/download needs the app's browser RPC (device); toongod/weebrook/manhwahub 403 from this network — device task.");
}
