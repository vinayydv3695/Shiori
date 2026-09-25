//! Extension manifest model (Phase 2A).
//!
//! An [`ExtensionManifest`] is the installed extension's identity document,
//! persisted as `root/<id>/manifest.json`. It is derived from the
//! extension's own `meta` ABI response (via [`ExtensionManifest::from_meta`]),
//! then **validated host-side** ([`ExtensionManifest::validate`]) — the
//! extension never supplies the manifest itself, so a lying `meta` payload is
//! rejected before anything is installed.
//!
//! Every field is serialized `camelCase` to match the app-wide JSON
//! convention. `permissions.hosts` is the http-fetch allowlist (Phase 3);
//! [`from_meta`](ExtensionManifest::from_meta) leaves it empty (deny-all) and
//! Phase 2B/3 fills it out.

use serde::{Deserialize, Serialize};

use crate::sources::{ContentType, SourceMeta};

use super::ExtensionError;
use super::ExtResult;

/// Host permissions granted to an extension. Currently only the http fetch
/// allowlist; empty = deny all network (the safe default).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionPermissions {
    /// Exact-prefix host strings, e.g. `"https://api.example.com"`. Scheme is
    /// mandatory (`https://`) — scheme-less hosts are rejected by
    /// [`ExtensionManifest::validate`].
    pub hosts: Vec<String>,
}

/// Installed metadata for one extension (`manifest.json` on disk).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifest {
    /// Unique id, `^[a-z0-9][a-z0-9._-]{1,63}$` (doubles as the install dir
    /// name, so the charset is restrictive on purpose).
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Semantic version string.
    pub version: String,
    /// Optional UI/impl language tag (e.g. `"en"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    /// Optional canonical base URL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// What kind of content this source produces.
    pub content_type: ContentType,
    /// Whether it publishes adult content.
    pub nsfw: bool,
    /// Minimum app version required, when known (checked by the installer).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_app_version: Option<String>,
    /// Host permissions; empty by default (deny-all).
    pub permissions: ExtensionPermissions,
}

impl ExtensionManifest {
    /// Derives a manifest from the extension's own `meta` ABI response.
    ///
    /// Permissions start empty (deny-all): the extension cannot grant itself
    /// network rights — an install-time/update-time policy fills them in
    /// (Phase 3 repo indexes may carry signed permission sets).
    pub fn from_meta(meta: &SourceMeta) -> Self {
        Self {
            id: meta.id.clone(),
            name: meta.name.clone(),
            version: meta.version.clone(),
            lang: None,
            base_url: if meta.base_url.is_empty() {
                None
            } else {
                Some(meta.base_url.clone())
            },
            content_type: meta.content_type.clone(),
            nsfw: meta.nsfw,
            min_app_version: None,
            permissions: ExtensionPermissions { hosts: Vec::new() },
        }
    }

    /// Validates the manifest host-side. Checks (no regex — plain char
    /// checks): non-empty id matching `^[a-z0-9][a-z0-9._-]{1,63}$`,
    /// non-empty version, and every `permissions.hosts` entry being a
    /// non-empty `https://` URL (no scheme-less hosts).
    pub fn validate(&self) -> ExtResult<()> {
        if self.id.is_empty() {
            return Err(ExtensionError::Malformed(
                "invalid manifest: `id` must not be empty".into(),
            ));
        }
        if !valid_id(&self.id) {
            return Err(ExtensionError::Malformed(format!(
                "invalid manifest: `id` {:?} must match ^[a-z0-9][a-z0-9._-]{{1,63}}$",
                self.id
            )));
        }
        if self.version.trim().is_empty() {
            return Err(ExtensionError::Malformed(
                "invalid manifest: `version` must not be empty".into(),
            ));
        }
        for host in &self.permissions.hosts {
            let Some(authority) = host.strip_prefix("https://") else {
                return Err(ExtensionError::Malformed(format!(
                    "invalid manifest: host {host:?} must start with https:// (no scheme-less hosts)"
                )));
            };
            if authority.is_empty() || authority.starts_with('/') || authority.contains(char::is_whitespace)
            {
                return Err(ExtensionError::Malformed(format!(
                    "invalid manifest: host {host:?} is not an https:// URL with a host"
                )));
            }
        }
        Ok(())
    }
}

