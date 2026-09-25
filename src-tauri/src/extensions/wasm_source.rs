//! [`Source`] adapter over a live [`ExtensionInstance`].
//!
//! `WasmSource` is a drop-in `sources::Source`: the registry and the command
//! layer treat it like any compiled-in source. Every call is forwarded through
//! the instance's `invoke` export and the JSON ABI ([`abi`](super::abi)), then
//! mapped into the existing `SourceMeta` / `SearchResult` / `Chapter` / `Page`
//! structs. Calls are serialized with a `Mutex` because the trait requires
//! `Sync` while wasmi's `Store` is `!Sync`.
//!
//! Per PLAN.md §3 the structured extension error kind is intentionally lost at
//! this boundary: all failures surface as
//! [`SourceError::Unknown`](crate::sources::SourceError::Unknown).

use std::sync::Mutex;

use async_trait::async_trait;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, Page, SearchResult, Source, SourceHealth, SourceMeta};

use super::runtime::{ExtensionInstance, HostOptions};
use super::ExtensionError;

/// A WASM-extension-backed source.
pub struct WasmSource {
    meta: SourceMeta,
    instance: Mutex<ExtensionInstance>,
}

impl WasmSource {
    /// Instantiates the module and pulls the extension's `meta` to seed the
    /// stored [`SourceMeta`]. Fails with [`ExtensionError`] on any load or
    /// meta-call error (never panics).
    pub fn new(wasm: &[u8], opts: HostOptions) -> std::result::Result<Self, ExtensionError> {
        let mut instance = ExtensionInstance::new(wasm, opts)?;
        let meta = instance.invoke_meta()?;
        Ok(Self {
            meta,
            instance: Mutex::new(instance),
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ExtensionInstance>> {
        self.instance
            .lock()
            .map_err(|_| ShioriError::Other("extension instance mutex poisoned".into()))
    }
}

#[async_trait]
impl Source for WasmSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        self.meta.clone()
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        let mut items = self.lock()?.invoke_search(query, page)?;
        for item in &mut items {
            if item.source_id.is_empty() {
                item.source_id.clone_from(&self.meta.id);
            }
        }
        Ok(items)
    }

    async fn browse(
        &self,
        _mode: &str,
        _page: u32,
        _limit: u32,
        _genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let mut items = self.lock()?.invoke_browse()?;
        for item in &mut items {
            if item.source_id.is_empty() {
                item.source_id.clone_from(&self.meta.id);
            }
        }
        Ok(items)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        self.lock()?.invoke_chapters(content_id).map_err(Into::into)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        self.lock()?.invoke_pages(chapter_id).map_err(Into::into)
    }

    async fn health_check(&self) -> Result<SourceHealth> {
        self.lock()?.invoke_health().map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::test_wasm;

    #[tokio::test]
    async fn hello_world_end_to_end() {
        let source = WasmSource::new(&test_wasm::hello(), HostOptions::default())
            .expect("hello module constructs a source");
        let meta = source.meta();
        assert_eq!(meta.id, "hello.test");
        assert_eq!(meta.name, "Hello WASM");

        let results = source.search("test", 1).await.expect("search maps");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, "1");
        assert_eq!(results[0].title, "Result One");
        assert_eq!(results[0].source_id, "hello.test");
        assert_eq!(results[1].title, "Result Two");

        let chapters = source
            .get_chapters("hello.test")
            .await
            .expect("chapters map");
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].number, 1.0);

        let pages = source.get_pages("c1").await.expect("pages map");
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].index, 0);
        assert_eq!(pages[1].url, "https://example.test/1.jpg");

        let health = source.health_check().await.expect("health maps");
        assert_eq!(health, SourceHealth::Available);
    }

    #[tokio::test]
    async fn malformed_module_is_an_extension_error() {
        let result = WasmSource::new(&test_wasm::not_wasm(), HostOptions::default());
        let err = match result {
            Err(e) => e,
            Ok(_) => panic!("garbage must fail at load"),
        };
        assert!(matches!(err, ExtensionError::Load(_)));
    }

    #[tokio::test]
    async fn extension_errors_map_to_shiorierror() {
        let source = WasmSource::new(
            &test_wasm::returns_error_envelope(),
            HostOptions::default(),
        )
        .expect("module with error envelope loads");
        let err = source.search("x", 1).await.expect_err("error envelope");
        assert!(
            matches!(
                err,
                ShioriError::Source(crate::sources::SourceError::Unknown(ref msg))
                    if msg.contains("search_broken")
            ),
            "expected ShioriError::Source(Unknown(...)) with kind, got {err:?}"
        );
    }
}