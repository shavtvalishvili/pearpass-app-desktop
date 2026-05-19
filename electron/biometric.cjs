/* eslint-disable no-underscore-dangle */
/**
 * Main-process wrapper around @pearpass/desktop-native.
 *
 * Owns:
 *   - the wrapped-credentials blob on disk (storageDir/biometric/<userId>.bin)
 *   - the orchestration around vaultClient for enroll and unlock flows
 *   - error classification (kind: Cancelled/LockedOut/Invalidated/...)
 *
 * The renderer never sees the wrapped blob, the decrypted credentials, or
 * the master password beyond what already crosses the existing
 * vault:invoke channel.
 */

const fs = require('fs')
const path = require('path')

let native = null
let nativeLoadError = null
try {
  native = require('@pearpass/desktop-native')
} catch (err) {
  nativeLoadError = err
}

// Single per-app-user enrollment. If we ever support multi-vault biometric
// enrollment, replace this with a per-vault id.
const USER_ID = 'default'

const BIOMETRIC_DIR = 'biometric'
const BLOB_EXT = '.bin'

function blobPath(storageDir, userId = USER_ID) {
  return path.join(storageDir, BIOMETRIC_DIR, `${userId}${BLOB_EXT}`)
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
}

function readBlob(storageDir, userId = USER_ID) {
  const p = blobPath(storageDir, userId)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p)
}

function writeBlob(storageDir, buffer, userId = USER_ID) {
  const p = blobPath(storageDir, userId)
  ensureDir(p)
  fs.writeFileSync(p, buffer, { mode: 0o600 })
}

function deleteBlob(storageDir, userId = USER_ID) {
  const p = blobPath(storageDir, userId)
  try {
    fs.unlinkSync(p)
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err
  }
}

const ERROR_KINDS = new Set([
  'Cancelled',
  'LockedOut',
  'Invalidated',
  'NotAvailable',
  'OsError'
])

function classifyError(err) {
  if (!err) return { kind: 'OsError', message: 'unknown error' }
  const msg = String(err.message || err)
  const idx = msg.indexOf(':')
  if (idx > 0) {
    const head = msg.slice(0, idx)
    if (ERROR_KINDS.has(head)) {
      return { kind: head, message: msg.slice(idx + 1) }
    }
  }
  return { kind: 'OsError', message: msg }
}

function isAvailableModule() {
  return !!native && !native.__notBuilt
}

async function available() {
  if (!isAvailableModule()) {
    return { availability: 'Unsupported', notBuilt: true }
  }
  try {
    const result = await native.available()
    return { availability: result }
  } catch (err) {
    return { availability: 'Unsupported', error: classifyError(err) }
  }
}

async function hasEnrollment(storageDir) {
  if (!isAvailableModule()) return false
  try {
    const nativeHas = await native.hasEnrollment(USER_ID)
    const blob = readBlob(storageDir)
    return !!(nativeHas && blob)
  } catch {
    return false
  }
}

/**
 * @param {object} opts
 * @param {import('electron').App} opts.app
 * @param {string} opts.storageDir
 * @param {any} opts.vaultClient
 * @param {string} opts.passwordBase64
 * @returns {Promise<{ok: true} | {ok: false, kind: string, message: string}>}
 */
