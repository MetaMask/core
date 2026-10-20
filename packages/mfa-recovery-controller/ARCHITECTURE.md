# `@metamask/mfa-recovery-controller`

Orchestration layer for MFA recovery. The controller never stores the recovery
secret in controller state. It replicates a full copy of that secret to every
configured escrow, and persists only an **encrypted** pending mutation so a
crash can finish the same write.

## Architecture

The controller is a coordinator. Auth, identifier proofs, escrow I/O, and
encryption are injected. OTP collection is not wired yet.

```mermaid
flowchart LR
  Client["Client / UI"]
  Messenger["Messenger"]
  Ctrl["MfaRecoveryController"]
  Auth["RecoveryAuthProvider"]
  IdP["RecoveryIdentifierAuthProvider"]
  Enc["PendingOperationEncryptor"]
  EA["Escrow A"]
  EB["Escrow B"]

  Client --> Messenger
  Messenger --> Ctrl
  Ctrl --> Auth
  Ctrl --> IdP
  Ctrl --> Enc
  Ctrl --> EA
  Ctrl --> EB
```

| Piece                       | Role                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `pendingOperation`          | Only persisted field: encrypted `authorizing` / `writing` blob, or `null`   |
| `escrows[]`                 | Build-time replica set; non-empty, unique `id`s; mutations require **all**  |
| `authProvider`              | Profile id + request-bound AuthController token (Hydra JWT)                 |
| `identifierAuthProvider`    | Key-bound IdP assertion (passkey / OIDC / SIWE)                             |
| `pendingOperationEncryptor` | Encrypts / decrypts the pending blob with wallet secure storage             |
| `now`                       | Clock (Unix seconds) for AuthController token expiry; defaults to `unixNow` |
| `#withLock`                 | Serializes every public method except `authenticateIdentifier`              |

Each escrow has two identities: `id` is the replica id used in mutation
`audiences` and receipts; `authAudience` is the audience the AuthController
token must carry for that escrow. They are independent (Cubist uses `"cubist"`
for both).

Identifier types pick the auth mode from a trusted table, not a client flag:
`passkey` / `oidc` / `siwe` → key-bound. Any other type is rejected with
`unknown_identifier_type`. `emailOtp` / `smsOtp` escrow-challenge is not wired
yet (MFA-605 / MFA-606 / MFA-568).

`register` and `updateIdentifiers` require at least two **distinct**
identifiers (by `type` + `namespace` + `value`).

Recovery secrets are wrapped in transit with X25519 ECDH, HKDF-SHA256 (empty
salt, info `escrow-wrap-v1`), and AES-256-GCM. The ciphertext is the raw bytes
`iv || ciphertext+tag`. Wrap keys and `pkE` are raw 32-byte X25519 public keys,
and `wrapKeyId` is the SHA-256 of the raw 32-byte public key. Proof keys and
receipt keys are raw 32-byte Ed25519 public keys, and `receiptKeyId` is the
SHA-256 of the raw 32-byte Ed25519 public key. Pending state stores the secret
as 0x-hex; `payloadHash` is the hash of that pending payload. At apply, each
escrow gets `{ pkE, ciphertext }` wrapped to its own `wrapPublicKey` with a
fresh ephemeral key. Reads bind the client's ephemeral `pkE` into the
`getSecret` request hash, and the escrow wraps its response to `pkE`. On the
Cubist wire, byte fields are 0x-prefixed hex, and the hash of a request
matches the hash computed over its hex-encoded form.

Public surface (all exposed as messenger actions): `register`,
`updateRecoverySecret`, `updateIdentifiers`, `authenticateIdentifier`,
`getRecoverySecret`, `resume`, `abort`, `getPhase`.

## State machine

Persisted phase is derived from decrypted pending state: no pending → `idle`.

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> authorizing: register / updateRecoverySecret / updateIdentifiers
  authorizing --> idle: abort()
  authorizing --> writing: identifier auth succeeds, before first apply
  writing --> writing: more receipts, still missing replicas
  writing --> idle: every configured escrow has a valid receipt
  writing --> idle: every escrow rejects and none has a receipt
  writing --> writing: resume() retries only missing receipts
  authorizing --> writing: resume() authorizes then writes
