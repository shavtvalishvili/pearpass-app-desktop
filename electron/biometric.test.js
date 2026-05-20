/* eslint-env jest */

import fs from 'fs'
import os from 'os'
import path from 'path'

const mockNative = {
  Availability: {
    Available: 'Available',
    NoHardware: 'NoHardware',
    NotEnrolledOs: 'NotEnrolledOs',
    Unsupported: 'Unsupported'
  },
  ErrorKind: {
    Cancelled: 'Cancelled',
    LockedOut: 'LockedOut',
    Invalidated: 'Invalidated',
    NotAvailable: 'NotAvailable',
    OsError: 'OsError'
  },
  available: jest.fn(),
  hasEnrollment: jest.fn(),
  enroll: jest.fn(),
  unenroll: jest.fn(),
  unlock: jest.fn(),
  __notBuilt: false
}

// virtual: true so the test runs when the native module has not been built.
jest.mock('@pearpass/desktop-native', () => mockNative, { virtual: true })

const biometric = require('./biometric.cjs')

describe('biometric helper', () => {
  let tmpDir
  let vaultClient

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biometric-test-'))
    vaultClient = {
      initWithPassword: jest.fn().mockResolvedValue({ success: true }),
      initWithCredentials: jest.fn().mockResolvedValue({ success: true }),
      encryptionGet: jest
        .fn()
        .mockResolvedValue({ ciphertext: 'CT', nonce: 'NC', salt: 'SA' }),
      getDecryptionKey: jest.fn().mockResolvedValue('HASH')
    }
    mockNative.available.mockReset()
    mockNative.hasEnrollment.mockReset()
    mockNative.enroll.mockReset()
    mockNative.unenroll.mockReset()
    mockNative.unlock.mockReset()
    mockNative.__notBuilt = false
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('classifyError', () => {
    it('parses "Kind:message" into a typed kind', () => {
      expect(
        biometric._classifyError(new Error('Cancelled:user cancelled'))
      ).toEqual({ kind: 'Cancelled', message: 'user cancelled' })
    })

    it('falls back to OsError for unknown prefixes', () => {
      expect(biometric._classifyError(new Error('weird error'))).toEqual({
        kind: 'OsError',
        message: 'weird error'
      })
    })

    it('handles null/undefined errors', () => {
      expect(biometric._classifyError(null).kind).toBe('OsError')
      expect(biometric._classifyError(undefined).kind).toBe('OsError')
    })
  })

  describe('available', () => {
    it('returns Unsupported when the native module is not built', async () => {
      mockNative.__notBuilt = true
      const result = await biometric.available()
      expect(result).toEqual({ availability: 'Unsupported', notBuilt: true })
      expect(mockNative.available).not.toHaveBeenCalled()
    })

    it('returns the native answer when the module is built', async () => {
      mockNative.available.mockResolvedValue('Available')
      const result = await biometric.available()
      expect(result).toEqual({ availability: 'Available' })
    })

    it('treats a native throw as Unsupported', async () => {
      mockNative.available.mockRejectedValue(new Error('OsError:boom'))
      const result = await biometric.available()
      expect(result.availability).toBe('Unsupported')
      expect(result.error.kind).toBe('OsError')
    })
  })

  describe('hasEnrollment', () => {
    it('returns false when the blob is missing', async () => {
      mockNative.hasEnrollment.mockResolvedValue(true)
      expect(await biometric.hasEnrollment(tmpDir)).toBe(false)
    })

    it('returns false when native says no', async () => {
      writeBlob(tmpDir, 'BLOB')
      mockNative.hasEnrollment.mockResolvedValue(false)
      expect(await biometric.hasEnrollment(tmpDir)).toBe(false)
    })

    it('returns true only when both native and blob agree', async () => {
      writeBlob(tmpDir, 'BLOB')
      mockNative.hasEnrollment.mockResolvedValue(true)
      expect(await biometric.hasEnrollment(tmpDir)).toBe(true)
    })

    it('returns false when the module is not built', async () => {
      mockNative.__notBuilt = true
      writeBlob(tmpDir, 'BLOB')
      expect(await biometric.hasEnrollment(tmpDir)).toBe(false)
    })
  })

  describe('enroll', () => {
    it('writes the wrapped blob to disk on success', async () => {
      mockNative.enroll.mockResolvedValue(Buffer.from('WRAPPED'))

      const result = await biometric.enroll({
        vaultClient,
        storageDir: tmpDir,
        passwordBase64: 'PW'
      })

      expect(result).toEqual({ ok: true })
      expect(vaultClient.initWithPassword).toHaveBeenCalledWith({
        passwordBase64: 'PW'
      })
      const written = fs.readFileSync(biometric._blobPath(tmpDir))
      expect(written.toString('utf8')).toBe('WRAPPED')

      // The credentials buffer that was passed to native.enroll bundles the
      // three fields in JSON form.
      const passedCreds = mockNative.enroll.mock.calls[0][1]
      const parsed = JSON.parse(passedCreds.toString('utf8'))
      expect(parsed).toEqual({
        ciphertext: 'CT',
        nonce: 'NC',
        hashedPassword: 'HASH'
      })
    })

    it('fails fast when password verification throws', async () => {
      vaultClient.initWithPassword.mockRejectedValue(new Error('bad password'))
      const result = await biometric.enroll({
        vaultClient,
        storageDir: tmpDir,
        passwordBase64: 'wrong'
      })
      expect(result.ok).toBe(false)
      expect(mockNative.enroll).not.toHaveBeenCalled()
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(false)
    })

    it('rolls back the native key when wrap fails', async () => {
      mockNative.enroll.mockRejectedValue(new Error('Cancelled:user'))
      mockNative.unenroll.mockResolvedValue(undefined)

      const result = await biometric.enroll({
        vaultClient,
        storageDir: tmpDir,
        passwordBase64: 'PW'
      })

      expect(result.ok).toBe(false)
      expect(result.kind).toBe('Cancelled')
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(false)
    })

    it('refuses when the master encryption record is missing', async () => {
      vaultClient.encryptionGet.mockResolvedValue(null)
      const result = await biometric.enroll({
        vaultClient,
        storageDir: tmpDir,
        passwordBase64: 'PW'
      })
      expect(result.ok).toBe(false)
      expect(result.kind).toBe('OsError')
      expect(mockNative.enroll).not.toHaveBeenCalled()
    })

    it('returns NotAvailable when the module is not built', async () => {
      mockNative.__notBuilt = true
      const result = await biometric.enroll({
        vaultClient,
        storageDir: tmpDir,
        passwordBase64: 'PW'
      })
      expect(result).toEqual(
        expect.objectContaining({ ok: false, kind: 'NotAvailable' })
      )
    })
  })

  describe('unlock', () => {
    it('feeds the credentials to initWithCredentials on success', async () => {
      writeBlob(tmpDir, 'WRAPPED')
      const cred = JSON.stringify({
        ciphertext: 'CT',
        nonce: 'NC',
        hashedPassword: 'HP'
      })
      mockNative.unlock.mockResolvedValue(Buffer.from(cred))

      const result = await biometric.unlock({ vaultClient, storageDir: tmpDir })

      expect(result).toEqual({ ok: true })
      expect(vaultClient.initWithCredentials).toHaveBeenCalledWith({
        ciphertext: 'CT',
        nonce: 'NC',
        hashedPassword: 'HP'
      })
    })

    it('returns Invalidated when the blob is missing', async () => {
      const result = await biometric.unlock({ vaultClient, storageDir: tmpDir })
      expect(result).toEqual(
        expect.objectContaining({ ok: false, kind: 'Invalidated' })
      )
      expect(mockNative.unlock).not.toHaveBeenCalled()
    })

    it('deletes the orphan blob when native returns Invalidated', async () => {
      writeBlob(tmpDir, 'STALE')
      mockNative.unlock.mockRejectedValue(new Error('Invalidated:key gone'))

      const result = await biometric.unlock({ vaultClient, storageDir: tmpDir })

      expect(result.kind).toBe('Invalidated')
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(false)
    })

    it('keeps the blob on Cancelled', async () => {
      writeBlob(tmpDir, 'KEEP')
      mockNative.unlock.mockRejectedValue(new Error('Cancelled:user'))

      const result = await biometric.unlock({ vaultClient, storageDir: tmpDir })

      expect(result.kind).toBe('Cancelled')
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(true)
    })
  })

  describe('unenroll', () => {
    it('removes the native key and deletes the blob', async () => {
      writeBlob(tmpDir, 'BLOB')
      mockNative.unenroll.mockResolvedValue(undefined)

      const result = await biometric.unenroll({ storageDir: tmpDir })

      expect(result).toEqual({ ok: true })
      expect(mockNative.unenroll).toHaveBeenCalledWith('default')
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(false)
    })

    it('still wipes the blob when the module is not built', async () => {
      mockNative.__notBuilt = true
      writeBlob(tmpDir, 'BLOB')
      const result = await biometric.unenroll({ storageDir: tmpDir })
      expect(result).toEqual({ ok: true })
      expect(fs.existsSync(biometric._blobPath(tmpDir))).toBe(false)
    })
  })
})

function writeBlob(storageDir, contents) {
  const p = path.join(storageDir, 'biometric', 'default.bin')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, contents, { mode: 0o600 })
}
