// NAPI surface for the biometric core. Entry points dispatch onto the libuv
// thread pool via AsyncTask so the OS biometric prompt cannot block the
// Node event loop.

#![deny(clippy::all)]

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, Result as NapiResult, Status, Task};
use napi_derive::napi;

use pearpass_biometric_core as core;

#[napi]
pub enum Availability {
    Available,
    NoHardware,
    NotEnrolledOs,
    Unsupported,
}

#[napi]
pub enum ErrorKind {
    Cancelled,
    LockedOut,
    Invalidated,
    NotAvailable,
    OsError,
}

impl From<core::Availability> for Availability {
    fn from(a: core::Availability) -> Self {
        match a {
            core::Availability::Available => Availability::Available,
            core::Availability::NoHardware => Availability::NoHardware,
            core::Availability::NotEnrolledOs => Availability::NotEnrolledOs,
            core::Availability::Unsupported => Availability::Unsupported,
        }
    }
}

fn map_err(err: core::BiometricError) -> Error {
    // `KIND:message` format lets the JS layer pattern-match without
    // parsing free-form messages.
    let kind = match err.kind() {
        core::ErrorKind::Cancelled => "Cancelled",
        core::ErrorKind::LockedOut => "LockedOut",
        core::ErrorKind::Invalidated => "Invalidated",
        core::ErrorKind::NotAvailable => "NotAvailable",
        core::ErrorKind::OsError => "OsError",
    };
    Error::new(Status::GenericFailure, format!("{kind}:{err}"))
}

pub struct AvailableTask;
impl Task for AvailableTask {
    type Output = core::Availability;
    type JsValue = Availability;
    fn compute(&mut self) -> NapiResult<Self::Output> {
        core::available().map_err(map_err)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> NapiResult<Self::JsValue> {
        Ok(output.into())
    }
}

pub struct HasEnrollmentTask {
    user_id: String,
}
impl Task for HasEnrollmentTask {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> NapiResult<Self::Output> {
        core::has_enrollment(&self.user_id).map_err(map_err)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> NapiResult<Self::JsValue> {
        Ok(output)
    }
}

pub struct EnrollTask {
    user_id: String,
    credentials: Vec<u8>,
}
impl Task for EnrollTask {
    type Output = Vec<u8>;
    type JsValue = Buffer;
    fn compute(&mut self) -> NapiResult<Self::Output> {
        core::enroll(&self.user_id, &self.credentials).map_err(map_err)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> NapiResult<Self::JsValue> {
        Ok(Buffer::from(output))
    }
    fn finally(&mut self, _env: Env) -> NapiResult<()> {
        // Zeroize plaintext credentials in our temp buffer.
        for b in self.credentials.iter_mut() {
            *b = 0;
        }
        Ok(())
    }
}

pub struct UnenrollTask {
    user_id: String,
}
impl Task for UnenrollTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> NapiResult<Self::Output> {
        core::unenroll(&self.user_id).map_err(map_err)
    }
    fn resolve(&mut self, _env: Env, _output: Self::Output) -> NapiResult<Self::JsValue> {
        Ok(())
    }
}

pub struct UnlockTask {
    user_id: String,
    wrapped: Vec<u8>,
}
impl Task for UnlockTask {
    type Output = Vec<u8>;
    type JsValue = Buffer;
    fn compute(&mut self) -> NapiResult<Self::Output> {
        core::unlock(&self.user_id, &self.wrapped).map_err(map_err)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> NapiResult<Self::JsValue> {
        Ok(Buffer::from(output))
    }
}

#[napi]
pub fn available() -> AsyncTask<AvailableTask> {
    AsyncTask::new(AvailableTask)
}

#[napi]
pub fn has_enrollment(user_id: String) -> AsyncTask<HasEnrollmentTask> {
    AsyncTask::new(HasEnrollmentTask { user_id })
}

#[napi]
pub fn enroll(user_id: String, credentials: Buffer) -> AsyncTask<EnrollTask> {
    AsyncTask::new(EnrollTask {
        user_id,
        credentials: credentials.to_vec(),
    })
}

#[napi]
pub fn unenroll(user_id: String) -> AsyncTask<UnenrollTask> {
    AsyncTask::new(UnenrollTask { user_id })
}

#[napi]
pub fn unlock(user_id: String, wrapped: Buffer) -> AsyncTask<UnlockTask> {
    AsyncTask::new(UnlockTask {
        user_id,
        wrapped: wrapped.to_vec(),
    })
}
