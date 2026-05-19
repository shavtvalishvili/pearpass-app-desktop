// Windows implementation - stub for now. Filled in during the Windows step.
// Until then we report Unsupported and refuse enrollment / unlock.

use crate::{Availability, BiometricError};

pub fn available() -> Result<Availability, BiometricError> {
    Ok(Availability::Unsupported)
}

pub fn has_enrollment(_user_id: &str) -> Result<bool, BiometricError> {
    Ok(false)
}

pub fn enroll(_user_id: &str, _credentials: &[u8]) -> Result<Vec<u8>, BiometricError> {
    Err(BiometricError::NotAvailable)
}

pub fn unenroll(_user_id: &str) -> Result<(), BiometricError> {
    Ok(())
}

pub fn unlock(_user_id: &str, _wrapped: &[u8]) -> Result<Vec<u8>, BiometricError> {
    Err(BiometricError::NotAvailable)
}