```

Rules:

- **`abort()`** drops `authorizing` only. `writing` must `resume()`
  (`abort_not_allowed`).
- `writing` is persisted before the **first escrow apply**, after the
  AuthController token is issued, every target escrow has accepted identifier
  authorization, and the per-escrow payloads are wrapped. An ambiguous apply
  failure remains resumable, while pre-write failures stay abortable.
- `register` / `updateRecoverySecret` / `updateIdentifiers` require idle
  pending state (`pending_mutation`). `resume()` finishes a persisted
  mutation and is a no-op when idle.

### Pending state validation

The decrypted blob is validated on every load and before every persist.
Anything that fails is rejected rather than acted on:

- Shape: phase, mutation fields, `newVersion = expectedVersion + 1`, payload
  keys for the operation, hex secret, at least two distinct identifiers, known
  identifier types.
- `audiences` must equal the configured escrow ids, in order
  (`audience_mismatch`).
- `payloadHash` must match the payload (`payload_mismatch`) and `requestHash`
  must match the mutation fields.
- `register` has `expectedVersion` `0` and `identifier: null`; updates carry
  an identifier.
- `writing` only: the AuthController token's `sub` is the mutation
  `profileId`, its `ext.request_hash` is the mutation `requestHash`, updates
  have `aal >= 2`, `register` / `updateIdentifiers` carry `identifiers_hash`,
  and receipts are well-formed with at most one per escrow.

## Mutation sequence (`register` / updates)

Mutations are all-or-nothing across the configured escrow set. Reads are not.

```mermaid
sequenceDiagram
  participant C as Client
  participant M as MfaRecoveryController
  participant A as AuthProvider
  participant I as IdentifierAuthProvider
  participant E as Escrows

  C->>M: register / updateRecoverySecret / updateIdentifiers
  M->>M: lock, reject if a mutation is already pending
  M->>E: isAvailable (every escrow required)
  M->>A: getAuthenticatedProfileId
  M->>M: expectedVersion from caller epoch (register uses 0)
  M->>M: build mutation, requestHash = hash(mutation fields)
  M->>M: persist pending = authorizing
  M->>A: authorizeRecoveryRequest (AuthController token)
  M->>M: skip escrows with a stored receipt, re-verify stored receipts
  M->>E: isAvailable (remaining escrows)
  M->>M: reuse token, or re-issue it if exp <= now()
  alt not register
    M->>I: getKeyBoundIdentifierToken
    M->>E: generateChallenge + PoP per remaining escrow (all required)
  end
  M->>M: wrap secret per escrow, persist writing
  par write every remaining replica
    M->>E: applyMutation
  end
  alt every escrow rejects and none has a receipt
    M->>M: clear pending → idle
    M-->>C: MutationRejectedError (start a new mutation)
  else
    M->>M: persist valid receipts
    alt a receipt failed verification
      M-->>C: invalid_receipt (call resume)
    else some replicas missing
      M-->>C: IncompleteMutationError (call resume)
    else all receipts valid
      M->>M: clear pending → idle
    end
  end
