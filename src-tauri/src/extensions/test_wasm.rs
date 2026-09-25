//! Test-only WAT builders.
//!
//! The host machine has no `wasm32` target, so tests never compile Rust to
//! wasm — tiny modules are assembled from WAT via the `wat` dev-dependency
//! (`wat::parse_str`). Only compiled under `#[cfg(test)]`.
//!
//! All working modules implement the same ABI exports:
//! - `memory`
//! - `alloc(n: i32) -> i32` (bump allocator)
//! - `invoke(req_ptr: i32, req_len: i32) -> i32` returning a pointer to a
//!   little-endian u32 length prefix followed by the JSON envelope bytes.

/// Parses a WAT source into wasm bytes (panics on invalid WAT — test helper).
pub(crate) fn wat(src: &str) -> Vec<u8> {
    wat::parse_str(src).expect("test WAT must parse")
}

/// Mutually-recursive-safe string concat for the shared function fragments.
fn concat(parts: &[&str]) -> String {
    parts.concat()
}

/// Fragment: bump allocator + strlen + byte copy + len-prefixed emit.
const COMMON_FUNCS: &str = r#"
  (global $heap (mut i32) (i32.const 4096))
  (func $alloc (export "alloc") (param $n i32) (result i32)
    (local $p i32)
    (local.set $p (global.get $heap))
    (global.set $heap (i32.add (global.get $heap) (local.get $n)))
    (local.get $p))
  (func $strlen (param $p i32) (result i32)
    (local $i i32)
    (block $done (loop $again
      (br_if $done (i32.eqz (i32.load8_u (i32.add (local.get $p) (local.get $i)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $again)))
    (local.get $i))
  (func $copy_bytes (param $dst i32) (param $src i32) (param $n i32)
    (local $i i32)
    (block $done (loop $again
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store8 (i32.add (local.get $dst) (local.get $i))
                  (i32.load8_u (i32.add (local.get $src) (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $again))))
  (func $emit (param $src i32) (param $len i32) (result i32)
    (local $p i32)
    (local.set $p (call $alloc (i32.add (local.get $len) (i32.const 4))))
    (i32.store (local.get $p) (local.get $len))
    (call $copy_bytes (i32.add (local.get $p) (i32.const 4)) (local.get $src) (local.get $len))
    (local.get $p))
  (func $contains (param $hay i32) (param $hlen i32) (param $ndl i32) (param $nlen i32) (result i32)
    (local $h i32) (local $n i32) (local $ok i32)
    (block $h_done
      (loop $h_loop
        (br_if $h_done (i32.ge_u (local.get $h) (local.get $hlen)))
        (local.set $n (i32.const 0))
        (local.set $ok (i32.const 1))
        (block $n_done
          (loop $n_loop
            (br_if $n_done (i32.ge_u (local.get $n) (local.get $nlen)))
            (if (i32.ne
                  (i32.load8_u (i32.add (local.get $hay) (i32.add (local.get $h) (local.get $n))))
                  (i32.load8_u (i32.add (local.get $ndl) (local.get $n))))
              (then (local.set $ok (i32.const 0)) (br $n_done)))
            (local.set $n (i32.add (local.get $n) (i32.const 1)))
            (br $n_loop)))
        (if (local.get $ok) (then (return (i32.const 1))))
        (local.set $h (i32.add (local.get $h) (i32.const 1)))
        (br $h_loop)))
    (i32.const 0))
  (func $find (param $hay i32) (param $hlen i32) (param $ndl i32) (param $nlen i32) (result i32)
    (local $h i32) (local $n i32) (local $ok i32)
    (block $h_done
      (loop $h_loop
        (br_if $h_done (i32.ge_u (local.get $h) (local.get $hlen)))
        (local.set $n (i32.const 0))
        (local.set $ok (i32.const 1))
        (block $n_done
          (loop $n_loop
            (br_if $n_done (i32.ge_u (local.get $n) (local.get $nlen)))
            (if (i32.ne
                  (i32.load8_u (i32.add (local.get $hay) (i32.add (local.get $h) (local.get $n))))
                  (i32.load8_u (i32.add (local.get $ndl) (local.get $n))))
              (then (local.set $ok (i32.const 0)) (br $n_done)))
            (local.set $n (i32.add (local.get $n) (i32.const 1)))
            (br $n_loop)))
        (if (local.get $ok) (then (return (local.get $h))))
        (local.set $h (i32.add (local.get $h) (i32.const 1)))
        (br $h_loop)))
    (i32.const -1))
"#;

/// `invoke` dispatcher used by the hello module: branches on the method name
/// (substring search) and answers from fixed payload offsets.
const HELLO_TAIL: &str = r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    ;; exercise host imports on every call: log + clock
    (call $host_log (i32.const 2) (i32.const 128) (call $strlen (i32.const 128)))
    (drop (call $host_now_ms))
    (if (call $contains (local.get $req_ptr) (local.get $req_len) (i32.const 0) (call $strlen (i32.const 0)))
      (then (return (call $emit (i32.const 512) (call $strlen (i32.const 512))))))
    (if (call $contains (local.get $req_ptr) (local.get $req_len) (i32.const 16) (call $strlen (i32.const 16)))
      (then (return (call $emit (i32.const 900) (call $strlen (i32.const 900))))))
    (if (call $contains (local.get $req_ptr) (local.get $req_len) (i32.const 32) (call $strlen (i32.const 32)))
      (then (return (call $emit (i32.const 1300) (call $strlen (i32.const 1300))))))
    (if (call $contains (local.get $req_ptr) (local.get $req_len) (i32.const 48) (call $strlen (i32.const 48)))
      (then (return (call $emit (i32.const 1500) (call $strlen (i32.const 1500))))))
    (return (call $emit (i32.const 256) (call $strlen (i32.const 256)))))
"#;

const HELLO_HEAD: &str = r#"(module
  (import "shiori" "host_log" (func $host_log (param i32 i32 i32)))
  (import "shiori" "host_now_ms" (func $host_now_ms (result i64)))
  (import "shiori" "host_kv_get" (func $host_kv_get (param i32 i32) (result i32)))
  (import "shiori" "host_kv_set" (func $host_kv_set (param i32 i32 i32 i32) (result i32)))
  (import "shiori" "host_http_fetch" (func $host_http_fetch (param i32 i32) (result i32)))

  (memory (export "memory") 2)

  (data (i32.const 0) "search\00")
  (data (i32.const 16) "chapters\00")
  (data (i32.const 32) "pages\00")
  (data (i32.const 48) "health\00")
  (data (i32.const 64) "meta\00")
  (data (i32.const 128) "invoked\00")
  (data (i32.const 256) "{\"ok\":true,\"data\":{\"id\":\"hello.test\",\"name\":\"Hello WASM\",\"baseUrl\":\"https://example.test\",\"version\":\"0.1.0\",\"contentType\":\"book\",\"supportsSearch\":true,\"supportsDownload\":false,\"requiresApiKey\":false,\"nsfw\":false}}\00")
  (data (i32.const 512) "{\"ok\":true,\"data\":[{\"id\":\"1\",\"title\":\"Result One\",\"coverUrl\":null,\"description\":\"first\",\"sourceId\":\"hello.test\",\"extra\":{}},{\"id\":\"2\",\"title\":\"Result Two\",\"coverUrl\":null,\"description\":\"second\",\"sourceId\":\"hello.test\",\"extra\":{}}]}\00")
  (data (i32.const 900) "{\"ok\":true,\"data\":[{\"id\":\"c1\",\"title\":\"Chapter 1\",\"number\":1,\"volume\":null,\"uploadedAt\":null,\"sourceId\":\"hello.test\",\"contentId\":\"hello.test\"},{\"id\":\"c2\",\"title\":\"Chapter 2\",\"number\":2,\"volume\":null,\"uploadedAt\":null,\"sourceId\":\"hello.test\",\"contentId\":\"hello.test\"}]}\00")
  (data (i32.const 1300) "{\"ok\":true,\"data\":[{\"index\":0,\"url\":\"https://example.test/0.jpg\"},{\"index\":1,\"url\":\"https://example.test/1.jpg\"}]}\00")
  (data (i32.const 1500) "{\"ok\":true,\"data\":\"available\"}\00")
"#;

/// Full hello-world module: answers meta / search / chapters / pages / health.
pub(crate) fn hello() -> Vec<u8> {
    wat(&concat(&[HELLO_HEAD, COMMON_FUNCS, HELLO_TAIL, ")" ]))
}

/// Module with no `alloc` export -> must fail at load with a `Load` error.
pub(crate) fn no_exports() -> Vec<u8> {
    wat(
        r#"(module
  (memory (export "memory") 1)
  (func (export "invoke") (param i32 i32) (result i32) (i32.const 0)))"#,
    )
}

/// Module whose `invoke` hits `unreachable`.
pub(crate) fn traps() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (memory (export "memory") 1)"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param i32 i32) (result i32)
    (unreachable)))"#,
    ]))
}

