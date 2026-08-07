//! Wiremock integration tests for the Anna's Archive source.
//!
//! Hermetic: no real network. `ANNAS_ARCHIVE_MIRRORS` points the source at a
//! local mock server (per-request env read, restored in cleanup). Tests are
//! serialized with a static mutex because the env var is process-global.

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use shiori::commands::sources::is_anna_dataset_torrent;
use shiori::sources::annas_archive::AnnasArchiveSource;
use shiori::sources::Source;

const MD5_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MD5_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/// Serializes env access across tests: ANNAS_ARCHIVE_MIRRORS is process-global.
/// A std mutex is deliberate: the guard must span the whole test body (including
/// awaits) so parallel tests never interleave env writes.
static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct MirrorEnvGuard {
    previous: Option<String>,
}

impl Drop for MirrorEnvGuard {
    fn drop(&mut self) {
        match &self.previous {
            Some(v) => std::env::set_var("ANNAS_ARCHIVE_MIRRORS", v),
            None => std::env::remove_var("ANNAS_ARCHIVE_MIRRORS"),
        }
    }
}

fn set_mirrors(mirrors: &str) -> MirrorEnvGuard {
    let previous = std::env::var("ANNAS_ARCHIVE_MIRRORS").ok();
    std::env::set_var("ANNAS_ARCHIVE_MIRRORS", mirrors);
    MirrorEnvGuard { previous }
}

/// Search fixture containing one row in the old 2024 layout
/// (`div.flex.pt-3.pb-3.border-b` with a `a.font-semibold.text-lg` title) and
/// one row in the current `a.js-vim-focus` layout, so both parsers are
/// exercised.
fn search_fixture_html() -> String {
    format!(
        r#"<!DOCTYPE html>
<html><body>
  <div class="flex pt-3 pb-3 border-b">
    <img src="/covers/old-layout-cover.jpg" alt="cover" />
    <div>
      <a class="font-semibold text-lg" href="/md5/{md5_a}">Old Layout Book</a>
      <div class="text-gray-600 mt-2">A classic novel about manners.</div>
      <div class="text-xs">Jane Austen</div>
      <div class="text-sm">English EPUB 2.5MB</div>
    </div>
  </div>
  <div class="flex pt-3 pb-3 border-b">
    <a class="js-vim-focus" href="/md5/{md5_b}">
      New Layout Book
      <span class="text-sm">George Orwell, 1984</span>
      <span class="text-xs">English PDF 1.2 MB</span>
    </a>
  </div>
</body></html>"#,
        md5_a = MD5_A,
        md5_b = MD5_B,
    )
}

/// Detail page fixture: a magnet, a single-book torrent, a dataset
/// (collection/shard) torrent, and a fast-download link.
fn detail_fixture_html() -> String {
    r#"<!DOCTYPE html>
<html><body>
  <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=book">magnet</a>
  <a href="/dyn/small_file/torrents/book.torrent">book torrent</a>
  <a href="/dyn/small_file/torrents/external/libgen_rs/f_123/annas_archive_data__a.torrent">dataset torrent</a>
  <a href="/fast_download/abc123">fast download</a>
</body></html>"#
        .to_string()
}

#[tokio::test]
#[allow(clippy::await_holding_lock)] // ENV_LOCK intentionally spans awaits to serialize env writes
async fn search_normalizes_both_layouts_and_paginates() {
    let _env_guard = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _mirror_guard = set_mirrors(&server.uri());

    Mock::given(method("GET"))
        .and(path("/search"))
        .respond_with(ResponseTemplate::new(200).set_body_string(search_fixture_html()))
        .mount(&server)
        .await;

    let source = AnnasArchiveSource::new().expect("Failed to create source");

    // Page 1: both layouts parse into normalized results.
    let resp = source
        .search_with_meta("rust", 1, 20)
        .await
        .expect("Search failed");
    assert_eq!(resp.items.len(), 2);

    let old_row = resp
        .items
        .iter()
        .find(|i| i.extra.get("md5").map(String::as_str) == Some(MD5_A))
        .expect("old-layout row missing");
    assert_eq!(old_row.id, format!("anna-{}", MD5_A));
    assert_eq!(old_row.title, "Old Layout Book");
    assert_eq!(
        old_row.extra.get("detail_url").map(String::as_str),
        Some(format!("{}/md5/{}", server.uri(), MD5_A).as_str())
    );
    assert_eq!(old_row.extra.get("author").map(String::as_str), Some("Jane Austen"));
    assert_eq!(old_row.extra.get("format").map(String::as_str), Some("EPUB"));
    assert_eq!(old_row.extra.get("file_size").map(String::as_str), Some("2.5MB"));
    assert_eq!(old_row.extra.get("language").map(String::as_str), Some("English"));
    assert_eq!(
        old_row.cover_url.as_deref(),
        Some(format!("{}/covers/old-layout-cover.jpg", server.uri()).as_str())
    );
    assert_eq!(old_row.description.as_deref(), Some("A classic novel about manners."));

    let new_row = resp
        .items
        .iter()
        .find(|i| i.extra.get("md5").map(String::as_str) == Some(MD5_B))
        .expect("js-vim-focus row missing");
    assert_eq!(new_row.title, "New Layout Book");
    assert_eq!(new_row.extra.get("year").map(String::as_str), Some("1984"));
    assert_eq!(new_row.extra.get("format").map(String::as_str), Some("PDF"));
    assert_eq!(new_row.extra.get("file_size").map(String::as_str), Some("1.2 MB"));
    // No <img> in this row → pseudo cover fallback.
    assert_eq!(
        new_row.cover_url.as_deref(),
        Some(format!("{}/book/covers/{}", server.uri(), MD5_B).as_str())
    );

    let diag = resp.diagnostics.expect("missing diagnostics");
    assert_eq!(diag.selected_mirror.as_deref(), Some(server.uri().as_str()));

    // Page 2: the request must carry page=2 (pagination fix).
    let resp2 = source
        .search_with_meta("rust", 2, 20)
        .await
        .expect("Search page 2 failed");
    assert_eq!(resp2.items.len(), 2);

    let requests = server.received_requests().await.expect("no request recording");
    let page2 = requests
        .iter()
        .find(|r| r.url.query_pairs().any(|(k, v)| k == "page" && v == "2"))
        .expect("no request with page=2 query param");
    assert_eq!(page2.url.path(), "/search");
}

