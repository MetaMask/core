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

`register` and `updateIdentifiers` send the approval's `identifiers` to each
escrow as `approvedIdentifiers`; the escrow rejects payload identifiers outside
that list. A 403 from Auth throws `authentication_required`: prompt for MFA
again. Set `CubistEscrowProviderOptions.authAudience` to the escrow's
`AUTH_CONTROLLER_AUDIENCE`.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
