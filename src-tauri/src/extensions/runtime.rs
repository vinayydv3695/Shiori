//! `wasmi`-based extension runtime.
//!
//! Owns one [`ExtensionInstance`]: a `wasmi` [`Engine`]/[`Store`] holding an
//! instantiated module plus the host environment ([`InstanceState`]).
//!
//! Safety model (Plan §5, Phase 1 subset):
//! - **Fuel metering**: every instruction consumes fuel; each call resets a
//!   per-call budget, so runaway loops trap with `TrapCode::OutOfFuel`.
//! - **Memory cap**: a [`StoreLimits`] resource limiter caps linear memory
//!   growth (64 MB default; overridable via [`HostOptions`]); exceeding it
//!   traps with `TrapCode::GrowthOperationLimited`. `trap_on_grow_failure` is
//!   enabled so a denied growth aborts the extension instead of silently
//!   failing the op.
//! - **Wall-clock guard**: `Instant` checks bracket every call. Runtime
//!   interruption mid-instruction needs wasmi's fuel exhaustion (a trap you
//!   cannot deliver from outside), so the fuel budget is the *hard* stop; the
//!   wall-clock guard is a second line that flags calls which somehow ran
//!   long even after fuel accounting.
//! - **Bounds checks**: every pointer/len read from the extension is validated
//!   against linear memory before use (see `read_bytes` / `byte_len_prefix`).
//!
//! All calls are serialized by the caller ([`WasmSource`] wraps the instance
//! in a `Mutex`) because [`Source`](crate::sources::Source) requires `Sync`
//! and wasmi's `Store` is `!Sync`.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde_json::json;
use wasmi::{
    core::TrapCode,
    Config, Engine, Func, Instance, Linker, Memory, Module, Store, StoreLimits,
    StoreLimitsBuilder, Val,
};

use crate::extensions::ExtResult;
use crate::sources::{Chapter, Page, SearchResult, SourceHealth, SourceMeta};

use super::abi::{self, Method, Request, Response};
use super::host::{register_host_functions, HostEnv};
use super::ExtensionError;

/// Default per-call fuel budget (units). wasmi's default fuel costs report
/// units also consumed per argument; the defaults are small single-digit
/// costs, so 10M units is ≳ several million instructions per call.
pub const DEFAULT_FUEL_BUDGET: u64 = 10_000_000;
/// Default wall-clock guard around each `invoke` call.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
/// Default cap on the extension's response buffer (length prefix + JSON).
pub const DEFAULT_MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
/// Default cap on the extension's linear memory.
pub const DEFAULT_MEMORY_LIMIT_BYTES: usize = 64 * 1024 * 1024;

/// Tune how hostile the sandbox is. Defaults are conservative; tests shrink
/// the memory cap / fuel budget to prove the guards.
#[derive(Debug, Clone)]
pub struct HostOptions {
    pub memory_limit_bytes: usize,
    pub fuel_budget: u64,
    pub timeout: Duration,
    pub max_response_bytes: usize,
    /// Hosts the extension is permitted to fetch from (empty = http disabled).
    pub http_allowlist: Vec<String>,
    /// Per-request timeout override for `host_http_fetch`. `None` (the
    /// production default) keeps the 15 s
    /// [`crate::extensions::host::HTTP_TIMEOUT`]; tests shrink it to prove
    /// the fetch-timeout guard.
    pub http_timeout: Option<Duration>,
    /// Extension id; sent as the `Shiori-Extension/<id>` http UA header.
    pub extension_id: String,
    /// Phase 2A: per-extension file-backed KV path (`storage.json`). `None`
    /// keeps the Phase 1 in-memory-only store.
    pub kv_path: Option<PathBuf>,
}

impl Default for HostOptions {
    fn default() -> Self {
        Self {
            memory_limit_bytes: DEFAULT_MEMORY_LIMIT_BYTES,
            fuel_budget: DEFAULT_FUEL_BUDGET,
            timeout: DEFAULT_TIMEOUT,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
            http_allowlist: Vec::new(),
            http_timeout: None,
            extension_id: "unknown".into(),
            kv_path: None,
        }
    }
}

