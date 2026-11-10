# `@metamask/mfa-recovery-controller`

Coordinates MFA recovery through injected auth and escrow providers.

Pending mutations are encrypted in controller state. `resume()` completes them;
`abort()` is allowed only before writing. See [Architecture](ARCHITECTURE.md).

## Auth API Integration

Configure `AuthApiRecoveryAuthProvider` with a messenger that can call
`AuthenticationController:refreshCanonicalProfileId` and
`AuthenticationController:requestMfaApproval`. It resolves the current canonical
profile id for each mutation and requests approvals from `/api/v2/mfa/approvals`. Writes and reads require a
request-bound AAL2 approval; updates and reads also require an identifier proof.
Without a recent MFA verification, approvals reject with `StepUpRequiredError`:
verify, then call `resume()` or retry the read.

`register` and `updateIdentifiers` send the approval's `identifiers` to each
escrow as `approvedIdentifiers`; the escrow rejects payload identifiers outside
that list. Build payload identifiers from those entries unchanged (verifier
included): the controller rejects any other identifier before writing, and the
mutation can then be aborted. Set `CubistEscrowProviderOptions.authAudience` to the escrow's
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

`seedlessAuthData` on the result is **optional**: passkey / SIWE logins omit
it. The caller decides whether it needs it. For seedless social password
unlock, check that it is present (including `revokeToken`):

```typescript
const { session, seedlessAuthData } =
  await mfaRecoveryController.authenticateIdentifier(identifier);
if (!seedlessAuthData?.revokeToken) {
  throw new Error('Social login did not return seedless auth data');
}

await seedlessOnboardingController.authenticate(seedlessAuthData);
// Prompt for the password, evaluate TOPRF, and decrypt the vault.
// Keep `session` only if a later getRecoverySecret is needed; drop seedlessAuthData.
```

`seedlessAuthData` is the `SeedlessAuthData` type from
`@metamask/seedless-onboarding-controller`, the parameters of
`SeedlessOnboardingController.authenticate` without `skipLock`. When present,
it is checked with `parseSeedlessAuthData` from that package (required fields
present, unknown fields stripped) and its `authConnection` is checked against
the social identifier's issuer namespace using `AUTH_CONNECTION_BY_NAMESPACE`
(provider match only). Pass only `session` to `getRecoverySecret(session)`
later — do not keep auth-server tokens on the session object.

The seedless auth data comes only from the AAL1 social login and is never sent
to recovery escrows. `getRecoverySecret` separately requests its AAL2
approval when a recovery-secret read is needed.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