/// Module whose `invoke` loops forever (fuel must stop it).
pub(crate) fn infinite_loop() -> Vec<u8> {
    wat(
        r#"(module
  (memory (export "memory") 1)
  (func (export "alloc") (param $n i32) (result i32)
    (local $p i32)
    (local.set $p (global.get $heap))
    (global.set $heap (i32.add (global.get $heap) (local.get $n)))
    (local.get $p))
  (global $heap (mut i32) (i32.const 1024))
  (func (export "invoke") (param i32 i32) (result i32)
    (block $forever (loop $l (br $l)))
    (i32.const 0)))"#,
    )
}

/// Module whose `invoke` grows memory far past the configured cap.
pub(crate) fn grows_memory() -> Vec<u8> {
    wat(
        r#"(module
  (memory (export "memory") 1)
  (func (export "alloc") (param $n i32) (result i32)
    (local $p i32)
    (local.set $p (global.get $heap))
    (global.set $heap (i32.add (global.get $heap) (local.get $n)))
    (local.get $p))
  (global $heap (mut i32) (i32.const 1024))
  (func (export "invoke") (param i32 i32) (result i32)
    (drop (memory.grow (i32.const 16)))
    (i32.const 0)))"#,
    )
}

/// Garbage bytes that must fail parsing.
pub(crate) fn not_wasm() -> Vec<u8> {
    b"\x00asm not really, but padded to look plausible \x01\x02\x03\x04".to_vec()
}