/// Per-instance host state: the resource limiter and the host environment
/// (KV store, http allowlist) that `shiori.*` imports read/write.
pub struct InstanceState {
    pub limiter: StoreLimits,
    pub env: HostEnv,
}

/// A single sandboxed WASM extension instance.
pub struct ExtensionInstance {
    store: Store<InstanceState>,
    invoke: Func,
    alloc: Func,
    memory: Memory,
    fuel_budget: u64,
    timeout: Duration,
    max_response_bytes: usize,
}

impl ExtensionInstance {
    /// Parses, links and instantiates `wasm`. Never panics — all failures
    /// surface as [`ExtensionError::Load`] / `Malformed`.
    pub fn new(wasm: &[u8], opts: HostOptions) -> ExtResult<Self> {
        let mut config = Config::default();
        config.consume_fuel(true);
        let engine = Engine::new(&config);

        let mut env = HostEnv {
            kv: std::collections::HashMap::new(),
            http_allowlist: opts.http_allowlist,
            kv_path: opts.kv_path.clone(),
            extension_id: opts.extension_id.clone(),
            http_timeout: opts.http_timeout,
            http_client: None,
        };
        if let Some(path) = opts.kv_path.as_deref() {
            if let Err(e) = env.load_from(path) {
                log::warn!("[extension] kv storage could not be loaded from {path:?}: {e}");
            }
        }
        let state = InstanceState {
            limiter: StoreLimitsBuilder::new()
                .memory_size(opts.memory_limit_bytes)
                .trap_on_grow_failure(true)
                .build(),
            env,
        };
        let mut store = Store::new(&engine, state);
        store
            .set_fuel(opts.fuel_budget)
            .map_err(|e| ExtensionError::Load(format!("fuel setup failed: {e}")))?;
        // Resource limiting is driven through the store's user data.
        store.limiter(|state: &mut InstanceState| &mut state.limiter);

        let module = Module::new(&engine, wasm)
            .map_err(|e| ExtensionError::Load(format!("module parse failed: {e}")))?;

        let mut linker = Linker::new(&engine);
        register_host_functions(&mut linker)
            .map_err(|e| ExtensionError::Load(format!("host function link failed: {e}")))?;

        let instance = linker
            .instantiate(&mut store, &module)
            .and_then(|pre| pre.start(&mut store))
            .map_err(|e| ExtensionError::Load(format!("instantiation failed: {e}")))?;

        let memory = exported_memory(&instance, &store)
            .ok_or_else(|| ExtensionError::Load("module must export `memory`".into()))?;
        let alloc = exported_func(&instance, &store, "alloc")
            .ok_or_else(|| ExtensionError::Load("module must export `alloc(i32)->i32`".into()))?;
        // Fail fast on wrong signatures rather than at call time.
        let _ = alloc
            .typed::<(i32,), (i32,)>(&store)
            .map_err(|e| ExtensionError::Load(format!("`alloc` must be (i32)->i32: {e}")))?;
        let invoke = exported_func(&instance, &store, "invoke")
            .ok_or_else(|| ExtensionError::Load("module must export `invoke(i32,i32)->i32`".into()))?;
        let _ = invoke
            .typed::<(i32, i32), (i32,)>(&store)
            .map_err(|e| ExtensionError::Load(format!("`invoke` must be (i32,i32)->i32: {e}")))?;

        Ok(Self {
            store,
            invoke,
            alloc,
            memory,
            fuel_budget: opts.fuel_budget,
            timeout: opts.timeout,
            max_response_bytes: opts.max_response_bytes,
        })
    }

