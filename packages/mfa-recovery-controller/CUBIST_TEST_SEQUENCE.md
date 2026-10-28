# Cubist MFA recovery sequence

How the mobile developer test (`runMfaRecoveryCubistTest` in
`metamask-mobile`) drives one `MfaRecoveryController` against a single Cubist
escrow (`id: cubist`). It runs three mutations and reads the secret back after
each one. Error branches, pending-state repair, and multi-escrow behavior are
in [ARCHITECTURE.md](./ARCHITECTURE.md); treat the TypeScript in `src/` as the
source of truth if a diagram drifts.

| Step | Client call                                                  | Read with            | Version |
| ---- | ------------------------------------------------------------ | -------------------- | ------- |
| 1    | `register(secret, [siwe, passkey])`                          | `siwe`               | `0 → 1` |
| 2    | `updateRecoverySecret(passkey, newSecret, epoch)`            | `passkey`            | `1 → 2` |
| 3    | `updateIdentifiers(siwe, [siwe, replacementPasskey], epoch)` | `replacementPasskey` | `2 → 3` |

Each update passes the `epoch` returned by the previous read.

## Setup

The mobile client does this before it creates the controller. The controller
never calls these services itself.

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile client
  participant Auth as authProvider
  participant Id as identifierAuthProvider
  participant C as MfaRecoveryController
  participant Cubist as Cubist escrow

  Note over Mobile: SIWE sign-in with the primary account → accessToken
  Mobile->>Auth: new StubAuthProvider(accessToken, apiKey)
  Mobile->>Auth: getAccessToken()
  Auth-->>Mobile: dev JWT (POST /token)
  Note over Mobile: Recovery Registration API exchanges that token → OIDC idToken
  Mobile->>Cubist: createOidcSession(orgId, idToken, scopes)
  Cubist-->>Mobile: CubeSigner session
  Note over Mobile: new CubistEscrowProvider(session, wrap key, receipt key)
  Mobile->>Id: new TestIdentifierAuthProvider(address, signPersonalMessage)
  Mobile->>C: new MfaRecoveryController(authProvider, identifierAuthProvider, [escrow])
```

- `authProvider` (`StubAuthProvider` in mobile) takes the profile ID from the
  access token and mints request-bound JWTs from the MPC service's
  development-only `POST /token` endpoint. That route is not mounted in
  production builds.
- `identifierAuthProvider` (`TestIdentifierAuthProvider` in mobile) signs SIWE
  proofs with the primary account and passkey proofs with a software passkey.

## Write: `register`, `updateRecoverySecret`, `updateIdentifiers`

All mutations require a request-bound AAL2 approval. `register` and
`updateIdentifiers` also send the approval's identifiers as
`approvedIdentifiers`, bound by `identifiers_hash`.

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile client
  participant C as MfaRecoveryController
  participant Auth as authProvider
  participant Id as identifierAuthProvider
  participant Cubist as Cubist escrow

  Mobile->>C: register / updateRecoverySecret / updateIdentifiers
  C->>Auth: getAuthenticatedProfileId()
  Auth-->>C: profileId
  Note over C: Build the mutation (version epoch → epoch + 1)<br/>and its requestHash
  C->>Auth: authorizeRecoveryRequest(requestHash, requireTwoFactor: true, ...)
  Auth-->>C: JWT bound to requestHash
  C->>Cubist: isAvailable

  opt updates only (not register)
    Note over C,Cubist: Proof of possession for requestHash (see below)
  end

  Note over C: Encrypt the secret to the Cubist wrap key
  C->>Cubist: applyMutation(mutation, JWT, { token, proof } or null, payload, approvedIdentifiers)
  Cubist-->>C: signed receipt
  Note over C: Verify the receipt with the pinned receipt key
  C-->>Mobile: done
```

| Operation              | Identifier proof        | Payload              |
| ---------------------- | ----------------------- | -------------------- |
| `register`             | none                    | identifiers + secret |
| `updateRecoverySecret` | the identifier argument | secret               |
| `updateIdentifiers`    | the identifier argument | identifiers          |

If an escrow refuses the mutation (`MutationRejectedError`) and every replica
does the same, the controller clears the pending mutation. A transport failure
or a partial receipt keeps it and throws `incomplete_mutation`; call `resume()`
to finish that write.

## Proof of possession

Updates and reads prove control of a registered identifier:

1. The controller generates an Ed25519 proof key and requests an identifier token
   binding `hash([proofPublicKey, requestHash])`: the SIWE nonce or WebAuthn challenge.
2. The proof key signs `hash([token, challenge.id, requestHash])` for each escrow.
   The controller sends the approval and `{ kind: 'key-bound', token, proof }`
   with `applyMutation` or `getSecret`.
3. The escrow C2F verifies the provider assertion, registered identifier, request
   binding, challenge, and proof signature.

The proof private key never leaves the controller/caller; read sessions keep it
in memory. `register` sends `null` instead of an identifier proof. Implementation:
`requestKeyBoundIdentifierToken` and `authorizeEscrowsWithToken` in `src/identifier-auth.ts`.

## Read: `authenticateIdentifier`, `getRecoverySecret`

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile client
  participant C as MfaRecoveryController
  participant Auth as authProvider
  participant Id as identifierAuthProvider
  participant Cubist as Cubist escrow

  Mobile->>C: authenticateIdentifier(identifier)
  Note over C: Create a one-time read key pkE<br/>requestHash = hash({ getRecoverySecret, requestId, pkE })
  Note over C,Id: Proof of possession, part 1: proof key + identifier token
  C-->>Mobile: session { token, proofPrivateKey, requestId, read key }

  Mobile->>C: getRecoverySecret(session)
  Note over C: Recompute requestHash, must equal token.requestHash
  C->>Cubist: isAvailable
  C->>Auth: authorizeRecoveryRequest(requestHash, requireTwoFactor: true, ...)
  Auth-->>C: request-bound AAL2 approval
  Note over C,Cubist: Proof of possession, part 2: challenge + signature
  C->>Cubist: getSecret(approval, { token, proof }, requestId, pkE)
  Cubist-->>C: secret encrypted to the read key, version
  Note over C: Decrypt the secret
  C-->>Mobile: { recoverySecret, epoch: version }
```

With one escrow, any failure during the read (challenge, `getSecret`, wrong
wrap key, or decrypt) surfaces as `read_failed`.
