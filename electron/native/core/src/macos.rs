// macOS biometric unlock backed by the Secure Enclave.
//
// Enroll creates a P-256 key inside the SEP bound to the current biometric
// set (biometryCurrentSet), encrypts the credentials buffer via ECIES, and
// returns the ciphertext. Unlock decrypts via the SEP, which triggers
// Touch ID and releases the key only on success. Keys are tagged
// "com.pearpass.biometric.<user_id>"; biometric re-enrollment invalidates
// the SEP key automatically.

#![allow(non_upper_case_globals)]
#![allow(non_snake_case)]

use std::os::raw::c_void;
use std::ptr;

use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::data::CFData;
use core_foundation::dictionary::CFDictionary;
use core_foundation::error::CFError;
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation_sys::base::{CFRelease, CFTypeRef, OSStatus};
use core_foundation_sys::dictionary::{
    kCFTypeDictionaryKeyCallBacks, kCFTypeDictionaryValueCallBacks, CFDictionaryCreate,
};
use core_foundation_sys::error::CFErrorRef;

use crate::{Availability, BiometricError};

// FFI declared locally instead of via security-framework-sys to avoid
// version-skew breakage.

type SecKeyRef = *const c_void;
type SecAccessControlRef = *const c_void;
type SecAccessControlCreateFlags = u32;

// Bit flags from <Security/SecAccessControl.h>.
const SAC_PRIVATE_KEY_USAGE: SecAccessControlCreateFlags = 1 << 30;
const SAC_BIOMETRY_CURRENT_SET: SecAccessControlCreateFlags = 1 << 3;

// OSStatus values from <Security/SecBase.h>.
const errSecSuccess: OSStatus = 0;
const errSecItemNotFound: OSStatus = -25300;
const errSecUserCanceled: OSStatus = -128;
const errSecAuthFailed: OSStatus = -25293;

// LAError codes from <LocalAuthentication/LAError.h>.
const LA_USER_CANCEL: i64 = -2;
const LA_APP_CANCEL: i64 = -9;
const LA_BIOMETRY_NOT_AVAILABLE: i64 = -6;
const LA_BIOMETRY_NOT_ENROLLED: i64 = -7;
const LA_BIOMETRY_LOCKOUT: i64 = -8;
const LA_PASSCODE_NOT_SET: i64 = -5;

#[link(name = "Security", kind = "framework")]
extern "C" {
    static kSecClass: CFStringRef;
    static kSecClassKey: CFStringRef;
    static kSecAttrKeyType: CFStringRef;
    static kSecAttrKeyTypeECSECPrimeRandom: CFStringRef;
    static kSecAttrKeySizeInBits: CFStringRef;
    static kSecAttrTokenID: CFStringRef;
    static kSecAttrTokenIDSecureEnclave: CFStringRef;
    static kSecAttrApplicationTag: CFStringRef;
    static kSecAttrIsPermanent: CFStringRef;
    static kSecAttrAccessControl: CFStringRef;
    static kSecAttrAccessibleWhenUnlockedThisDeviceOnly: CFStringRef;
    static kSecPrivateKeyAttrs: CFStringRef;
    static kSecReturnRef: CFStringRef;
    static kSecMatchLimit: CFStringRef;
    static kSecMatchLimitOne: CFStringRef;
    static kSecKeyAlgorithmECIESEncryptionCofactorVariableIVX963SHA256AESGCM: CFStringRef;

    fn SecAccessControlCreateWithFlags(
        allocator: CFTypeRef,
        protection: CFTypeRef,
        flags: SecAccessControlCreateFlags,
        error: *mut CFErrorRef,
    ) -> SecAccessControlRef;

    fn SecKeyCreateRandomKey(parameters: CFTypeRef, error: *mut CFErrorRef) -> SecKeyRef;
    fn SecKeyCopyPublicKey(key: SecKeyRef) -> SecKeyRef;
    fn SecKeyCreateEncryptedData(
        key: SecKeyRef,
        algorithm: CFStringRef,
        plaintext: CFTypeRef,
        error: *mut CFErrorRef,
    ) -> CFTypeRef;
    fn SecKeyCreateDecryptedData(
        key: SecKeyRef,
        algorithm: CFStringRef,
        ciphertext: CFTypeRef,
        error: *mut CFErrorRef,
    ) -> CFTypeRef;

    fn SecItemCopyMatching(query: CFTypeRef, result: *mut CFTypeRef) -> OSStatus;
    fn SecItemDelete(query: CFTypeRef) -> OSStatus;
}

