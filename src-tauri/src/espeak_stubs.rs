#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod stubs {
    use std::ffi::c_void;
    
    #[no_mangle]
    pub extern "C" fn sonicDestroyStream() {}
    
    #[no_mangle]
    pub extern "C" fn sonicFlushStream() {}
    
    #[no_mangle]
    pub extern "C" fn sonicReadShortFromStream() -> i32 { 0 }
    
    #[no_mangle]
    pub extern "C" fn audio_object_open() -> i32 { -1 }
    
    #[no_mangle]
    pub extern "C" fn audio_object_write() -> usize { 0 }
    
    #[no_mangle]
    pub extern "C" fn audio_object_strerror() -> *const std::ffi::c_char {
        b"error\0".as_ptr() as *const _
    }
    
    #[no_mangle]
    pub extern "C" fn audio_object_close() -> i32 { 0 }
    
    #[no_mangle]
    pub extern "C" fn audio_object_flush() -> i32 { 0 }
    
    #[no_mangle]
    pub extern "C" fn create_audio_device_object() -> *mut c_void {
        std::ptr::null_mut()
    }
    
    #[no_mangle]
    pub extern "C" fn sonicGetSpeed() -> f32 { 1.0 }
    
    #[no_mangle]
    pub extern "C" fn sonicWriteShortToStream() -> i32 { 0 }
    
    #[no_mangle]
    pub extern "C" fn audio_object_drain() -> i32 { 0 }
    
    #[no_mangle]
    pub extern "C" fn sonicSetSpeed() {}
    
    #[no_mangle]
    pub extern "C" fn sonicCreateStream() -> *mut c_void {
        std::ptr::null_mut()
    }
}