async function enroll({ vaultClient, storageDir, passwordBase64 }) {
  if (!isAvailableModule()) {
    return { ok: false, kind: 'NotAvailable', message: 'native module not built' }
  }
  if (!vaultClient) {
    return { ok: false, kind: 'OsError', message: 'vault client not ready' }
  }

  // 1. Verify the password by re-deriving and comparing. initWithPassword
  //    against an already-initialized vault is a pure verification path.
  try {
    await vaultClient.initWithPassword({ passwordBase64 })
  } catch (err) {
    return {
      ok: false,
      kind: 'OsError',
      message: `password verification failed: ${err.message || err}`
    }
  }

  // 2. Pull the stored {ciphertext, nonce, salt} and re-derive hashedPassword.
  let enc
  try {
    enc = await vaultClient.encryptionGet('masterPassword')
  } catch (err) {
    return {
      ok: false,
      kind: 'OsError',
      message: `encryptionGet failed: ${err.message || err}`
    }
  }
  if (!enc || !enc.ciphertext || !enc.nonce || !enc.salt) {
    return {
      ok: false,
      kind: 'OsError',
      message: 'master encryption record missing'
    }
  }

  let hashedPassword
  try {
    hashedPassword = await vaultClient.getDecryptionKey({
      salt: enc.salt,
      password: passwordBase64
    })
  } catch (err) {
    return {
      ok: false,
      kind: 'OsError',
      message: `getDecryptionKey failed: ${err.message || err}`
    }
  }

  // 3. Wrap the credentials with the SEP key.
  const credentials = Buffer.from(
    JSON.stringify({
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
      hashedPassword
    }),
    'utf8'
  )
  let wrapped
  try {
    wrapped = await native.enroll(USER_ID, credentials)
  } catch (err) {
    return { ok: false, ...classifyError(err) }
  } finally {
    credentials.fill(0)
  }

  // 4. Persist the wrapped blob next to other vault data.
  try {
    writeBlob(storageDir, wrapped)
  } catch (err) {
    // Roll back the SEP enrollment so we don't leave a dangling key.
    try {
      await native.unenroll(USER_ID)
    } catch {}
    return {
      ok: false,
      kind: 'OsError',
      message: `failed to persist wrapped blob: ${err.message || err}`
    }
  }

  return { ok: true }
}

/**
 * @param {object} opts
 * @param {string} opts.storageDir
 * @param {any} opts.vaultClient
 * @returns {Promise<{ok: true} | {ok: false, kind: string, message: string}>}
 */
async function unlock({ vaultClient, storageDir }) {
  if (!isAvailableModule()) {
    return { ok: false, kind: 'NotAvailable', message: 'native module not built' }
  }
  if (!vaultClient) {
    return { ok: false, kind: 'OsError', message: 'vault client not ready' }
  }

  const wrapped = readBlob(storageDir)
  if (!wrapped) {
    return { ok: false, kind: 'Invalidated', message: 'no enrollment blob' }
  }

  let credBuf
  try {
    credBuf = await native.unlock(USER_ID, wrapped)
  } catch (err) {
    const cls = classifyError(err)
    if (cls.kind === 'Invalidated') {
      // SEP key gone (biometric re-enrolled, user removed it, etc.) - wipe
      // the orphan blob so the next attempt cleanly reports "needs enroll".
      try { deleteBlob(storageDir) } catch {}
    }
    return { ok: false, ...cls }
  }

  let parsed
  try {
    parsed = JSON.parse(credBuf.toString('utf8'))
  } catch (err) {
    credBuf.fill(0)
    return {
      ok: false,
      kind: 'OsError',
      message: `wrapped blob malformed: ${err.message || err}`
    }
  }

  try {
    await vaultClient.initWithCredentials({
      ciphertext: parsed.ciphertext,
      nonce: parsed.nonce,
      hashedPassword: parsed.hashedPassword
    })
  } catch (err) {
    credBuf.fill(0)
    return {
      ok: false,
      kind: 'OsError',
      message: `vault unlock failed: ${err.message || err}`
    }
  } finally {
    credBuf.fill(0)
  }

  return { ok: true }
}

async function unenroll({ storageDir }) {
  if (!isAvailableModule()) {
    // Still wipe the blob if it exists.
    try { deleteBlob(storageDir) } catch {}
    return { ok: true }
  }
  try {
    await native.unenroll(USER_ID)
  } catch (err) {
    return { ok: false, ...classifyError(err) }
  }
  try { deleteBlob(storageDir) } catch {}
  return { ok: true }
}

module.exports = {
  USER_ID,
  available,
  hasEnrollment,
  enroll,
  unlock,
  unenroll,
  // exported for diagnostics / testing only
  _classifyError: classifyError,
  _blobPath: blobPath,
  _nativeLoadError: () => nativeLoadError
}