    /// Runs one request through the exported `invoke` and parses the
    /// length-prefixed JSON response. Serializes every step behind the
    /// caller's mutex (this method requires `&mut self`).
    pub fn invoke(&mut self, req: &Request) -> ExtResult<Response> {
        let payload = serde_json::to_vec(req)
            .map_err(|e| ExtensionError::Malformed(format!("serialize request: {e}")))?;
        if payload.len() > i32::MAX as usize {
            return Err(ExtensionError::Malformed("request too large for i32 addressing".into()));
        }

        // Fresh fuel budget for this call.
        self.store
            .set_fuel(self.fuel_budget)
            .map_err(|e| ExtensionError::Invoke(format!("fuel reset failed: {e}")))?;

        // Ask the extension for a scratch buffer for the request.
        let mut out = [Val::I32(0)];
        self.alloc
            .call(
                &mut self.store,
                &[Val::I32(payload.len() as i32)],
                &mut out,
            )
            .map_err(|e| self.map_call_error(e, "alloc"))?;
        let req_ptr = out[0].i32().ok_or_else(|| {
            ExtensionError::Malformed("alloc did not return an i32 pointer".into())
        })?;
        self.write_bytes(req_ptr, &payload)?;

        // Wall-clock guard: fuel is the hard stop (see module docs); this
        // catches anything that outlives the budget despite metering.
        let started = Instant::now();
        let mut out = [Val::I32(0)];
        let call_result = self.invoke.call(
            &mut self.store,
            &[Val::I32(req_ptr), Val::I32(payload.len() as i32)],
            &mut out,
        );
        let elapsed = started.elapsed();

        let resp_ptr = match call_result {
            Ok(()) => out[0].i32(),
            Err(e) => return Err(self.map_call_error(e, "invoke")),
        }
        .ok_or_else(|| ExtensionError::Malformed("invoke did not return an i32 pointer".into()))?;

        if elapsed > self.timeout {
            return Err(ExtensionError::Timeout);
        }

        let resp_bytes = self.read_length_prefixed(resp_ptr)?;
        let resp = std::str::from_utf8(&resp_bytes)
            .map_err(|e| ExtensionError::Malformed(format!("response is not utf-8: {e}")))?;
        serde_json::from_str::<Response>(resp)
            .map_err(|e| ExtensionError::Malformed(format!("invalid response envelope: {e}")))
    }

    // -- Source-level conveniences ------------------------------------------

    pub fn invoke_meta(&mut self) -> ExtResult<SourceMeta> {
        let data = self.raw_invoke(Method::Meta, json!({}))?;
        abi::meta_from_value(&data)
    }

    pub fn invoke_search(
        &mut self,
        query: &str,
        page: u32,
    ) -> ExtResult<Vec<SearchResult>> {
        let data = self.raw_invoke(
            Method::Search,
            json!({ "query": query, "page": page }),
        )?;
        abi::results_from_value(&data)
    }

    pub fn invoke_browse(&mut self) -> ExtResult<Vec<SearchResult>> {
        let data = self.raw_invoke(Method::Browse, json!({}))?;
        abi::results_from_value(&data)
    }

    pub fn invoke_chapters(&mut self, content_id: &str) -> ExtResult<Vec<Chapter>> {
        let data = self.raw_invoke(Method::Chapters, json!({ "contentId": content_id }))?;
        abi::chapters_from_value(&data)
    }

    pub fn invoke_pages(&mut self, chapter_id: &str) -> ExtResult<Vec<Page>> {
        let data = self.raw_invoke(Method::Pages, json!({ "chapterId": chapter_id }))?;
        abi::pages_from_value(&data)
    }

    pub fn invoke_health(&mut self) -> ExtResult<SourceHealth> {
        let data = self.raw_invoke(Method::Health, json!({}))?;
        abi::health_from_value(&data)
    }

    /// `invoke` + unwrap the envelope into its `data` payload.
    pub fn raw_invoke(&mut self, method: Method, params: serde_json::Value) -> ExtResult<serde_json::Value> {
        self.invoke(&Request::new(method, params))?.into_data()
    }

    // -- memory plumbing -----------------------------------------------------

    /// Reads `len` bytes at `ptr`, bounds-checked against linear memory.
    fn read_bytes(&self, ptr: i32, len: usize) -> ExtResult<Vec<u8>> {
        let start = valid_range(ptr, len, self.memory.data_size(&self.store))?;
        let mut buf = vec![0u8; len];
        self.memory
            .read(&self.store, start, &mut buf)
            .map_err(|e| ExtensionError::Malformed(format!("oob memory read: {e}")))?;
        Ok(buf)
    }

    /// Writes `bytes` at `ptr`, bounds-checked against linear memory.
    fn write_bytes(&mut self, ptr: i32, bytes: &[u8]) -> ExtResult<()> {
        let start = valid_range(ptr, bytes.len(), self.memory.data_size(&self.store))?;
        self.memory
            .write(&mut self.store, start, bytes)
            .map_err(|e| ExtensionError::Malformed(format!("oob memory write: {e}")))
    }

