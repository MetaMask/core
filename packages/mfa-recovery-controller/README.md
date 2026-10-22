# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed only before writing. See [Architecture](ARCHITECTURE.md).

## Auth API Integration

Configure `AuthApiRecoveryAuthProvider` with the Auth API base URL, profile id,
and a callback that supplies a Hydra bearer with recent MFA when requested.
It posts `{ request_hash, audiences }` to `/api/v2/mfa/approvals` and returns
`{ approval, identifiers }`. Writes and reads require a request-bound AAL2
approval; updates and reads also require an identifier proof.

Use Auth's latest `identifiers` for `register` and `updateIdentifiers`. A mismatch
with the approval response triggers one rebuild and retry before writing;
`writing` mutations are never rebuilt. Set `CubistEscrowProviderOptions.authAudience`
to the escrow's `AUTH_CONTROLLER_AUDIENCE`.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
