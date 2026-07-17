// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shiori::run();
}

#[cfg(target_os = "linux")]
extern "C" {
    fn strtoll(nptr: *const std::ffi::c_char, endptr: *mut *mut std::ffi::c_char, base: std::ffi::c_int) -> std::ffi::c_longlong;
    fn strtoull(nptr: *const std::ffi::c_char, endptr: *mut *mut std::ffi::c_char, base: std::ffi::c_int) -> std::ffi::c_ulonglong;
    fn strtol(nptr: *const std::ffi::c_char, endptr: *mut *mut std::ffi::c_char, base: std::ffi::c_int) -> std::ffi::c_long;
}

#[cfg(target_os = "linux")]
#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtoll(
    nptr: *const std::ffi::c_char,
    endptr: *mut *mut std::ffi::c_char,
    base: std::ffi::c_int,
) -> std::ffi::c_longlong {
    strtoll(nptr, endptr, base)
}

#[cfg(target_os = "linux")]
#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtoull(
    nptr: *const std::ffi::c_char,
    endptr: *mut *mut std::ffi::c_char,
    base: std::ffi::c_int,
) -> std::ffi::c_ulonglong {
    strtoull(nptr, endptr, base)
}

#[cfg(target_os = "linux")]
#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtol(
    nptr: *const std::ffi::c_char,
    endptr: *mut *mut std::ffi::c_char,
    base: std::ffi::c_int,
) -> std::ffi::c_long {
    strtol(nptr, endptr, base)
}
