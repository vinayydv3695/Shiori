use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::error::{Result, ShioriError};
use crate::sources::{ContentType, Source, SourceMeta};

#[derive(Default)]
pub struct SourceRegistry {
    sources: HashMap<String, Arc<dyn Source>>,
    /// Source ids that are disabled by the user. Registered sources start
    /// enabled; unknown ids are treated as enabled (default-true).
    enabled: HashSet<String>,
}

impl SourceRegistry {
    pub fn new() -> Self {
        Self {
            sources: HashMap::new(),
            enabled: HashSet::new(),
        }
    }

    pub fn register(&mut self, source: Arc<dyn Source>) {
        let id = source.meta().id;
        self.sources.insert(id, source);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn Source>> {
        self.sources.get(id).cloned()
    }

    pub fn get_all(&self) -> Vec<Arc<dyn Source>> {
        self.sources.values().cloned().collect()
    }

    pub fn list(&self) -> Vec<SourceMeta> {
        self.sources.values().map(|s| s.meta()).collect()
    }

    pub fn list_by_type(&self, content_type: ContentType) -> Vec<SourceMeta> {
        self.sources
            .values()
            .map(|s| s.meta())
            .filter(|m| m.content_type == content_type)
            .collect()
    }

    /// Enable or disable a source. Errors on unknown ids.
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()> {
        if !self.sources.contains_key(id) {
            return Err(ShioriError::Validation(format!(
                "Unknown source: {}",
                id
            )));
        }
        if enabled {
            self.enabled.remove(id);
        } else {
            self.enabled.insert(id.to_string());
        }
        Ok(())
    }

    /// Whether a source is enabled. Unknown ids default to enabled.
    pub fn is_enabled(&self, id: &str) -> bool {
        !self.enabled.contains(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::SourceError;
    use async_trait::async_trait;

    struct DummySource;

    #[async_trait]
    impl Source for DummySource {
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
        fn meta(&self) -> SourceMeta {
            SourceMeta {
                id: "dummy".into(),
                name: "Dummy".into(),
                base_url: "https://dummy.test".into(),
                version: "1.0.0".into(),
                content_type: ContentType::Manga,
                supports_search: true,
                supports_download: false,
                requires_api_key: false,
                nsfw: false,
            }
        }
        async fn search(&self, _q: &str, _p: u32) -> Result<Vec<crate::sources::SearchResult>> {
            Ok(vec![])
        }
        async fn get_chapters(&self, _id: &str) -> Result<Vec<crate::sources::Chapter>> {
            Ok(vec![])
        }
        async fn get_pages(&self, _id: &str) -> Result<Vec<crate::sources::Page>> {
            Ok(vec![])
        }
    }

    fn registry() -> SourceRegistry {
        let mut r = SourceRegistry::new();
        r.register(Arc::new(DummySource));
        r
    }

    #[test]
    fn unknown_ids_are_enabled_by_default() {
        let r = registry();
        assert!(r.is_enabled("dummy"));
        assert!(r.is_enabled("not-a-source"));
    }

    #[test]
    fn set_enabled_toggles() {
        let mut r = registry();
        r.set_enabled("dummy", false).unwrap();
        assert!(!r.is_enabled("dummy"));
        r.set_enabled("dummy", true).unwrap();
        assert!(r.is_enabled("dummy"));
    }

    #[test]
    fn set_enabled_unknown_id_errors() {
        let mut r = registry();
        let err = r.set_enabled("nope", false).unwrap_err();
        match err {
            ShioriError::Validation(_) => {}
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn disabled_source_maps_to_source_disabled_error() {
        let e: crate::error::ShioriError = SourceError::SourceDisabled.into();
        assert_eq!(e.to_string(), SourceError::SourceDisabled.user_message());
    }
}
