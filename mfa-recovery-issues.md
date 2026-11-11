# Draft issues: `@metamask/mfa-recovery-controller` follow-ups

Follow-ups from review of [#11149](https://github.com/MetaMask/core/pull/11149). Items 1–3 should block the first release of the package.

---

## 1. Recover from lagging escrow replicas before mutating

**Labels:** `mfa-recovery-controller`, `bug`, `release-blocker`

### Summary

`getRecoverySecret` and `getIdentifiers` return the highest version seen across replicas as `epoch`, even when another replica is still at an older version. A mutation built from that `epoch` is accepted by up-to-date replicas and rejected by the lagging one. Because at least one replica accepted, the rejection isn't unanimous, so the operation stays in the `writing` phase. `resume()` cannot complete it and `abort()` is not allowed in `writing`.

There is currently no mechanism that brings a lagging replica up to the latest version unless the device that started the original mutation still has its pending state.

### Expected

A client is never left in an unrecoverable `writing` state because replicas are at different versions.

### Possible approaches

- Detect version divergence on read and surface it (for example a `replicas_diverged` error or a `consistent: false` flag) instead of returning a single `epoch`.
- Add a repair path that re-applies the latest mutation to lagging replicas.
- Allow `abort()` in `writing` when the remaining replicas rejected with a version mismatch, and treat the accepted replicas as the new baseline.

### Acceptance criteria

- Tests cover a read followed by a mutation while one replica is at an older version.
- No sequence of public calls leaves the controller with a pending operation that it can neither resume nor abort.

---

## 2. Decide the access level for `getIdentifiers`

**Labels:** `mfa-recovery-controller`, `security`, `release-blocker`

### Summary

`getIdentifiers` requires only an AAL1 approval (no recent MFA) and returns the full enrolled identifier set, including types, namespaces and values. This is intentional, so that a new device can build an `updateIdentifiers` call, but it means any authenticated session can list the identifiers that protect recovery.

### Decision needed

- Keep AAL1 and return the full identifiers (current behavior), documented in the threat model.
- Keep AAL1 but return a reduced view (for example type and a masked value), and require AAL2 for full values.
- Require AAL2 for `getIdentifiers`.

### Acceptance criteria

- The chosen access level is documented in `ARCHITECTURE.md`.
- The controller, Cubist escrow function, and tests match the decision.

---

## 3. Make `getIdentifiers` approvals request-bound

**Labels:** `mfa-recovery-controller`, `security`, `release-blocker`

### Summary

`getIdentifiers` requests its approval with a fixed request hash, `hash({ operation: 'getIdentifiers' })`. Every approval for this operation therefore carries the same `request_hash`, and the escrow cannot distinguish one request from another during the token's lifetime. This also differs from the package changelog, which describes approvals as request-bound.

### Proposal

Include a random `requestId` in the hash (as `getRecoverySecret` does), send it to the escrow, and have the escrow verify `request_hash` against it.

### Acceptance criteria

- Each `getIdentifiers` call uses a unique request hash.
- The Cubist escrow function verifies the hash against the request.
- The changelog description of approvals is accurate.

---

## 4. Harden replica consistency checks for reads

**Labels:** `mfa-recovery-controller`, `enhancement`

### Summary

The read paths trust replica responses in ways that are weaker than the write path:

- **Version selection:** the highest version from any single replica is selected. Read responses are not signed, so one misbehaving replica can set `epoch` and the returned data.
- **Consistency check in `getIdentifiers`:** only the identifier list is compared at the same version. `getRecoverySecret` also compares `lastMutationId`, which the `getIdentifiers` response does not include.
- **False corruption errors:** the identifier comparison hashes arrays in order and treats `verifier: null` and a missing `verifier` as different, so equivalent replicas can produce `replica_corruption`.
- **Duplicate logic:** `getIdentifiers` reimplements the highest-consistent-version selection instead of reusing `selectHighestConsistentVersion`.

### Proposal

- Include `lastMutationId` in the `getIdentifiers` response and compare it.
- Normalize identifier lists (sort, normalize `verifier`) before comparing.
- Make `selectHighestConsistentVersion` generic and use it on both read paths.
- Consider signing read responses with the receipt key, or requiring a quorum of replicas to agree on the selected version.

---

## 5. Cleanup: error reporting and validation in `getIdentifiers`

**Labels:** `mfa-recovery-controller`, `enhancement`

- **Unregistered profiles:** when every replica fails, the caller only gets `read_failed`, even if all replicas reported `not_registered`. Pass the shared error code through so a new device can tell "not registered" from "unreachable".
- **Unknown identifier types:** returned identifiers are not checked with `getIdentifierAuthMode`. An unsupported type is returned and then makes the following `updateIdentifiers` call throw. Validate or filter them on read.
- **Locking:** `getIdentifiers` holds the controller lock across the Auth approval and all escrow calls, delaying `resume()` and `abort()`. It is read-only and does not need the lock.
- **Return type:** `RecoveryIdentifiers.authIdentifiers` comes from the approval call rather than a dedicated read, and may be out of date by the time the following `updateIdentifiers` approval is requested. Consider a separate source for Auth's identifiers.
