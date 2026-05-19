use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    Cancelled,
    LockedOut,
    Invalidated,
    NotAvailable,
    OsError,
}

#[derive(Debug, Error)]
pub enum BiometricError {
    #[error("user cancelled biometric prompt")]
    Cancelled,

    #[error("biometry locked out; use master password")]
    LockedOut,

    #[error("biometric enrollment invalidated; re-enroll required")]
    Invalidated,

    #[error("biometric unlock not available on this device")]
    NotAvailable,

    #[error("os error: {0}")]
    OsError(String),
}

impl BiometricError {
    pub fn kind(&self) -> ErrorKind {
        match self {
            BiometricError::Cancelled => ErrorKind::Cancelled,
            BiometricError::LockedOut => ErrorKind::LockedOut,
            BiometricError::Invalidated => ErrorKind::Invalidated,
            BiometricError::NotAvailable => ErrorKind::NotAvailable,
            BiometricError::OsError(_) => ErrorKind::OsError,
        }
    }
}
