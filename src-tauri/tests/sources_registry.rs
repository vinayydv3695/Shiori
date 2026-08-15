//! Integration tests for the source registry: register / get / enable-state.

use std::sync::Arc;

use async_trait::async_trait;

use shiori::error::Result;
use shiori::sources::registry::SourceRegistry;
use shiori::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

struct DummySource(&'static str);

#[async_trait]
impl Source for DummySource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: self.0.to_string(),
            name: format!("Dummy {}", self.0),
            base_url: "https://dummy.test".to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: false,
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, _q: &str, _p: u32) -> Result<Vec<SearchResult>> {
        Ok(vec![])
    }

    async fn get_chapters(&self, _id: &str) -> Result<Vec<Chapter>> {
        Ok(vec![])
    }

    async fn get_pages(&self, _id: &str) -> Result<Vec<Page>> {
        Ok(vec![])
    }
}

#[test]
fn register_defaults_to_enabled_and_get_returns_registered_arc() {
    let mut registry = SourceRegistry::new();
    let source: Arc<dyn Source> = Arc::new(DummySource("alpha"));
    registry.register(source.clone());

    // Registered sources start enabled (default-true).
    assert!(registry.is_enabled("alpha"));

    // get returns the exact Arc that was registered.
    let got = registry.get("alpha").expect("registered source retrievable");
    assert!(Arc::ptr_eq(&source, &got));
    assert_eq!(got.meta().id, "alpha");

    // Unknown ids are not retrievable but default to enabled.
    assert!(registry.get("missing").is_none());
    assert!(registry.is_enabled("missing"));
}

#[test]
fn set_enabled_toggles_state() {
    let mut registry = SourceRegistry::new();
    registry.register(Arc::new(DummySource("beta")));

    assert!(registry.is_enabled("beta"));

    registry.set_enabled("beta", false).unwrap();
    assert!(!registry.is_enabled("beta"));

    registry.set_enabled("beta", true).unwrap();
    assert!(registry.is_enabled("beta"));
}

#[test]
fn set_enabled_on_unknown_id_errors() {
    let mut registry = SourceRegistry::new();
    registry.register(Arc::new(DummySource("gamma")));

    let err = registry.set_enabled("missing", false).unwrap_err();
    match err {
        shiori::error::ShioriError::Validation(_) => {}
        other => panic!("expected Validation error, got {other:?}"),
    }

    // The failed call must not have changed the default-enabled state.
    assert!(registry.is_enabled("missing"));
}
