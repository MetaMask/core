# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed only before writing. See [Architecture](ARCHITECTURE.md).

## Recovery Lock

Configure `RecoveryRegistrationLockProvider` with the registration service URL,
`fetch`, and a messenger that can call
`AuthenticationController:getBearerToken` and
`AuthenticationController:refreshCanonicalProfileId`.

Call `acquireLock()` before reading identifiers, hold it while changing Auth
identifiers and mutating, then call `releaseLock()`. Call `renewLock()` after
long user interaction. If renewal fails, acquire again and reread.

The controller renews the 6-minute lease before every 5-minute approval, and
escrows reject expired approvals. So once another operation can take the lease,
this operation's approvals are dead.

## Auth API Integration

Configure `AuthApiRecoveryAuthProvider` with a messenger that can call
`AuthenticationController:refreshCanonicalProfileId` and
`AuthenticationController:requestMfaApproval`. It resolves the current canonical
profile id for each mutation and requests approvals from `/api/v2/mfa/approvals`. Writes and reads require a
request-bound AAL2 approval; updates and reads also require an identifier proof.
Without a recent MFA verification, approvals reject with `StepUpRequiredError`:
verify, then call `resume()` or retry the read.

`register` and `updateIdentifiers` send the approval's `identifiers` to each
escrow as `approvedIdentifiers`; the escrow rejects non-SIWE payload
identifiers outside that list. Build those from Auth's entries unchanged
(verifier included): the controller rejects any other before writing, and the
mutation can then be aborted. Each SIWE wallet a mutation adds is proven
through `identifierAuthProvider` instead, including at `register`. Set
`CubistEscrowProviderOptions.authAudience` to the escrow's
`AUTH_CONTROLLER_AUDIENCE`.

Before `updateIdentifiers`, call `getIdentifiers()` (AAL1) for the enrolled
identifiers, their `epoch` (pass as `expectedEpoch`), and Auth's identifiers;
build the new set from Auth's entries.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
