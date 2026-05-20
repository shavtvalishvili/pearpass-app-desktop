/* eslint-disable */
// Loader for the per-platform .node binary. napi-rs overwrites this on
// build; without a binary we fall back to a stub so the main process can
// run with biometrics reported as Unsupported.

const path = require('path')
const fs = require('fs')

const { platform, arch } = process
const candidates = []

function candidate(suffix) {
  candidates.push(path.join(__dirname, `pearpass-biometric.${suffix}.node`))
}

if (platform === 'darwin') {
  if (arch === 'arm64') candidate('darwin-arm64')
  else if (arch === 'x64') candidate('darwin-x64')
  candidate('darwin-universal')
} else if (platform === 'win32') {
  if (arch === 'x64') candidate('win32-x64-msvc')
  else if (arch === 'arm64') candidate('win32-arm64-msvc')
} else if (platform === 'linux') {
  if (arch === 'x64') candidate('linux-x64-gnu')
  else if (arch === 'arm64') candidate('linux-arm64-gnu')
}

let nativeBinding = null
let loadError = null
for (const file of candidates) {
  if (fs.existsSync(file)) {
    try {
      nativeBinding = require(file)
      break
    } catch (err) {
      loadError = err
    }
  }
}

if (!nativeBinding) {
  function notBuilt() {
    const detail = loadError
      ? ` (last load error: ${loadError.message})`
      : ''
    throw new Error(
      `@pearpass/desktop-native: native module not built for ${platform}-${arch}` +
        detail +
        '. Run `npm run native:build` to build it.'
    )
  }
  nativeBinding = {
    Availability: { Available: 'Available', NoHardware: 'NoHardware', NotEnrolledOs: 'NotEnrolledOs', Unsupported: 'Unsupported' },
    ErrorKind: { Cancelled: 'Cancelled', LockedOut: 'LockedOut', Invalidated: 'Invalidated', NotAvailable: 'NotAvailable', OsError: 'OsError' },
    available: async () => 'Unsupported',
    hasEnrollment: async () => false,
    enroll: notBuilt,
    unenroll: notBuilt,
    unlock: notBuilt,
    __notBuilt: true
  }
}

module.exports = nativeBinding