    /// Reads the response buffer: 4-byte little-endian length prefix followed
    /// by the JSON payload, rejecting anything over `max_response_bytes`.
    fn read_length_prefixed(&self, ptr: i32) -> ExtResult<Vec<u8>> {
        let size = self.memory.data_size(&self.store);
        let start = valid_range(ptr, 4, size)?;
        let mut head = [0u8; 4];
        self.memory
            .read(&self.store, start, &mut head)
            .map_err(|e| ExtensionError::Malformed(format!("oob memory read: {e}")))?;
        let payload_len = u32::from_le_bytes(head) as usize;
        if payload_len > self.max_response_bytes {
            return Err(ExtensionError::Malformed(format!(
                "response too large: {payload_len} bytes (cap {})",
                self.max_response_bytes
            )));
        }
        let payload_start = start + 4;
        let end = payload_start
            .checked_add(payload_len)
            .ok_or_else(|| ExtensionError::Malformed("response range overflow".into()))?;
        if end > size {
            return Err(ExtensionError::Malformed(format!(
                "response out of bounds: [{payload_start}, {end}) > {size}"
            )));
        }
        let mut buf = vec![0u8; payload_len];
        self.memory
            .read(&self.store, payload_start, &mut buf)
            .map_err(|e| ExtensionError::Malformed(format!("oob memory read: {e}")))?;
        Ok(buf)
    }

    /// Classifies wasmi call errors into stable [`ExtensionError`] variants.
    fn map_call_error(&self, e: wasmi::Error, what: &str) -> ExtensionError {
        match e.as_trap_code() {
            Some(TrapCode::OutOfFuel) => ExtensionError::Timeout,
            Some(TrapCode::GrowthOperationLimited) => ExtensionError::MemoryLimit,
            Some(code) => ExtensionError::Invoke(format!("{what} trapped: {code}")),
            None => ExtensionError::Invoke(format!("{what} failed: {e}")),
        }
    }
}

/// Validates `[ptr, ptr+len)` is within `mem_size`; returns the usize start.
fn valid_range(ptr: i32, len: usize, mem_size: usize) -> ExtResult<usize> {
    if ptr < 0 {
        return Err(ExtensionError::Malformed("negative memory pointer".into()));
    }
    let start = ptr as usize;
    let end = start
        .checked_add(len)
        .ok_or_else(|| ExtensionError::Malformed("pointer + length overflow".into()))?;
    if end > mem_size {
        return Err(ExtensionError::Malformed(format!(
            "memory access out of bounds: [{start}, {end}) > {mem_size}"
        )));
    }
    Ok(start)
}

fn exported_memory(instance: &Instance, store: &Store<InstanceState>) -> Option<Memory> {
    instance.get_export(store, "memory")?.into_memory()
}

