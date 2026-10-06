# Cubist MFA recovery integration test sequence

Harness flow for `runMfaRecoveryCubistTest` in MetaMask Mobile (Developer
Options, Cubist gamma/beta/prod). Mobile drives one `MfaRecoveryController`
against a single Cubist escrow (`id: cubist`) through three mutations, reading
the secret back after each one. The general controller design is in
[ARCHITECTURE.md](./ARCHITECTURE.md); treat the TypeScript in `src/` as the
source of truth if a diagram drifts.

- Versions: `0 → 1` (register), `1 → 2` (update secret), `2 → 3` (update
  identifiers).
- Pending state: `idle → authorizing → writing → idle` for every mutation.

Sections:

- [Setup — outside the controller](#setup-outside-the-controller)
- [Write path — `register`, `updateRecoverySecret`, `updateIdentifiers`](#write-path-mutate)
- [Read path — `authenticateIdentifier`, `getRecoverySecret`](#read-path)

## Overview

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile (runMfaRecoveryCubistTest)
  participant C as MfaRecoveryController
  participant Escrow as Cubist escrow

  Note over Mobile: createRecoveryContext<br/>SIWE login, OIDC token, CubeSigner session

  Mobile->>C: register(secret, [siwe, passkey])
  C->>Escrow: applyMutation register, expectedVersion 0, newVersion 1
  Escrow-->>C: receipt version 1
  Mobile->>C: authenticateIdentifier(siwe)
  Mobile->>C: getRecoverySecret(session)
  C->>Escrow: getSecret
  Escrow-->>Mobile: secret, epoch 1

  Mobile->>C: updateRecoverySecret(passkey, newSecret, epoch 1)
  C->>Escrow: applyMutation, newVersion 2
  Mobile->>C: authenticateIdentifier(passkey)
  Mobile->>C: getRecoverySecret(session)
  Escrow-->>Mobile: newSecret, epoch 2

  Mobile->>C: updateIdentifiers(siwe, [siwe, replacementPasskey], epoch 2)
  C->>Escrow: applyMutation, newVersion 3
  Mobile->>C: authenticateIdentifier(replacementPasskey)
  Mobile->>C: getRecoverySecret(session)
  Escrow-->>Mobile: same secret, epoch 3
```

Each step only runs if the previous read returned the expected secret.

## Setup (outside the controller)

The controller does not call the Authentication API, the MPC token service,
the Recovery Registration API, or CubeSigner. Mobile does all of this before
constructing the controller (see
[Cubist store sequence](./ARCHITECTURE.md#cubist-store-sequence)).

```mermaid
sequenceDiagram
  autonumber
  participant UI as Developer Options
  participant Mobile as Mobile (runMfaRecoveryCubistTest)
  participant AuthAPI as Authentication API
  participant Token as MPC token service
  participant Reg as Recovery Registration API
  participant Cubist as CubeSigner

  UI->>Mobile: run test
  Mobile->>AuthAPI: SIWE login (JwtBearerAuth, primary account signs)
  AuthAPI-->>Mobile: accessToken
  Note over Mobile: StubAuthProvider: profileId = accessToken sub
  Mobile->>Token: POST /token { user: profileId } (x-api-key)
  Token-->>Mobile: minted JWT
  Mobile->>Reg: POST /v1/recovery/registration/oidc-token (Bearer minted JWT)
  Reg-->>Mobile: idToken, expiresAt
  Mobile->>Cubist: createOidcSession(orgId, idToken, scopes)
  Cubist-->>Mobile: session
  Note over Mobile: new CubistEscrowProvider(client, wrap/receipt keys)<br/>new MfaRecoveryController(StubAuthProvider,<br/>SIWE + software passkey identifier auth,<br/>[escrow], passthrough encryptor)
```

**Notes**

- `POST /token` is the MPC service's development-only token route. It is not
  mounted in production builds.
- `StubAuthProvider` and `passthroughEncryptor` come from `tests/stubs.ts`.

## Write path: `#mutate`

`register`, `updateRecoverySecret`, and `updateIdentifiers` share this path
(`#mutate` and `#replicateMutation` in `src/MfaRecoveryController.ts`). The
controller holds a lock for the whole mutation. Repair of an existing pending
mutation is `resume()` only (see
[Crash / repair](./ARCHITECTURE.md#crash--repair)).

`register` and `updateIdentifiers` require at least two distinct identifiers
(`type + namespace + value`). `siwe` and `passkey` are both `key-bound`.

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile
  participant C as MfaRecoveryController
  participant Auth as authProvider (StubAuthProvider)
  participant Id as identifierAuthProvider
  participant Enc as pendingOperationEncryptor
  participant Escrow as Cubist escrow

  Mobile->>C: register / updateRecoverySecret / updateIdentifiers
  C->>C: withLock
  C->>Enc: decrypt pendingOperation
  alt pending exists
    C-->>Mobile: throw pending_mutation
  else no pending
    Enc-->>C: null
  end
  C->>Auth: getAuthenticatedProfileId()
  Auth-->>C: profileId

  Note over C: mutation id = randomId()<br/>expectedVersion = epoch<br/>newVersion = epoch + 1<br/>audiences = ["cubist"]<br/>payloadHash = hash(logical payload)<br/>requestHash = hash(id, profileId, operation,<br/>expectedVersion, newVersion, payloadHash, audiences)

  C->>Enc: encrypt phase authorizing
  Note over Enc: payload is plaintext hex secret<br/>plus identifiers, not wrapped yet

  alt register
    C->>Auth: authorizeRecoveryRequest(requestHash, identifiers)
  else updateRecoverySecret
    C->>Auth: authorizeRecoveryRequest(requestHash, requireTwoFactor)
  else updateIdentifiers
    C->>Auth: authorizeRecoveryRequest(requestHash, requireTwoFactor, identifiers)
  end
  Note over Auth: mints JWT with ext claims:<br/>requestHash, aal2 when requireTwoFactor,<br/>identifiersHash when identifiers are present
  Auth-->>C: AuthController JWT

  C->>Escrow: isAvailable()
  alt userGet() fails
    C-->>Mobile: throw escrow_unavailable (pending stays authorizing)
  else available
    Escrow-->>C: userGet() succeeds
  end

  C->>C: decode JWT, re-authorize if exp <= now

  alt not register
    C->>C: generateSigningKey() proof key
    C->>Id: getKeyBoundIdentifierToken(identifier, proofPublicKey, requestHash)
    Note over Id: SIWE: personal_sign of SIWE message<br/>nonce = hash([proofPublicKey, requestHash])<br/>Passkey: assertion, challenge = that same digest
    Id-->>C: token + providerAssertion
    C->>Escrow: generateChallenge()
    Escrow-->>C: challenge id, expiresAt
    C->>C: sign(proofPrivateKey, hash([token, challengeId, requestHash]))
    opt challenge or signing fails
      C-->>Mobile: throw identifier_auth_failed
    end
  end

  alt payload contains recoverySecret
    C->>C: fresh ephemeral key, encrypt secret to escrow wrap public key
    Note over C: apply body is { pkE, ciphertext }<br/>plus identifiers on register
  else updateIdentifiers
    Note over C: apply body is { identifiers } only
  end

  C->>Enc: encrypt phase writing, receipts []
  C->>Escrow: applyMutation(mutation, JWT, authorization or null, wrapped payload)
  Note over Escrow: C2F cubist_secret_escrow<br/>register sends identifierAuthorization null
  alt applyMutation rejects
    C->>Enc: encrypt writing, receipts []
    C-->>Mobile: throw incomplete_mutation (call resume)
  else receipt returned
    Escrow-->>C: receipt { mutationId, requestHash, escrowId, version, receiptKeyId, signature }
    C->>C: verifyReceipt with pinned receipt public key
    alt receipt invalid
      C-->>Mobile: throw invalid_receipt (pending stays writing)
    else valid
      C->>Enc: encrypt writing with receipt
      C->>C: clear pendingOperation (every escrow has a valid receipt)
    end
  end
```

| Operation              | Epoch in                 | Payload hashed           | Identifier proof        | AuthController token                               |
| ---------------------- | ------------------------ | ------------------------ | ----------------------- | -------------------------------------------------- |
| `register`             | `0`                      | identifiers + hex secret | none                    | `requestHash` + identifiers, no `requireTwoFactor` |
| `updateRecoverySecret` | epoch from the last read | hex secret only          | the identifier argument | `requireTwoFactor`                                 |
| `updateIdentifiers`    | epoch from the last read | identifiers only         | the identifier argument | `requireTwoFactor` + identifiers                   |

**Notes**

- `newVersion` must be `expectedVersion + 1`; the escrow rejects a mismatch.
- The secret is wrapped per escrow only at `applyMutation`
  (`#payloadForEscrow`); pending state keeps the hex secret. In this harness
  the encryptor is a JSON passthrough.
- Receipts are checked by `verifyMutationReceipt` (`src/escrow-utils.ts`),
  which requires a matching `escrowId` and then calls the provider's
  `verifyReceipt` (`src/escrow-providers/cubist-escrow-provider.ts`).
- Key-bound identifier proofs are built by `requestKeyBoundIdentifierToken`
  and `authorizeEscrowsWithToken` (`src/identifier-auth.ts`).

## Read path

`getRecoverySecret` (`src/MfaRecoveryController.ts`) does not wait for or
repair a pending mutation. It takes the session from `authenticateIdentifier`
and checks that the session token is still bound to the same read hash. See
also [Read sequence](./ARCHITECTURE.md#read-sequence-getrecoverysecret).

```mermaid
sequenceDiagram
  autonumber
  participant Mobile as Mobile
  participant C as MfaRecoveryController
  participant Id as identifierAuthProvider
  participant Escrow as Cubist escrow

  Mobile->>C: authenticateIdentifier(identifier)
  C->>C: requestId = randomId(), ephemeral key pkE
  Note over C: requestHash = hash({ operation: getRecoverySecret, requestId, pkE })
  C->>C: generateSigningKey() proof key
  C->>Id: getKeyBoundIdentifierToken(identifier, proofPublicKey, requestHash)
  Id-->>C: key-bound token
  C-->>Mobile: session { token, proofPrivateKey, requestId, ephemeralPrivateKey, pkE }

  Mobile->>C: getRecoverySecret(session)
  C->>C: withLock, recompute requestHash
  alt token.requestHash differs
    C-->>Mobile: throw invalid_identifier_session
  end
  C->>Escrow: isAvailable()
  alt unavailable
    C-->>Mobile: throw no_available_escrow
  end
  C->>Escrow: generateChallenge()
  Escrow-->>C: challenge
  C->>C: sign(proofPrivateKey, hash([token, challengeId, requestHash]))
  C->>Escrow: getSecret(key-bound authorization, requestId, pkE)
  Escrow-->>C: ciphertext wrapped to pkE, version, lastMutationId, wrapKeyId
  C->>C: wrapKeyId must match escrow wrap public key
  C->>C: decryptFromPublic(ephemeralPrivateKey, wrapPublicKey, ciphertext)
  C->>C: selectHighestConsistentVersion
  alt no successful reply
    C-->>Mobile: throw read_failed
  else replies at highest version disagree
    C-->>Mobile: throw replica_corruption
  else ok
    C-->>Mobile: { recoverySecret, epoch: version }
  end
```

**Notes**

- `selectHighestConsistentVersion` (`src/escrow-utils.ts`) keeps successful
  escrow replies, takes the highest `version`, and requires every reply at
  that version to share the same `lastMutationId` and secret bytes.
- Per-escrow failures (`generateChallenge` or `getSecret` rejecting,
  `wrap_key_mismatch`, a failed decrypt) only drop that reply. With one escrow, any of them surfaces as
  `read_failed`.
- Mobile compares the returned bytes to the secret it last wrote.
