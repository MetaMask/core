# Cubist MFA recovery sequence

How the mobile developer test (`runMfaRecoveryCubistTest` in
`metamask-mobile`) drives one `MfaRecoveryController` against a single Cubist
escrow (`id: cubist`). It runs three mutations and reads the secret back after
each one. Error branches, pending-state repair, and multi-escrow behavior are
in [ARCHITECTURE.md](./ARCHITECTURE.md); treat the TypeScript in `src/` as the
source of truth if a diagram drifts.

| Step | Client call                                                  | Version |
| ---- | ------------------------------------------------------------ | ------- |
| 1    | `register(secret, [siwe, passkey])`                          | `0 → 1` |
| 2    | `updateRecoverySecret(passkey, newSecret, epoch)`            | `1 → 2` |
| 3    | `updateIdentifiers(siwe, [siwe, replacementPasskey], epoch)` | `2 → 3` |

Each update passes the `epoch` returned by the previous read.

## Overview

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile client
  participant C as MfaRecoveryController
  participant Cubist as Cubist escrow

  Note over Mobile,Cubist: Setup: sign in, open Cubist session, build controller

  Mobile->>C: register(secret, [siwe, passkey])
  C->>Cubist: applyMutation (version 0 → 1)
  Cubist-->>C: signed receipt
  Mobile->>C: read with siwe
  C->>Cubist: getSecret
  C-->>Mobile: secret, epoch 1

  Mobile->>C: updateRecoverySecret(passkey, newSecret, 1)
  C->>Cubist: applyMutation (version 1 → 2)
  Cubist-->>C: signed receipt
  Mobile->>C: read with passkey
  C->>Cubist: getSecret
  C-->>Mobile: newSecret, epoch 2

  Mobile->>C: updateIdentifiers(siwe, [siwe, replacementPasskey], 2)
  C->>Cubist: applyMutation (version 2 → 3)
  Cubist-->>C: signed receipt
  Mobile->>C: read with replacementPasskey
  C->>Cubist: getSecret
  C-->>Mobile: same secret, epoch 3
```

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

All three mutations share one path.

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
  C->>Auth: authorizeRecoveryRequest(requestHash, ...)
  Auth-->>C: JWT bound to requestHash
  C->>Cubist: isAvailable

  opt updates only (not register)
    Note over C,Cubist: Proof of possession for requestHash (see below)
  end

  Note over C: Encrypt the secret to the Cubist wrap key
  C->>Cubist: applyMutation(mutation, JWT, { token, proof } or null, payload)
  Cubist-->>C: signed receipt
  Note over C: Verify the receipt with the pinned receipt key
  C-->>Mobile: done
```

| Operation              | Identifier proof        | JWT requires     | Payload              |
| ---------------------- | ----------------------- | ---------------- | -------------------- |
| `register`             | none                    | identifiers      | identifiers + secret |
| `updateRecoverySecret` | the identifier argument | 2FA              | secret               |
| `updateIdentifiers`    | the identifier argument | 2FA, identifiers | identifiers          |

If `applyMutation` fails, the controller keeps the pending mutation and throws
`incomplete_mutation`; call `resume()` to finish it.

## Proof of possession

Updates and reads prove control of a registered identifier in two parts. The
identifier provider signs a token that names a fresh proof key and the
`requestHash`. Then the controller signs a Cubist challenge with that proof
key. Code: `requestKeyBoundIdentifierToken` and `authorizeEscrowsWithToken` in
`src/identifier-auth.ts`.

```mermaid
sequenceDiagram
  autonumber
  participant C as MfaRecoveryController
  participant Id as identifierAuthProvider
  participant Cubist as Cubist escrow

  rect rgba(128, 128, 128, 0.1)
  Note over C,Id: Part 1: proof key + identifier token
  Note over C: generateSigningKey() → P-256 proof key pair
  C->>Id: getKeyBoundIdentifierToken(identifier, proofPublicKey, requestHash)
  Note over Id: binding = hash([proofPublicKey, requestHash])<br/>SIWE: personal_sign a SIWE message, Nonce = binding<br/>Passkey: WebAuthn assertion, challenge = binding
  Id-->>C: token { identifier, proofPublicKey, requestHash, providerAssertion }
  end

  rect rgba(128, 128, 128, 0.1)
  Note over C,Cubist: Part 2: challenge + signature
  C->>Cubist: generateChallenge()
  Cubist-->>C: challenge { id, escrowId, expiresAt }
  Note over C: signature = sign(proofPrivateKey,<br/>hash([token, challenge.id, requestHash]))
  Note over C: authorization = { kind: key-bound, token,<br/>proof: { challengeId, requestHash, signature } }
  C->>Cubist: applyMutation or getSecret(authorization, ...)
  Note over Cubist: providerAssertion is valid for the identifier<br/>and binds proofPublicKey + requestHash<br/>identifier is registered, challenge id is its own<br/>signature verifies under proofPublicKey
  end
```

- The identifier provider signs once, over the proof key and `requestHash`.
  The proof key then signs each escrow challenge, so the token works only for
  this request.
- The proof private key is never sent to the identifier provider or Cubist.
  For reads it lives only in the session returned by `authenticateIdentifier`.
- The Cubist-side checks happen in the escrow C2F (`cubist_secret_escrow`),
  not in this package.
- `register` sends no identifier proof (`null`); the JWT from `authProvider`
  is the only authorization.

## Read: `authenticateIdentifier`, `getRecoverySecret`

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile client
  participant C as MfaRecoveryController
  participant Id as identifierAuthProvider
  participant Cubist as Cubist escrow

  Mobile->>C: authenticateIdentifier(identifier)
  Note over C: Create a one-time read key pkE<br/>requestHash = hash({ getRecoverySecret, requestId, pkE })
  Note over C,Id: Proof of possession, part 1: proof key + identifier token
  C-->>Mobile: session { token, proofPrivateKey, requestId, read key }

  Mobile->>C: getRecoverySecret(session)
  Note over C: Recompute requestHash, must equal token.requestHash
  C->>Cubist: isAvailable
  Note over C,Cubist: Proof of possession, part 2: challenge + signature
  C->>Cubist: getSecret({ token, proof }, requestId, pkE)
  Cubist-->>C: secret encrypted to the read key, version
  Note over C: Decrypt the secret
  C-->>Mobile: { recoverySecret, epoch: version }
```

With one escrow, any failure during the read (challenge, `getSecret`, wrong
wrap key, or decrypt) surfaces as `read_failed`.
