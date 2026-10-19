# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed only before writing. See [Architecture](ARCHITECTURE.md).

## Auth API Integration

`AuthApiRecoveryAuthProvider` implements `RecoveryAuthProvider`. Supply the Auth
API base URL, profile id, and a callback that provides a Hydra bearer with recent
MFA when requested. The provider posts `{ request_hash, audiences }` to
`/api/v2/recovery/approvals` and returns `approval` directly.

Pass Auth's `identifiers` unchanged to `register` and `updateIdentifiers`.
Set `CubistEscrowProviderOptions.authAudience` to the escrow's
`AUTH_CONTROLLER_AUDIENCE`.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