```

AuthController token request:

- `requestHash` is the mutation `requestHash`; `audiences` is every escrow's
  `authAudience`.
- Updates set `requireTwoFactor`. `register` and `updateIdentifiers` pass the
  payload `identifiers` so the token is bound to them.
- The token is a compact Hydra JWT. The controller decodes its claims without
  verifying the signature (escrows verify it) and only uses them for
  pending-state checks and the `exp` refresh.

Receipts:

- A receipt counts only if it is well-formed, its `escrowId` matches the
  target, and `escrow.verifyReceipt` accepts it (pinned receipt key).
- Stored receipts are re-verified before every retry. A receipt for an
  escrow that is no longer configured fails with `unknown_receipt_escrow`.
- `MutationRejectedError` is only surfaced when **every** remaining escrow
  threw `MutationRejectedError` and no receipt exists yet; anything else may
  have been applied and stays `writing`.

Versioning:

- Version lives on the mutation (`expectedVersion` / `newVersion`), which is
  what escrows apply. `epoch` is only the client-facing name for the current
  replica version returned by `getRecoverySecret`.
- `register` uses expectedVersion `0` → version `0 → 1`
- updates take the caller-supplied `epoch` (a non-negative integer, else
  `invalid_epoch`) as `expectedVersion`, then `n → n+1`. Escrows reject a
  mismatch.
- Mutation `audiences` is the full configured replica-id list, in that order.
  Each replica should require an exact match to its configured set (a
  cubist-only deploy is `["cubist"]`; adding another escrow means every replica
  is rebuilt with the expanded list).

`resume()` is the same write path without creating a new mutation:
authorizing pending gets a fresh token then replicates; writing pending
retries only escrows that do not already have a stored receipt. Updates
re-run identifier auth (a new key-bound token and PoP) for those escrows on
every attempt, so the identifier provider must be able to authenticate again.

## Cubist store sequence

The controller does not call CubeSigner, the registration API, or
`KeyringController`. A Cubist deploy injects one `CubistEscrowProvider`
(`id` and `authAudience`: `"cubist"`). The caller proves OIDC, calls
`ensure-user`, opens the session, and constructs the provider with the
authenticated `CubeSignerClient` and the pinned wrap and receipt public keys
before `register`.

`CubistEscrowProvider` sends every command with `policyInvoke` on the C2F
(default `cubist_secret_escrow`, version `latest`) as `{ cmd, ...fields }`:
`ping` (`isAvailable`), `generateChallenge`, `getSecret`, and
`applyMutation`. Escrow JSON is parsed from C2F stdout. A policy `Deny` on
`applyMutation` becomes `MutationRejectedError`; any other failure is
`escrow_request_failed` / `escrow_response_invalid`. `verifyReceipt` checks
the mutation id, request hash, escrow id, `version === newVersion`,
`receiptKeyId` (SHA-256 of the pinned receipt key), and the Ed25519 signature
locally.

`register(recoverySecret, identifiers)` takes an identifier **array** of at
least two distinct key-bound identifiers. One `siwe` identifier is rejected.
`applyMutation` is the store: the controller wraps the secret to the escrow
wrap key, and the Cubist C2F persists that payload.

`authenticateIdentifier` asks the injected identifier provider for a key-bound
token. A SIWE provider signs with `KeyringController.signPersonalMessage`.
The controller does not. `getRecoverySecret` then challenges the escrow, signs
the proof of possession locally, calls `getSecret`, and unwraps. `epoch` is
the replica `version`.

```mermaid
sequenceDiagram
  participant Caller as Caller
  participant Auth as RecoveryAuthProvider
  participant IdP as SIWE identifier provider
  participant Ctrl as MfaRecoveryController
  participant Escrow as Cubist escrow

  Note over Caller,Escrow: proveOidcIdentity, ensure-user, createOidcSession, then new CubistEscrowProvider

  Caller->>Ctrl: register(secret, identifiers)
  Ctrl->>Escrow: isAvailable (ping)
  Ctrl->>Auth: getAuthenticatedProfileId
  Ctrl->>Ctrl: persist authorizing
  Ctrl->>Auth: authorizeRecoveryRequest
  Auth-->>Ctrl: AuthController token (Hydra JWT)
  Ctrl->>Ctrl: wrap secret, persist writing
  Ctrl->>Escrow: applyMutation
  Escrow-->>Ctrl: receipt
  Ctrl->>Ctrl: verify receipt, clear pending

  Caller->>Ctrl: authenticateIdentifier(siwe)
  Ctrl->>IdP: getKeyBoundIdentifierToken
  Note over IdP: signPersonalMessage
  IdP-->>Ctrl: token
  Ctrl-->>Caller: identifierSession

  Caller->>Ctrl: getRecoverySecret(identifierSession)
  Ctrl->>Escrow: isAvailable (ping)
  Ctrl->>Escrow: generateChallenge
  Ctrl->>Ctrl: sign proof of possession
  Ctrl->>Escrow: getSecret
  Escrow-->>Ctrl: wrapped secret + version + wrapKeyId
  Ctrl->>Ctrl: check wrapKeyId, unwrap
  Ctrl-->>Caller: secret bytes + epoch