#[tokio::test]
#[allow(clippy::await_holding_lock)] // ENV_LOCK intentionally spans awaits to serialize env writes
async fn search_fails_over_to_next_mirror() {
    let _env_guard = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let dead = "http://127.0.0.1:1";
    let _mirror_guard = set_mirrors(&format!("{},{}", dead, server.uri()));

    Mock::given(method("GET"))
        .and(path("/search"))
        .respond_with(ResponseTemplate::new(200).set_body_string(search_fixture_html()))
        .mount(&server)
        .await;

    let source = AnnasArchiveSource::new().expect("Failed to create source");
    let resp = source
        .search_with_meta("rust", 1, 20)
        .await
        .expect("Search failed");

    let diag = resp.diagnostics.expect("missing diagnostics");
    assert_eq!(diag.attempted_mirrors.len(), 2);
    assert!(!diag.attempted_mirrors[0].success, "first mirror should have failed");
    assert!(diag.attempted_mirrors[1].success, "second mirror should have succeeded");
    assert_eq!(diag.selected_mirror.as_deref(), Some(server.uri().as_str()));
    assert_eq!(diag.selected_base.as_deref(), Some(server.uri().as_str()));
    assert_eq!(resp.items.len(), 2);
}

#[tokio::test]
#[allow(clippy::await_holding_lock)] // ENV_LOCK intentionally spans awaits to serialize env writes
async fn download_options_classification_and_page_prefixes() {
    let _env_guard = ENV_LOCK.lock().unwrap();
    let server = MockServer::start().await;
    let _mirror_guard = set_mirrors(&server.uri());

    Mock::given(method("GET"))
        .and(path(format!("/md5/{}", MD5_B)))
        .respond_with(ResponseTemplate::new(200).set_body_string(detail_fixture_html()))
        .mount(&server)
        .await;

    let source = AnnasArchiveSource::new().expect("Failed to create source");

    // Classification + ordering: Magnet(0), Direct(1), External(2), Torrent(3).
    let options = source
        .get_download_options(MD5_B)
        .await
        .expect("get_download_options failed");
    let kinds: Vec<&str> = options.iter().map(|o| o.download_type.as_str()).collect();
    assert_eq!(kinds, vec!["magnet", "direct", "torrent", "torrent"]);

    // Magnet URLs stay raw; relative links are absolutized against the mirror.
    assert!(options[0].url.starts_with("magnet:"));
    assert_eq!(options[1].url, format!("{}/fast_download/abc123", server.uri()));
    assert!(options[2].url.ends_with("book.torrent"));
    assert!(options[3].url.contains("annas_archive_data__"));

    // Dataset torrents are excluded by the torbox-candidate filter.
    assert!(is_anna_dataset_torrent(&options[3].url));
    assert!(!is_anna_dataset_torrent(&options[2].url));

    // annas_archive_get_torrent_links-equivalent filtering: Magnet kept,
    // Torrent kept only when not a dataset torrent.
    let torrent_candidates: Vec<_> = options
        .iter()
        .filter(|o| match o.download_type {
            shiori::sources::annas_archive::DownloadType::Magnet => true,
            shiori::sources::annas_archive::DownloadType::Torrent => {
                !is_anna_dataset_torrent(&o.url)
            }
            _ => false,
        })
        .collect();
    assert_eq!(torrent_candidates.len(), 2);
    assert!(
        torrent_candidates
            .iter()
            .all(|o| !o.url.contains("annas_archive_data__"))
    );

    // get_pages keeps the Page.url prefix contract and strips the "anna-" id prefix.
    let pages = source
        .get_pages(&format!("anna-{}", MD5_B))
        .await
        .expect("get_pages failed");
    let prefixes: Vec<&str> = pages
        .iter()
        .map(|p| p.url.split('|').next().unwrap())
        .collect();
    assert_eq!(prefixes, vec!["magnet", "direct", "torrent", "torrent"]);
    assert!(pages.iter().any(|p| p.url.starts_with("magnet|magnet:")));
    assert!(pages
        .iter()
        .any(|p| p.url == format!("direct|{}/fast_download/abc123", server.uri())));
    assert!(pages
        .iter()
        .any(|p| p.url == format!("torrent|{}/dyn/small_file/torrents/book.torrent", server.uri())));
}
