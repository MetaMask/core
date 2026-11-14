# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@ethereumjs/rlp` from `^5.0.2` to `^10.1.3` ([#10519](https://github.com/MetaMask/core/pull/10519))
- Bump `@ethereumjs/util` from `^9.1.0` to `^10.1.3` ([#10519](https://github.com/MetaMask/core/pull/10519))

## [10.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#11349](https://github.com/MetaMask/core/pull/11349), [#11362](https://github.com/MetaMask/core/pull/11362))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Make `encrypt`, `encryptSafely`, `decrypt`, `decryptSafely`, and `getEncryptionPublicKey` asynchronous ([#11388](https://github.com/MetaMask/core/pull/11388))
  - These functions now return a `Promise`. Callers must `await` the result.
  - The encrypted data format is unchanged, so data encrypted by previous versions can still be decrypted.
  - Decrypting with an invalid nonce length now throws an error from `@noble/ciphers` instead of `bad nonce size`.
- **BREAKING:** Bump TypeScript target to ES2022 ([#11348](https://github.com/MetaMask/core/pull/11348))
- **BREAKING:** `TypedDataUtils.encodeData`, `TypedDataUtils.hashStruct`, `TypedDataUtils.hashType`, `TypedDataUtils.eip712Hash`, `TypedDataUtils.eip712DomainHash`, and `hashEIP7702Authorization` now return a `Uint8Array` instead of a `Buffer` ([#11394](https://github.com/MetaMask/core/pull/11394))
- **BREAKING:** Objects with a `toArray` or `toBuffer` method are no longer accepted as the `data` of `personalSign`, `recoverPersonalSignature`, and `extractPublicKey`, or as `bytes` values in `V1` typed data ([#11394](https://github.com/MetaMask/core/pull/11394))
- `Uint8Array` is now accepted as part of the arguments of `personalSign`, `signTypedData`, `signEIP7702Authorization`, and `concatSig`, instead of `Buffer` ([#11394](https://github.com/MetaMask/core/pull/11394))
- Bump `@metamask/utils` from `^11.0.1` to `^12.0.2` ([#11349](https://github.com/MetaMask/core/pull/11349), [#11474](https://github.com/MetaMask/core/pull/11474))
- Bump `ethereum-cryptography` from `^2.1.2` to `^3.2.0` ([#11349](https://github.com/MetaMask/core/pull/11349))
- Bump `@ethereumjs/util` from `^8.1.0` to `^9.1.0` ([#11394](https://github.com/MetaMask/core/pull/11394))
- Bump `@ethereumjs/rlp` from `^4.0.1` to `^5.0.2` ([#11394](https://github.com/MetaMask/core/pull/11394))
- This package was migrated from `MetaMask/eth-sig-util` to the
  `MetaMask/core` monorepo ([#11327](https://github.com/MetaMask/core/pull/11327))
  - See [`MetaMask/eth-sig-util`](https://github.com/MetaMask/eth-sig-util/blob/73725fc31a51e4d5f6b72d8e5f470c0b10c9d57f/CHANGELOG.md)
    for the original changelog.

### Fixed

- Correct padding calculation so that every ciphertext is a multiple of 2048 bytes ([#11386](https://github.com/MetaMask/core/pull/11386))
- Reject non-integer and unsafe-integer `chainId` and `nonce` values in `signEIP7702Authorization`, `recoverEIP7702Authorization`, and `hashEIP7702Authorization` ([#11392](https://github.com/MetaMask/core/pull/11392))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-sig-util@10.0.0...HEAD
[10.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-sig-util@10.0.0
