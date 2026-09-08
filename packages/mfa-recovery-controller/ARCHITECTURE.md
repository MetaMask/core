# `@metamask/mfa-recovery-controller`

Orchestration layer for MFA recovery. The controller never stores the recovery
secret in controller state. It replicates a full copy of that secret to every
configured escrow, and persists only an **encrypted** pending mutation so a
crash can finish the same write.

## Architecture

The controller is a coordinator. Auth, identifier proofs, escrow I/O,
encryption, and OTP collection are all injected.

```mermaid
flowchart LR
  Client["Client / UI"]
  Messenger["Messenger"]
  Ctrl["MfaRecoveryController"]
  Auth["RecoveryAuthProvider"]
  IdP["RecoveryIdentifierAuthProvider"]
  Enc["PendingOperationEncryptor"]
  Collect["collectChallengeResponse"]
  EA["Escrow A"]
  EB["Escrow B"]

  Client --> Messenger
  Messenger --> Ctrl
  Ctrl --> Auth
  Ctrl --> IdP
  Ctrl --> Enc
  Ctrl --> Collect
  Ctrl --> EA
  Ctrl --> EB
```

| Piece                      | Role                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `pendingOperation`         | Only persisted field: encrypted `authorizing` / `writing` blob, or `null` |
| `escrows[]`                | Build-time replica set; mutations require **all** of them                 |
| `authProvider`             | Profile id + request-bound AuthController token                           |
| `identifierAuthProvider`   | Key-bound IdP assertion (passkey / OIDC / SIWE)                           |
| `collectChallengeResponse` | OTP (or similar) for email/SMS identifiers                                |
| `#withLock`                | Serializes public methods so two mutations cannot interleave              |

Identifier types pick the auth mode from a trusted table, not a client flag:
`passkey` / `oidc` / `siwe` → key-bound; `emailOtp` / `smsOtp` → escrow
challenge.

Public surface: `register`, `updateRecoverySecret`, `updateIdentifiers`,
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
  writing --> writing: resume() retries only missing receipts
  authorizing --> writing: resume() authorizes then writes
```

Rules:

- **`abort()`** is allowed only in `authorizing` (no escrow write yet).
- **`writing`** must be finished with `resume()`, not aborted.
- `writing` is persisted before the **first escrow apply** after identifier
  authorization succeeds, so an ambiguous apply failure remains resumable while
  pre-write authorization failures stay abortable.
- Today, a new mutation also calls `#repairPendingMutation` first, then starts
  a **second** mutation if repair succeeds. `resume()` is the dedicated repair
  API.

## Mutation sequence (`register` / updates)

Mutations are all-or-nothing across the configured escrow set. Reads are not.

```mermaid
sequenceDiagram
  participant C as Client
  participant M as MfaRecoveryController
  participant A as AuthProvider
  participant E as Escrows

  C->>M: register / updateRecoverySecret / updateIdentifiers
  M->>M: lock + repair any pending mutation
  M->>A: getAuthenticatedProfileId
  M->>E: require every escrow available
  M->>M: expectedVersion from payload.epoch
  M->>M: persist pending = authorizing
  M->>A: authorizeRecoveryRequest (AuthController token)
  alt not register
    M->>E: identifier auth per escrow
  end
  M->>M: persist writing before apply
  par write every replica
    M->>E: applyMutation
  end
  M->>M: persist receipts
  alt all receipts valid
    M->>M: clear pending → idle
  else some replicas missing
    M-->>C: MutationRepairPendingError (call resume)
  end
```

Versioning:

- `register` uses payload `epoch` `0` → version `0 → 1`
- updates use the caller-supplied payload `epoch` as the current version, then
  `n → n+1`. Escrows reject a mismatch.

`resume()` is the same write path without creating a new mutation: authorizing
pending gets a fresh token then replicates; writing pending retries only
escrows that do not already have a stored receipt.

## Read sequence (`getRecoverySecret`)

Reads tolerate down replicas. They do **not** repair pending writes. The
selected replica version is returned as `epoch` so a later
`updateRecoverySecret` / `updateIdentifiers` can be formed without a locally
stored version.

```mermaid
sequenceDiagram
  participant C as Client
  participant M as MfaRecoveryController
  participant E as Available escrows

  C->>M: getRecoverySecret(identifier)
  M->>E: isAvailable (failures skipped)
  M->>E: authorize identifier (partial OK)
  par read
    M->>E: getSecret
  end
  M->>M: selectHighestConsistentVersion
  alt versions disagree
    M-->>C: Replica corruption
  else none succeeded
    M-->>C: No escrow returned a recovery secret
  else
    M-->>C: secret bytes + epoch
  end
```

If a mutation is stuck in `writing`, replicas can already disagree. A read in
that window can look like corruption; finish with `resume()` first.

## Identifier auth (inside writes and reads)

```mermaid
flowchart TD
  Start[identifier + requestHash] --> Mode{trusted type?}
  Mode -->|passkey / oidc / siwe| KB[IdP key-bound token]
  KB --> Chal[each escrow generateChallenge]
  Chal --> PoP[sign PoP over token + challenge + requestHash]
  Mode -->|emailOtp / smsOtp| Beg[escrow beginIdentifierAuthentication]
  Beg --> OTP[collectChallengeResponse]
  OTP --> Grant[escrow completeIdentifierAuthentication]
```

On **mutation**, every target escrow must authorize or the write does not
start. On **read**, failed authorizations are skipped.

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
  ResumeOnly --> Skip[skip escrows that already have receipts]
  Skip --> Write
  Write --> All{receipts for every configured escrow?}
  All -->|yes| Clear[clear pending]
  All -->|no| PendingErr[MutationRepairPendingError]
```