const KEY_LABEL_PREFIX: &str = "com.pearpass.biometric";

fn key_tag(user_id: &str) -> Vec<u8> {
    format!("{KEY_LABEL_PREFIX}.{user_id}").into_bytes()
}

/// CFRelease the wrapped pointer on Drop.
struct CFGuard(CFTypeRef);
impl Drop for CFGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

fn cf_dict(pairs: &[(CFStringRef, CFTypeRef)]) -> CFDictionary {
    let keys: Vec<*const c_void> = pairs.iter().map(|(k, _)| *k as *const c_void).collect();
    let values: Vec<*const c_void> = pairs.iter().map(|(_, v)| *v as *const c_void).collect();
    unsafe {
        let raw = CFDictionaryCreate(
            ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            pairs.len() as isize,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        );
        CFDictionary::wrap_under_create_rule(raw)
    }
}

unsafe fn cf_error_to_biometric(err: CFErrorRef) -> BiometricError {
    if err.is_null() {
        return BiometricError::OsError("unknown CFError (null)".into());
    }
    let cferr = CFError::wrap_under_create_rule(err);
    let code = cferr.code();
    let domain = cferr.domain().to_string();
    let desc = cferr.description().to_string();

    // LocalAuthentication errors propagate through Security framework calls.
    if domain.contains("LAError") || domain.contains("LocalAuthentication") {
        return match code {
            LA_USER_CANCEL | LA_APP_CANCEL => BiometricError::Cancelled,
            LA_BIOMETRY_NOT_ENROLLED | LA_BIOMETRY_NOT_AVAILABLE | LA_PASSCODE_NOT_SET => {
                BiometricError::NotAvailable
            }
            LA_BIOMETRY_LOCKOUT => BiometricError::LockedOut,
            _ => BiometricError::OsError(format!("{domain}({code}): {desc}")),
        };
    }

    match code as OSStatus {
        errSecUserCanceled => BiometricError::Cancelled,
        errSecAuthFailed => BiometricError::Cancelled,
        errSecItemNotFound => BiometricError::Invalidated,
        _ => BiometricError::OsError(format!("{domain}({code}): {desc}")),
    }
}

unsafe fn build_access_control() -> Result<SecAccessControlRef, BiometricError> {
    let flags = SAC_PRIVATE_KEY_USAGE | SAC_BIOMETRY_CURRENT_SET;
    let mut err: CFErrorRef = ptr::null_mut();
    let ac = SecAccessControlCreateWithFlags(
        ptr::null(),
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly as CFTypeRef,
        flags,
        &mut err,
    );
    if ac.is_null() {
        return Err(cf_error_to_biometric(err));
    }
    Ok(ac)
}

unsafe fn copy_existing_key(user_id: &str) -> Result<Option<SecKeyRef>, BiometricError> {
    let tag = key_tag(user_id);
    let tag_data = CFData::from_buffer(&tag);
    let attrs = cf_dict(&[
        (kSecClass, kSecClassKey as CFTypeRef),
        (kSecAttrApplicationTag, tag_data.as_concrete_TypeRef() as CFTypeRef),
        (
            kSecReturnRef,
            CFBoolean::true_value().as_concrete_TypeRef() as CFTypeRef,
        ),
        (kSecMatchLimit, kSecMatchLimitOne as CFTypeRef),
    ]);

    let mut out: CFTypeRef = ptr::null();
    let status = SecItemCopyMatching(attrs.as_concrete_TypeRef() as CFTypeRef, &mut out);
    if status == errSecItemNotFound {
        return Ok(None);
    }
    if status != errSecSuccess {
        return Err(BiometricError::OsError(format!(
            "SecItemCopyMatching status={status}"
        )));
    }
    Ok(Some(out as SecKeyRef))
}

unsafe fn delete_existing_key(user_id: &str) -> Result<(), BiometricError> {
    let tag = key_tag(user_id);
    let tag_data = CFData::from_buffer(&tag);
    let attrs = cf_dict(&[
        (kSecClass, kSecClassKey as CFTypeRef),
        (kSecAttrApplicationTag, tag_data.as_concrete_TypeRef() as CFTypeRef),
    ]);
    let status = SecItemDelete(attrs.as_concrete_TypeRef() as CFTypeRef);
    if status == errSecSuccess || status == errSecItemNotFound {
        Ok(())
    } else {
        Err(BiometricError::OsError(format!(
            "SecItemDelete status={status}"
        )))
    }
}

