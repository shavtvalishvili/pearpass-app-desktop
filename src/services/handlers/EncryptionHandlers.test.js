import { EncryptionHandlers } from './EncryptionHandlers'
import { promotePendingPairing } from '../security/appIdentity'

jest.mock('../security/appIdentity', () => ({
  promotePendingPairing: jest.fn()
}))

describe('EncryptionHandlers', () => {
  let clientMock
  let handlers

  beforeEach(() => {
    jest.clearAllMocks()
    clientMock = {
      encryptionGetStatus: jest.fn(),
      initWithPassword: jest.fn()
    }
    handlers = new EncryptionHandlers(clientMock)
  })

  it('should call client.encryptionGetStatus and return its result', async () => {
    const status = { enabled: true }
    clientMock.encryptionGetStatus.mockResolvedValue(status)

    const result = await handlers.encryptionGetStatus()

    expect(clientMock.encryptionGetStatus).toHaveBeenCalledTimes(1)
    expect(result).toBe(status)
  })

  it('should propagate errors from client.encryptionGetStatus', async () => {
    const error = new Error('Failed to get status')
    clientMock.encryptionGetStatus.mockRejectedValue(error)

    await expect(handlers.encryptionGetStatus()).rejects.toThrow(
      'Failed to get status'
    )
  })

  describe('initWithPassword', () => {
    it('promotes pending pairing after a successful init', async () => {
      clientMock.initWithPassword.mockResolvedValue('ok')

      const result = await handlers.initWithPassword({ password: 'pw' })

      expect(clientMock.initWithPassword).toHaveBeenCalledTimes(1)
      expect(promotePendingPairing).toHaveBeenCalledWith(clientMock)
      expect(result).toBe('ok')
    })

    it('does not promote pending pairing when init throws', async () => {
      clientMock.initWithPassword.mockRejectedValue(new Error('bad password'))

      await expect(
        handlers.initWithPassword({ password: 'pw' })
      ).rejects.toThrow('bad password')

      expect(promotePendingPairing).not.toHaveBeenCalled()
    })

    it('still returns the init result if promotion fails', async () => {
      clientMock.initWithPassword.mockResolvedValue('ok')
      promotePendingPairing.mockRejectedValueOnce(new Error('write failed'))

      const result = await handlers.initWithPassword({ password: 'pw' })

      expect(result).toBe('ok')
    })

    it('throws if no password is provided', async () => {
      await expect(handlers.initWithPassword({})).rejects.toThrow(
        'Password is required'
      )
      expect(clientMock.initWithPassword).not.toHaveBeenCalled()
      expect(promotePendingPairing).not.toHaveBeenCalled()
    })
  })
})
