# @pearpass/desktop-native

Hardware-backed biometric unlock for the PearPass desktop app.

## Layout

- `core/` - cross-platform Rust crate. Per-OS implementations in
  `core/src/{macos,windows,linux}.rs`. Public API in `core/src/lib.rs`.
- `napi/` - napi-rs bridge that exposes the core API to Node. Built into
  per-platform `.node` files.

## Build

Prerequisite: a recent Rust toolchain (`rustup` from https://rustup.rs).

```sh
# from the repo root
npm install
npm run native:build         # release build for the host platform
npm run native:build:debug   # debug build for the host platform
```

The build emits `pearpass-biometric.<platform>-<arch>.node` next to
`napi/index.js`. `index.js` is a generated loader that selects the
correct file at runtime.

## What's protected by the biometric gate

Per platform:

| OS      | Key storage          | Wrap                                            | Threat model                          |
| ------- | -------------------- | ----------------------------------------------- | ------------------------------------- |
| macOS   | Secure Enclave (SEP) | P-256 ECIES, key has `kSecAccessControlBiometryCurrentSet` | Hardware-rooted                       |
| Windows | TPM via Hello (NGC)  | sign(challenge) -> HKDF-SHA256 -> XChaCha20Poly1305 | Hardware-rooted on TPM 2.0 devices    |
| Linux   | libsecret + polkit   | ChaCha20Poly1305 with a key in libsecret        | **Software-only** - convenience layer |

See `BIOMETRIC_UNLOCK_IMPLEMENTATION_PLAN.txt` at the repo root for the
full design.

## Public API (NAPI)

```ts
available(): Promise<Availability>
hasEnrollment(userId: string): Promise<boolean>
enroll(userId: string, credentials: Buffer): Promise<Buffer>     // -> wrapped blob
unenroll(userId: string): Promise<void>
unlock(userId: string, wrapped: Buffer): Promise<Buffer>          // -> credentials
```

Errors are thrown with message `"<Kind>:<details>"`, where `<Kind>` is
one of `Cancelled | LockedOut | Invalidated | NotAvailable | OsError`.