unsafe fn create_sep_key(user_id: &str) -> Result<SecKeyRef, BiometricError> {
    let acl = build_access_control()?;
    let _acl_guard = CFGuard(acl as CFTypeRef);

    let tag = key_tag(user_id);
    let tag_data = CFData::from_buffer(&tag);

    let private_attrs = cf_dict(&[
        (
            kSecAttrIsPermanent,
            CFBoolean::true_value().as_concrete_TypeRef() as CFTypeRef,
        ),
        (kSecAttrApplicationTag, tag_data.as_concrete_TypeRef() as CFTypeRef),
        (kSecAttrAccessControl, acl as CFTypeRef),
    ]);

    let size = CFNumber::from(256i32);

    let attrs = cf_dict(&[
        (
            kSecAttrKeyType,
            kSecAttrKeyTypeECSECPrimeRandom as CFTypeRef,
        ),
        (kSecAttrKeySizeInBits, size.as_concrete_TypeRef() as CFTypeRef),
        (kSecAttrTokenID, kSecAttrTokenIDSecureEnclave as CFTypeRef),
        (kSecPrivateKeyAttrs, private_attrs.as_concrete_TypeRef() as CFTypeRef),
    ]);

    let mut err: CFErrorRef = ptr::null_mut();
    let key = SecKeyCreateRandomKey(attrs.as_concrete_TypeRef() as CFTypeRef, &mut err);
    if key.is_null() {
        return Err(cf_error_to_biometric(err));
    }
    Ok(key)
}

pub fn available() -> Result<Availability, BiometricError> {
    // Apple Silicon and T2 Macs have SEP; older Intel without T2 fails at
    // enroll time and surfaces the failure via the enroll error mapping.
    Ok(Availability::Available)
}

pub fn has_enrollment(user_id: &str) -> Result<bool, BiometricError> {
    unsafe {
        match copy_existing_key(user_id)? {
            Some(k) => {
                CFRelease(k as CFTypeRef);
                Ok(true)
            }
            None => Ok(false),
        }
    }
}

pub fn enroll(user_id: &str, credentials: &[u8]) -> Result<Vec<u8>, BiometricError> {
    unsafe {
        // Idempotent: wipe any stale key first so re-enroll works cleanly.
        delete_existing_key(user_id)?;

        let key = create_sep_key(user_id)?;
        let _key_guard = CFGuard(key as CFTypeRef);

        let pub_key = SecKeyCopyPublicKey(key);
        if pub_key.is_null() {
            return Err(BiometricError::OsError(
                "SecKeyCopyPublicKey returned null".into(),
            ));
        }
        let _pub_guard = CFGuard(pub_key as CFTypeRef);

        let plaintext = CFData::from_buffer(credentials);
        let mut err: CFErrorRef = ptr::null_mut();
        let ciphertext_ref = SecKeyCreateEncryptedData(
            pub_key,
            kSecKeyAlgorithmECIESEncryptionCofactorVariableIVX963SHA256AESGCM,
            plaintext.as_concrete_TypeRef() as CFTypeRef,
            &mut err,
        );
        if ciphertext_ref.is_null() {
            // Roll back: don't leave a half-enrolled SEP key behind.
            let mapped = cf_error_to_biometric(err);
            let _ = delete_existing_key(user_id);
            return Err(mapped);
        }
        let ciphertext = CFData::wrap_under_create_rule(ciphertext_ref as _);
        Ok(ciphertext.bytes().to_vec())
    }
}

pub fn unenroll(user_id: &str) -> Result<(), BiometricError> {
    unsafe { delete_existing_key(user_id) }
}

pub fn unlock(user_id: &str, wrapped: &[u8]) -> Result<Vec<u8>, BiometricError> {
    unsafe {
        let key = match copy_existing_key(user_id)? {
            Some(k) => k,
            None => return Err(BiometricError::Invalidated),
        };
        let _key_guard = CFGuard(key as CFTypeRef);

        let ciphertext = CFData::from_buffer(wrapped);
        let mut err: CFErrorRef = ptr::null_mut();
        // Triggers Touch ID; SEP releases the decryption only on success.
        let plaintext_ref = SecKeyCreateDecryptedData(
            key,
            kSecKeyAlgorithmECIESEncryptionCofactorVariableIVX963SHA256AESGCM,
            ciphertext.as_concrete_TypeRef() as CFTypeRef,
            &mut err,
        );
        if plaintext_ref.is_null() {
            return Err(cf_error_to_biometric(err));
        }
        let plaintext = CFData::wrap_under_create_rule(plaintext_ref as _);
        Ok(plaintext.bytes().to_vec())
    }
}
