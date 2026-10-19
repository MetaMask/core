# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed only before writing. See [Architecture](ARCHITECTURE.md).

## Auth API Integration

`RecoveryAuthProvider` posts `{ request_hash, audiences }` to
`/api/v2/recovery/approvals` with a Hydra bearer and returns `approval` directly.

Pass Auth's `identifiers` unchanged to `register` and `updateIdentifiers`.
Set `CubistEscrowProviderOptions.authAudience` to the escrow's
`AUTH_CONTROLLER_AUDIENCE`.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