```

## Read sequence (`getRecoverySecret`)

Reads tolerate down replicas. They do **not** repair pending writes. The
selected replica version is returned as `epoch` so a later
`updateRecoverySecret` / `updateIdentifiers` can be formed without a locally
stored version.

```mermaid
sequenceDiagram
  participant C as Client
  participant M as MfaRecoveryController
  participant I as IdentifierAuthProvider
  participant E as Available escrows

  C->>M: authenticateIdentifier(identifier)
  M->>M: generate requestId, proof key, and ephemeral pkE
  M->>M: requestHash = hash(getRecoverySecret, requestId, pkE)
  M->>I: getKeyBoundIdentifierToken
  M-->>C: IdentifierSession
  C->>M: getRecoverySecret(session)
  M->>M: recompute and validate requestHash
  M->>E: isAvailable (failures skipped)
  alt none available
    M-->>C: no_available_escrow
  end
  M->>E: generateChallenge + PoP (partial OK)
  par read
    M->>E: getSecret
    M->>M: check wrapKeyId, unwrap with ephemeral key
  end
  M->>M: selectHighestConsistentVersion
  alt highest versions disagree
    M-->>C: Replica corruption
  else none succeeded
    M-->>C: No escrow returned a recovery secret
  else
    M-->>C: secret bytes + epoch
  end
```

`IdentifierSession` contains the key-bound token, its proof private key, the
`requestId`, and the ephemeral `pkE` key pair needed for the read. The
controller does not persist or store the session; callers must keep it in
memory and must not log it.

A replica whose `wrapKeyId` does not match its configured `wrapPublicKey`, or
whose ciphertext fails to unwrap, counts as a failed read. Among successful
reads, the highest `version` wins; every replica at that version must agree
on `lastMutationId` and the secret bytes.

`getRecoverySecret` runs under the controller lock but does not check pending
state. During `writing`, replicas may hold different versions; the read takes
the highest one. The next mutation still requires `resume()` first.

## Identifier auth (inside writes and reads)

```mermaid
flowchart TD
  Start[identifier + requestHash] --> Mode{trusted type?}
  Mode -->|passkey / oidc / siwe| KB[fresh proof key, IdP key-bound token]
  KB --> Chal[each escrow generateChallenge]
  Chal --> PoP[sign PoP over hash of token + challengeId + requestHash]
  Mode -->|emailOtp / smsOtp| Todo[TODO MFA-605 / MFA-606 / MFA-568]
  Mode -->|anything else| Reject[unknown_identifier_type]
```

On **mutation**, every remaining target escrow must authorize or the write
does not start (`identifier_auth_failed`). On **read**, escrows whose
challenge fails are skipped. `register` sends no identifier authorization
(`null`).

## Crash / repair

```mermaid
flowchart TD
  Crash[crash or partial apply] --> Phase{pending phase?}
  Phase -->|none| Idle[idle]
  Phase -->|authorizing| AbortOrResume{client choice}
  AbortOrResume -->|abort| Idle
  AbortOrResume -->|resume| Auth[re-issue AuthController token]
  Auth --> Write[replicate]
  Phase -->|writing| ResumeOnly[resume only]
  ResumeOnly --> Skip[skip escrows that already have verified receipts]
  Skip --> Refresh[re-issue token only if expired]
  Refresh --> Write
  Write --> All{receipts for every configured escrow?}
  All -->|yes| Clear[clear pending]
  All -->|no| PendingErr[IncompleteMutationError]
```
