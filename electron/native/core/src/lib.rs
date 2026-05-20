// PearPass biometric unlock - platform-agnostic API.
//
// Wraps a credentials buffer with a hardware-gated key (managed by the
// platform impl via the OS keychain). Callers store the wrapped blob and
// pass it back on unlock; the OS biometric prompt fires inside unlock().

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