/// Module that loads cleanly (valid `meta` from HELLO_HEAD) but answers with
/// an error envelope for every non-meta method (e.g. `search`).
pub(crate) fn returns_error_envelope() -> Vec<u8> {
    wat(&concat(&[
        HELLO_HEAD,
        COMMON_FUNCS,
        r#"
  (data (i32.const 1700) "{\"ok\":false,\"error\":{\"kind\":\"search_broken\",\"message\":\"the search backend is on fire\"}}\00")
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (if (call $contains (local.get $req_ptr) (local.get $req_len) (i32.const 64) (call $strlen (i32.const 64)))
      (then (return (call $emit (i32.const 256) (call $strlen (i32.const 256))))))
    (return (call $emit (i32.const 1700) (call $strlen (i32.const 1700)))))"#,
        ")",
    ]))
}

/// Module that exercises `host_kv_set` + `host_kv_get` and passthroughs the
/// get result (host results share the length-prefix + envelope convention).
pub(crate) fn kv_roundtrip() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (import "shiori" "host_kv_set" (func $host_kv_set (param i32 i32 i32 i32) (result i32)))
  (import "shiori" "host_kv_get" (func $host_kv_get (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "hello-key\00")
  (data (i32.const 16) "hello-val\00")
  (data (i32.const 64) "{\"ok\":false,\"error\":{\"kind\":\"kv\",\"message\":\"kv_set failed\"}}\00")"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (local $rc i32)
    (local.set $rc (call $host_kv_set (i32.const 0) (call $strlen (i32.const 0)) (i32.const 16) (call $strlen (i32.const 16))))
    (if (i32.ne (local.get $rc) (i32.const 0))
      (then (return (call $emit (i32.const 64) (call $strlen (i32.const 64))))))
    (return (call $host_kv_get (i32.const 0) (call $strlen (i32.const 0))))))"#,
    ]))
}

/// Module that passthroughs `host_http_fetch`'s result for a fixed request.
pub(crate) fn http_fetch() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (import "shiori" "host_http_fetch" (func $host_http_fetch (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "{\"url\":\"https://api.example.com/items\",\"method\":\"GET\"}\00")"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (return (call $host_http_fetch (i32.const 0) (call $strlen (i32.const 0))))))"#,
    ]))
}

/// Module that forwards the `params` object of the ABI request envelope
/// (`{"method": ..., "params": {...}}`) verbatim to `host_http_fetch`, so
/// tests can drive the fetched URL (wiremock address) at runtime. The params
/// object is the request's last field: it spans from just after `"params":`
/// (9 bytes) to the payload's final `}` (1 byte), hence the offsets below.
pub(crate) fn http_fetch_dynamic() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (import "shiori" "host_http_fetch" (func $host_http_fetch (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 32) "\"params\":\00")"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (local $idx i32) (local $start i32) (local $plen i32)
    (local.set $idx (call $find (local.get $req_ptr) (local.get $req_len) (i32.const 32) (call $strlen (i32.const 32))))
    (if (i32.lt_s (local.get $idx) (i32.const 0))
      (then (return (i32.const 0))))
    (local.set $start (i32.add (i32.add (local.get $req_ptr) (local.get $idx)) (i32.const 9)))
    (local.set $plen (i32.sub (i32.sub (local.get $req_len) (local.get $idx)) (i32.const 10)))
    (return (call $host_http_fetch (local.get $start) (local.get $plen)))))"#,
    ]))
}

/// Module that passthroughs `html_select`'s result for a fixed request
/// (fragment with two `<li>`s selected by `"li"` with `attr: "text"`).
pub(crate) fn html_select() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (import "shiori" "html_select" (func $html_select (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "{\"html\":\"<ul><li class=\\\"a\\\">One</li><li class=\\\"b\\\">Two <b>Bold</b></li></ul>\",\"selector\":\"li\",\"attr\":\"text\"}\00")"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (return (call $html_select (i32.const 0) (call $strlen (i32.const 0))))))"#,
    ]))
}

/// Module that passthroughs `json_get`'s result for a fixed request
/// (`pointer: "/a/b/2/c"` into `{"a":{"b":[1,2,{"c":"deep"}]}}`).
pub(crate) fn json_get() -> Vec<u8> {
    wat(&concat(&[
        r#"(module
  (import "shiori" "json_get" (func $json_get (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "{\"json\":\"{\\\"a\\\":{\\\"b\\\":[1,2,{\\\"c\\\":\\\"deep\\\"}]}}\",\"pointer\":\"/a/b/2/c\"}\00")"#,
        COMMON_FUNCS,
        r#"
  (func (export "invoke") (param $req_ptr i32) (param $req_len i32) (result i32)
    (return (call $json_get (i32.const 0) (call $strlen (i32.const 0))))))"#,
    ]))
}