/// Character-level implementation of `^[a-z0-9][a-z0-9._-]{1,63}$`
/// (total length 2..=64). No regex needed for such a small charset.
fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
        _ => return false,
    }
    let mut len = 1usize;
    for c in chars {
        len += 1;
        if !(c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-')) {
            return false;
        }
    }
    (2..=64).contains(&len)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::ContentType;

    fn sample_meta() -> SourceMeta {
        SourceMeta {
            id: "hello.test".into(),
            name: "Hello WASM".into(),
            base_url: "https://example.test".into(),
            version: "0.1.0".into(),
            content_type: ContentType::Book,
            supports_search: true,
            supports_download: false,
            requires_api_key: false,
            nsfw: false,
        }
    }

    #[test]
    fn from_meta_derives_manifest_with_deny_all_permissions() {
        let m = ExtensionManifest::from_meta(&sample_meta());
        assert_eq!(m.id, "hello.test");
        assert_eq!(m.name, "Hello WASM");
        assert_eq!(m.version, "0.1.0");
        assert_eq!(m.content_type, ContentType::Book);
        assert!(!m.nsfw);
        assert_eq!(m.base_url.as_deref(), Some("https://example.test"));
        assert!(m.lang.is_none());
        assert!(m.min_app_version.is_none());
        assert!(m.permissions.hosts.is_empty(), "from_meta must default to deny-all");
        m.validate().expect("derived manifest must validate");
    }

    #[test]
    fn empty_meta_base_url_becomes_none() {
        let mut meta = sample_meta();
        meta.base_url.clear();
        let m = ExtensionManifest::from_meta(&meta);
        assert_eq!(m.base_url, None);
    }

    #[test]
    fn valid_id_shapes_are_accepted() {
        for id in ["hello.test", "com.github.owner.name", "a1-b_c.d", "abc_2"] {
            let mut m = ExtensionManifest::from_meta(&sample_meta());
            m.id = id.into();
            assert!(m.validate().is_ok(), "id {id:?} must be valid");
        }
    }

    #[test]
    fn invalid_ids_are_rejected() {
        let bad: Vec<String> = vec![
            "".into(),          // empty
            "A".into(),         // uppercase + too short
            "-leading-dash".into(), // must start alnum
            "_underscore".into(),   // must start alnum
            "a".into(),         // too short (min 2)
            "a".repeat(65),     // too long (max 64)
            "has space".into(), // whitespace
            "sla/sh".into(),    // not in charset
        ];
        for id in bad {
            let mut m = ExtensionManifest::from_meta(&sample_meta());
            m.id = id.clone();
            assert!(
                m.validate().is_err(),
                "id {id:?} must be rejected: {}",
                m.validate().unwrap_err()
            );
        }
    }

    #[test]
    fn hosts_must_be_scheme_full_https() {
        for host in [
            "",
            "example.com",              // scheme-less
            "http://example.com",       // wrong scheme
            "https://",                 // no authority
            "https:///path",            // slashes before authority
            "https://exa mple.com",     // whitespace
        ] {
            let mut m = ExtensionManifest::from_meta(&sample_meta());
            m.permissions.hosts = vec![host.into()];
            assert!(m.validate().is_err(), "host {host:?} must be rejected");
        }
        for host in ["https://example.com", "https://api.test.org/v1/"] {
            let mut m = ExtensionManifest::from_meta(&sample_meta());
            m.permissions.hosts = vec![host.into()];
            assert!(m.validate().is_ok(), "host {host:?} must be accepted");
        }
    }

    #[test]
    fn empty_permissions_are_valid_deny_all() {
        let m = ExtensionManifest::from_meta(&sample_meta());
        assert!(m.validate().is_ok());
    }

    #[test]
    fn empty_version_rejected() {
        let mut m = ExtensionManifest::from_meta(&sample_meta());
        m.version.clear();
        assert!(m.validate().is_err());
    }

    #[test]
    fn serde_round_trip_preserves_all_fields() {
        let m = ExtensionManifest {
            id: "com.devbook.source".into(),
            name: "Devbook".into(),
            version: "2.1.3".into(),
            lang: Some("en".into()),
            base_url: Some("https://devbook.example".into()),
            content_type: ContentType::Manga,
            nsfw: true,
            min_app_version: Some("1.0.15".into()),
            permissions: ExtensionPermissions {
                hosts: vec!["https://api.devbook.example".into()],
            },
        };
        let json = serde_json::to_string_pretty(&m).expect("serialize");
        // camelCase keys on the wire.
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        for key in ["id", "name", "version", "lang", "baseUrl", "contentType", "nsfw", "minAppVersion", "permissions"] {
            assert!(value.get(key).is_some(), "missing camelCase key {key:?} in {json}");
        }
        assert_eq!(value["permissions"]["hosts"][0], "https://api.devbook.example");
        // Round trip is lossless.
        let back: ExtensionManifest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back, m);
    }

    #[test]
    fn serde_defaults_for_absent_optionals() {
        // Old/short manifests omit optional fields; they must deserialize
        // (this is what validate() then guards).
        let json = r#"{"id":"hi.test","name":"Hi","version":"1.0.0","contentType":"book","nsfw":false,"permissions":{"hosts":[]}}"#;
        let m: ExtensionManifest = serde_json::from_str(json).expect("optional fields must default");
        assert_eq!(m.id, "hi.test");
        assert!(m.lang.is_none() && m.base_url.is_none() && m.min_app_version.is_none());
        assert!(m.validate().is_ok());
    }
}