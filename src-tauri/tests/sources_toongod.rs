//! Hermetic wiremock integration tests for the ToonGod adapter: search,
//! browse, chapters, pages, Cloudflare/rate-limit/not-found mapping, and the
//! search cache. No real network.
//!
//! `TOONGOD_BASE` points the source at a local mock server. It is read once
//! at `ToonGodSource::new()` (mirroring mangadex's `MANGADEX_API_BASE`), so
//! the env var only needs to be set while constructing; a Drop guard restores
//! the previous value. A static mutex serializes tests because the env var is
//! process-global (same pattern as `integration_annas_archive.rs`).

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use shiori::sources::toongod::ToonGodSource;
use shiori::sources::Source;

/// Serializes env access across tests: `TOONGOD_BASE` is process-global.
/// A std mutex is deliberate: the guard must span the whole test body
/// (including awaits) so parallel tests never interleave env writes.
static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct EnvGuard {
    previous: Option<String>,
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        match &self.previous {
            Some(v) => std::env::set_var("TOONGOD_BASE", v),
            None => std::env::remove_var("TOONGOD_BASE"),
        }
    }
}

fn override_base(uri: &str) -> EnvGuard {
    let previous = std::env::var("TOONGOD_BASE").ok();
    std::env::set_var("TOONGOD_BASE", uri);
    EnvGuard { previous }
}

/// Point the source at `server` with a real CfClient (no AppHandle needed).
async fn source_against(server: &MockServer) -> ToonGodSource {
    ToonGodSource::new_with_cf_client(&server.uri())
        .await
        .expect("failed to build ToonGodSource with mock CfClient")
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/// Two search cards: one `c-tabs-item__content`, one `page-item-detail`.
/// (The inner `.post-title` divs also match the item selector; the parser
/// de-duplicates by slug, so exactly 2 unique results are expected.)
const SEARCH_HTML: &str = r#"<!DOCTYPE html>
<html><body>
  <div class="c-tabs-item__content">
    <div class="post-title"><h3><a href="/webtoons/solo-leveling/">Solo Leveling</a></h3></div>
    <img src="/covers/solo-leveling.jpg" alt="cover" />
  </div>
  <div class="page-item-detail">
    <div class="post-title"><h4><a href="/webtoons/tower-of-god/">Tower of God</a></h4></div>
  </div>
</body></html>"#;

/// Manga page with the `data-id` used by the AJAX chapter endpoints.
const MANGA_HTML: &str = r#"<!DOCTYPE html>
<html><body>
  <div class="manga-page" data-id="12345">
    <h1>Solo Leveling</h1>
  </div>
</body></html>"#;

/// Chapter rows (Madara `li.wp-manga-chapter`), newest-first like the live site.
const CHAPTERS_HTML: &str = r#"<!DOCTYPE html>
<html><body>
  <ul class="wp-manga-chapters">
    <li class="wp-manga-chapter"><a href="/webtoons/solo-leveling/chapter-2/">Chapter 2</a></li>
    <li class="wp-manga-chapter"><a href="/webtoons/solo-leveling/chapter-1/">Chapter 1</a></li>
  </ul>
</body></html>"#;

/// Reading page with `.page-break img` rows; the third has a WP thumbnail
/// suffix (`-200x300`) that the parser strips.
const PAGES_HTML: &str = r#"<!DOCTYPE html>
<html><body>
  <div class="reading-content">
    <div class="page-break"><img src="/uploads/page-1.jpg" alt="1" /></div>
    <div class="page-break"><img data-src="/uploads/page-2.jpg" alt="2" /></div>
    <div class="page-break"><img src="/uploads/page-3-200x300.jpg" alt="3" /></div>
  </div>
</body></html>"#;

/// Cloudflare interstitial: 403 + "Just a moment" + challenge markers.
const CF_CHALLENGE_HTML: &str = r#"<html><head><title>Just a moment...</title></head>
<body>Checking your browser before accessing toongod.org. cloudflare challenge-platform</body></html>"#;

// ─── Happy paths ─────────────────────────────────────────────────────────────

#[tokio::test]
#[allow(clippy::await_holding_lock)] // ENV_LOCK intentionally spans awaits
async fn search_parses_items() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SEARCH_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let results = source.search("solo", 1).await.expect("search failed");

    assert_eq!(results.len(), 2, "two unique cards expected");
    for r in &results {
        assert!(!r.id.is_empty(), "id must be non-empty");
        assert!(!r.title.is_empty(), "title must be non-empty");
        let url = r.extra.get("url").expect("extra.url present");
        assert!(!url.is_empty(), "url must be non-empty");
    }
    assert!(results.iter().any(|r| r.title == "Solo Leveling"));
    assert!(results.iter().any(|r| r.title == "Tower of God"));
}

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn browse_latest_hits_home_and_parses() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    Mock::given(method("GET"))
        .and(path("/home/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SEARCH_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let results = source
        .browse("latest", 1, 20, None, None)
        .await
        .expect("browse failed");

    assert_eq!(results.len(), 2);
    let reqs = server.received_requests().await.expect("requests recorded");
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0].url.path(), "/home/");
    assert!(reqs[0].url.query().unwrap_or("").contains("m_orderby=latest"));
}

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn get_chapters_parses_rows_via_ajax() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());
    let manga_url = format!("{}/webtoons/solo-leveling/", server.uri());

    // Manga page (scraped for `data-id`).
    Mock::given(method("GET"))
        .and(path("/webtoons/solo-leveling/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(MANGA_HTML))
        .mount(&server)
        .await;

    // Primary AJAX endpoint — must be the one used.
    Mock::given(method("POST"))
        .and(path("/webtoons/solo-leveling/ajax/chapters/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(CHAPTERS_HTML))
        .expect(1)
        .mount(&server)
        .await;

    // Legacy admin-ajax fallback (responds identically; only hit if the
    // primary endpoint fails).
    Mock::given(method("POST"))
        .and(path("/wp-admin/admin-ajax.php"))
        .respond_with(ResponseTemplate::new(200).set_body_string(CHAPTERS_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let chapters = source
        .get_chapters(&manga_url)
        .await
        .expect("get_chapters failed");

    assert_eq!(chapters.len(), 2);
    assert_eq!(chapters[0].title, "Chapter 1");
    assert_eq!(chapters[0].number, 1.0);
    assert_eq!(chapters[1].title, "Chapter 2");
    assert_eq!(chapters[1].number, 2.0);
    // Newest-first input is reversed into chronological order.
    assert!(chapters[0].number < chapters[1].number);
}

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn get_pages_parses_page_images() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());
    let chapter_url = format!("{}/webtoons/solo-leveling/chapter-1/", server.uri());

    Mock::given(method("GET"))
        .and(path("/webtoons/solo-leveling/chapter-1"))
        .respond_with(ResponseTemplate::new(200).set_body_string(PAGES_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let pages = source.get_pages(&chapter_url).await.expect("get_pages failed");

    assert_eq!(pages.len(), 3);
    assert!(pages[0].url.ends_with("/uploads/page-1.jpg"), "got {}", pages[0].url);
    assert!(pages[1].url.ends_with("/uploads/page-2.jpg"), "got {}", pages[1].url);
    // WP thumbnail suffix stripped: page-3-200x300.jpg → page-3.jpg
    assert!(pages[2].url.ends_with("/uploads/page-3.jpg"), "got {}", pages[2].url);
    for (i, p) in pages.iter().enumerate() {
        assert_eq!(p.index as usize, i, "pages re-indexed sequentially");
    }
}

// ─── Challenge / error mapping ───────────────────────────────────────────────

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn cloudflare_403_surfaces_cloudflare_error() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(403).set_body_string(CF_CHALLENGE_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let err = source.search("solo", 1).await.expect_err("must fail");
    let msg = err.to_string().to_lowercase();
    assert!(msg.contains("cloudflare"), "expected Cloudflare error, got: {msg}");
}

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn rate_limit_429_surfaces_rate_limit_error() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    // Plain-text body: not HTML, so the CF-detector path is skipped and the
    // 429 flows through the retry loop into the HTTP-status mapping.
    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(429).set_body_string("rate limited"))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let err = source.search("solo", 1).await.expect_err("must fail");
    let msg = err.to_string().to_lowercase();
    assert!(msg.contains("rate-limiting"), "expected rate-limit error, got: {msg}");
}

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn not_found_404_surfaces_not_found_error() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(404).set_body_string("no such page"))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let err = source.search("solo", 1).await.expect_err("must fail");
    let msg = err.to_string().to_lowercase();
    assert!(msg.contains("not found"), "expected not-found error, got: {msg}");
}

// ─── Caching ─────────────────────────────────────────────────────────────────

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn search_cache_serves_second_call_without_network() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    // `.expect(1)` is verified when the MockServer drops: a second network
    // hit (cache miss) would panic this test.
    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SEARCH_HTML))
        .expect(1)
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let first = source.search("cached-query", 1).await.expect("first search");
    let second = source.search("cached-query", 1).await.expect("cached search");

    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), first.len());
}

