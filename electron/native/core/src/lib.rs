// PearPass biometric unlock - platform-agnostic API.
//
// The native module wraps an arbitrary credentials buffer with a hardware-
// gated key. The wrapped blob is returned to the caller, which stores it.
// On unlock, the caller passes the wrapped blob back; the native module
// triggers the OS biometric prompt and, on success, returns the original
// credentials buffer.
//
// The wrap key is managed entirely by the native module via the OS
// keychain. The caller never sees the wrap key.

pub mod errors;

pub use errors::{BiometricError, ErrorKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Availability {
    Available,
    NoHardware,
    NotEnrolledOs,
    Unsupported,
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as platform;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as platform;

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod unsupported;
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
use unsupported as platform;

pub fn available() -> Result<Availability, BiometricError> {
    platform::available()
}

pub fn has_enrollment(user_id: &str) -> Result<bool, BiometricError> {
    platform::has_enrollment(user_id)
}

pub fn enroll(user_id: &str, credentials: &[u8]) -> Result<Vec<u8>, BiometricError> {
    platform::enroll(user_id, credentials)
}

pub fn unenroll(user_id: &str) -> Result<(), BiometricError> {
    platform::unenroll(user_id)
}

pub fn unlock(user_id: &str, wrapped: &[u8]) -> Result<Vec<u8>, BiometricError> {
    platform::unlock(user_id, wrapped)
}
