use std::collections::HashMap;
use std::sync::Arc;

use crate::sources::{ContentType, Source, SourceMeta};

#[derive(Default)]
pub struct SourceRegistry {
    sources: HashMap<String, Arc<dyn Source>>,
}

impl SourceRegistry {
    pub fn new() -> Self {
        Self {
            sources: HashMap::new(),
        }
    }

    pub fn register(&mut self, source: Arc<dyn Source>) {
        let id = source.meta().id;
        self.sources.insert(id, source);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn Source>> {
        self.sources.get(id).cloned()
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
}