fn exported_func(instance: &Instance, store: &Store<InstanceState>, name: &str) -> Option<Func> {
    instance.get_export(store, name)?.into_func()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use crate::extensions::test_wasm;
    use crate::extensions::ExtensionError;

    fn opts() -> HostOptions {
        HostOptions::default()
    }

    #[test]
    fn malformed_bytes_is_load_error() {
        let result = ExtensionInstance::new(b"definitely not wasm \x00\x01\x02", opts());
        let err = match result {
            Err(e) => e,
            Ok(_) => panic!("garbage bytes must not instantiate"),
        };
        assert!(
            matches!(err, ExtensionError::Load(_)),
            "expected Load error, got {err:?}"
        );
    }

    #[test]
    fn missing_exports_is_load_error() {
        let result = ExtensionInstance::new(&test_wasm::no_exports(), opts());
        let err = match result {
            Err(e) => e,
            Ok(_) => panic!("module without required exports must fail"),
        };
        assert!(matches!(err, ExtensionError::Load(_)));
    }

    #[test]
    fn hello_round_trip_via_invoke() {
        let mut inst =
            ExtensionInstance::new(&test_wasm::hello(), opts()).expect("hello module loads");
        let data = inst.raw_invoke(Method::Meta, json!({})).expect("meta call ok");
        let meta = abi::meta_from_value(&data).expect("meta maps");
        assert_eq!(meta.id, "hello.test");
        assert_eq!(meta.name, "Hello WASM");

        let items = inst
            .invoke_search("test", 1)
            .expect("search call ok");
        assert_eq!(items.len(), 2, "hello module returns 2 search results");
        assert_eq!(items[0].id, "1");
        assert_eq!(items[0].title, "Result One");
        assert_eq!(items[1].title, "Result Two");
    }

    #[test]
    fn wasm_trap_is_invoke_error_not_panic() {
        let mut inst =
            ExtensionInstance::new(&test_wasm::traps(), opts()).expect("trapping module loads");
        let err = inst.raw_invoke(Method::Meta, json!({})).expect_err("unreachable must trap");
        assert!(matches!(err, ExtensionError::Invoke(_)));
    }

    #[test]
    fn infinite_loop_exhausts_fuel_quickly() {
        let mut inst = ExtensionInstance::new(
            &test_wasm::infinite_loop(),
            HostOptions {
                fuel_budget: 1_000_000,
                ..opts()
            },
        )
        .expect("loop module loads");
        let started = std::time::Instant::now();
        let err = inst.raw_invoke(Method::Meta, json!({})).expect_err("loop must be stopped");
        assert!(
            matches!(err, ExtensionError::Timeout),
            "expected Timeout, got {err:?}"
        );
        assert!(
            started.elapsed() < std::time::Duration::from_secs(5),
            "fuel exhaustion must finish quickly"
        );
    }

    /// Over-ambitious memory growth triggers the limiter's trap path.
    #[test]
    fn memory_growth_over_cap_is_rejected() {
        let mut inst = ExtensionInstance::new(
            &test_wasm::grows_memory(),
            HostOptions {
                // Module starts at 64 KiB (1 page); cap is exactly one page.
                memory_limit_bytes: 64 * 1024,
                ..opts()
            },
        )
        .expect("grow module loads");
        let err = inst.raw_invoke(Method::Meta, json!({})).expect_err("growth must be denied");
        assert!(
            matches!(err, ExtensionError::MemoryLimit),
            "expected MemoryLimit, got {err:?}"
        );
    }

    #[test]
    fn host_kv_round_trip_in_memory() {
        let mut inst =
            ExtensionInstance::new(&test_wasm::kv_roundtrip(), opts()).expect("kv module loads");
        // KV persists across calls (Phase 1: per-instance HashMap).
        for _ in 0..2 {
            let data = inst
                .raw_invoke(Method::Meta, json!({}))
                .expect("kv passthrough is an ok envelope");
            assert_eq!(
                data["value"],
                json!("hello-val"),
                "kv_get must return what kv_set stored"
            );
        }
    }

    #[test]
    fn host_http_fetch_is_disabled_without_allowlist() {
        let mut inst =
            ExtensionInstance::new(&test_wasm::http_fetch(), opts()).expect("http module loads");
        let err = inst.raw_invoke(Method::Meta, json!({})).expect_err("http must be disabled");
        let msg = err.to_string();
        assert!(
            msg.contains("http_disabled"),
            "expected http_disabled error, got: {msg}"
        );
        assert!(!msg.contains("http_not_implemented"));
    }

    #[test]
    fn host_http_fetch_denies_cleartext_for_https_only_allowlist() {
        let mut inst = ExtensionInstance::new(
            &test_wasm::http_fetch_dynamic(),
            HostOptions {
                http_allowlist: vec!["https://api.example.com".into()],
                ..opts()
            },
        )
        .expect("http module loads");
        // The allowlist entry is https-only: an http URL for the same host
        // must be denied by the scheme rule, before any network is touched.
        let err = inst
            .raw_invoke(
                Method::Meta,
                json!({ "url": "http://api.example.com/items", "method": "GET" }),
            )
            .expect_err("cleartext must be denied");
        let msg = err.to_string();
        assert!(
            msg.contains("http_disabled"),
            "scheme mismatch should deny, got: {msg}"
        );
        assert!(!msg.contains("http_not_implemented"));
    }
}