// ─── Popular browse (mode → trending path) ───────────────────────────────────

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn browse_popular_hits_trending_path_and_parses() {
    // Path mapping in toongod.rs `browse()`:
    //   "trending" | "popular" => "trending"  (quoted from the order match)
    // so "popular" must hit /home/?m_orderby=trending, not the default latest.
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    Mock::given(method("GET"))
        .and(path("/home/"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SEARCH_HTML))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let results = source
        .browse("popular", 1, 20, None, None)
        .await
        .expect("browse(popular) failed");

    assert_eq!(results.len(), 2, "popular browse parses the same cards");
    let reqs = server.received_requests().await.expect("requests recorded");
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0].url.path(), "/home/");
    let query = reqs[0].url.query().unwrap_or("");
    assert!(
        query.contains("m_orderby=trending"),
        "popular must map to trending, got query: {query}"
    );
}

// ─── Parser failure resilience ───────────────────────────────────────────────

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn search_with_garbage_html_returns_empty_results_without_panicking() {
    let _lock = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _env = override_base(&server.uri());

    // 200 + non-HTML garbage: selectors match nothing → graceful empty list.
    Mock::given(method("GET"))
        .and(path("/"))
        .respond_with(ResponseTemplate::new(200).set_body_string("garbage not html {{{"))
        .mount(&server)
        .await;

    let source = source_against(&server).await;
    let results = source.search("solo", 1).await.expect("search must not error");
    assert!(results.is_empty(), "garbage HTML yields no results, got {}", results.len());
}
