# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed before writing, or once the write approval expired more
than 5 minutes ago and no escrow applied the mutation. If the identifier an update started with can no
longer authenticate, pass another enrolled one to `resume(identifier)`. See
[Architecture](ARCHITECTURE.md).

## Replica Repair

Mutations and `getIdentifiers()` fail with `replica_lagging` when escrows are
at different versions, for example after an interrupted write whose pending
state was lost. Call `resume(identifier)` under the recovery lock: with no
pending mutation, it copies the highest record to escrows one version behind
it. Then retry the mutation.

## Recovery Lock

Configure `RecoveryRegistrationLockProvider` with the registration service URL,
`fetch`, and a messenger that can call
`AuthenticationController:getBearerToken` and
`AuthenticationController:refreshCanonicalProfileId`.

Call `acquireLock()` before reading identifiers, hold it while changing Auth
identifiers and mutating, then call `releaseLock()`. Call `acquireLock()` again
after long user interaction to extend the lease.

The controller acquires the 6-minute lease before every 5-minute approval, and
escrows reject expired approvals. So once another operation can take the lease,
this operation's approvals are dead.

## Recovery Lock

Configure `RecoveryRegistrationLockProvider` with the registration service URL,
`fetch`, and a messenger that can call
`AuthenticationController:getBearerToken` and
`AuthenticationController:refreshCanonicalProfileId`.

Call `acquireLock()` before reading identifiers, hold it while changing Auth
identifiers and mutating, then call `releaseLock()`. Call `acquireLock()` again
after long user interaction to extend the lease.

The controller acquires the 6-minute lease before every 5-minute approval, and
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

## Seedless password unlock

`RecoveryIdentifierAuthProvider` has one method, `getKeyBoundIdentifierLogin`.
It performs one identifier login and returns the key-bound recovery `token`
plus, for social logins, the seedless auth-server token set
(`seedlessAuthData`). Every controller path calls it and uses only what it
needs: `authenticateIdentifier` returns both, and mutation writes
(`updateRecoverySecret` / `updateIdentifiers`) use only the token and never
send `seedlessAuthData` to escrows.

`seedlessAuthData` on the returned `IdentifierSession` is **optional**:
passkey / SIWE logins omit it. The caller decides whether it needs it. For
seedless social password unlock, check that it is present (including
`revokeToken`):

```typescript
const session = await mfaRecoveryController.authenticateIdentifier(identifier);
if (!session.seedlessAuthData?.revokeToken) {
  throw new Error('Social login did not return seedless auth data');
}

const { seedlessAuthData, ...recoverySession } = session;
await seedlessOnboardingController.authenticate(seedlessAuthData);
// Prompt for the password, evaluate TOPRF, and decrypt the vault.
// Keep recoverySession only if a later getRecoverySecret is needed.
```

`seedlessAuthData` is the `SeedlessAuthData` type from
`@metamask/seedless-onboarding-controller`, the parameters of
`SeedlessOnboardingController.authenticate` without `skipLock`. When present,
it is checked with `parseSeedlessAuthData` from that package (required fields
present, unknown fields stripped) and its `authConnection` is checked against
the social identifier's issuer namespace using `AUTH_CONNECTION_BY_NAMESPACE`
(provider match only). Prefer dropping `seedlessAuthData` before holding the
session for `getRecoverySecret(session)`; escrow authorization uses only the
key-bound credential fields.

The seedless auth data comes only from the AAL1 social login and is never sent
to recovery escrows. `getRecoverySecret` separately requests its AAL2
approval when a recovery-secret read is needed.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
