# Audit 0004: Controller state-lock and password-sync races

- Status: Finding F-001 fixed; follow-up findings remain open
- Date: 2026-09-10
- Scope: `SeedlessOnboardingController`
- Related: [ADR 0001](./0001-seedless-password-change-recovery.md), [Recovery flow 0002](./0002-password-change-recovery-flow.md), [Option B plan 0003](./0003-controller-owned-password-change-recovery-plan.md)

## Executive summary

The controller has an in-memory controller mutex, but the mutex only protects
the callbacks that acquire it. It does not protect state snapshots taken before
lock acquisition, public methods that do not use the mutex, or operations that
mutate controller state through another lock.

One high-impact race was verified between `resolvePasswordSyncState` and
`changePassword`. `resolvePasswordSyncState` selected its recovery branch from
a phase read taken before it acquired the controller lock. A concurrent
`changePassword` could finish the Seedless-side rewrite and advance the phase to
`LOCAL_KEYRING_PENDING`; the resolver could then use its stale
`SEEDLESS_CHANGE_PENDING` branch, clear the newer phase, and return `in-sync`
while the local Keyring still required reconciliation.

That finding is fixed in the current implementation. A deterministic regression
test reproduces the interleaving and verifies that the resolver returns
`reconcile-keyring` and preserves `LOCAL_KEYRING_PENDING`.

The broader audit remains open. The recommended model is operation-level
serialization around lifecycle-sensitive operations, not a mutex around each
individual `BaseController.update` call.

## Audit question

Can password synchronization, password changes, and other public controller
operations concurrently observe and mutate related state such that the
controller returns a status that no longer describes the state it acted on?

## Relevant implementation model

### Controller and vault locks

`SeedlessOnboardingController` defines separate controller and vault mutexes:

- [`#controllerOperationMutex` and `#vaultOperationMutex`](../src/SeedlessOnboardingController.ts#L425-L427)
- [`#withControllerLock`](../src/SeedlessOnboardingController.ts#L2345-L2349)
- [`#withVaultLock`](../src/SeedlessOnboardingController.ts#L2362-L2366)

The controller mutex serializes callbacks that use `#withControllerLock`. It is
not re-entrant, so internal helpers use explicit `skipLock` options when their
caller already owns the lock.

The vault mutex protects encryption, decryption, and vault writes. It does not
by itself serialize lifecycle state, authentication state, or all controller
state updates.

### State update behavior

`BaseController.update` calculates and installs the next state synchronously,
then publishes state-change events:

- [`BaseController.update`](../../base-controller/src/BaseController.ts#L323-L355)

This prevents a single update from being torn apart. It does not prevent an
asynchronous operation from reading state, awaiting I/O, and later applying a
decision based on that stale read. Therefore, locking individual updates would
not fix the verified race.

## Finding F-001: stale lifecycle branch selection

- Severity: High
- Status: Fixed
- Affected operation: `resolvePasswordSyncState`
- Concurrent operation: `changePassword`
- Failure class: time-of-check/time-of-use race

### Pre-fix behavior

The resolver read `passwordChangePhase`, selected a `switch` branch, and only
then acquired the controller lock for the mutating pending-phase branch. The
branch selection was therefore outside the critical section.

`changePassword` holds the controller lock while it performs the remote change
and local Seedless rewrite:

- [`changePassword`](../src/SeedlessOnboardingController.ts#L977-L1076)
- [`#commitPasswordChangeState`](../src/SeedlessOnboardingController.ts#L2203-L2258)

### Reproduction sequence

1. The controller is unlocked and `changePassword` starts.
2. `changePassword` records `SEEDLESS_CHANGE_PENDING` and waits for the remote
   password-change operation.
3. `resolvePasswordSyncState` reads `SEEDLESS_CHANGE_PENDING` before waiting for
   the controller lock.
4. `changePassword` completes the remote operation and commits the local
   Seedless vault with `LOCAL_KEYRING_PENDING`.
5. `changePassword` releases the controller lock.
6. The resolver acquires the lock but continues through its previously selected
   `SEEDLESS_CHANGE_PENDING` branch.
7. The remote check now observes the new Seedless state. The resolver can clear
   the phase and return `in-sync`.
8. The client skips the required local Keyring reconciliation because the
   lifecycle marker and returned status no longer describe the actual state.

The same stale-decision pattern can occur when the resolver initially observes
an unset phase while a concurrent password change later starts and completes.

### Remediation applied

`resolvePasswordSyncState` now:

1. Acquires the controller lock before reading `passwordChangePhase`.
2. Holds that lock through the remote check and any lifecycle transition.
3. Calls the password-outdated helper with `skipLock: true` because the
   resolver already owns the controller lock.
4. Routes a phase that changed while the resolver was waiting using the latest
   state.

- [Fixed `resolvePasswordSyncState`](../src/SeedlessOnboardingController.ts#L2458-L2517)
- [Regression test](../src/SeedlessOnboardingController.test.ts#L4918-L5004)

### Required invariant

The phase snapshot, remote-state check, returned status, and lifecycle
transition must be one controller-serialized operation. A resolver must never
clear or advance a phase based on a snapshot taken before it acquired the
controller lock.

## Locking decision

### Use operation-level locking

Lifecycle-sensitive operations should acquire the controller lock before their
first state read and hold it across all awaits that affect the decision. This
includes:

- The password-change lifecycle phase.
- The local Seedless vault and authentication key transition.
- The encrypted Keyring encryption key.
- Password-outdated cache updates.
- Authentication and refresh-token state used by the operation.

Internal helpers should not independently acquire the same non-reentrant mutex.
They should be private unlocked helpers, called only from a locked public
operation or from another helper with an explicit ownership contract.

### Do not mutex individual state updates

Adding a mutex around `BaseController.update` would not solve stale snapshots
and would make synchronous state updates difficult to compose with existing
async APIs. It could also create deadlocks when an operation already holds the
controller lock and calls a helper that tries to update state.

The lock should protect the logical transaction, not only the final assignment.

### Preserve lock ordering

Where both locks are needed, use this ordering:

1. Controller lock.
2. Vault lock.
3. State update while both relevant operation invariants are held.

No path should acquire the vault lock and then wait for the controller lock.
Public wrappers and private helpers should make this ordering explicit.

The controller lock also cannot serialize operations performed directly by the
`KeyringController`. A client coordinator, or a future controller-owned
implementation, must cover the cross-controller transaction.

## Follow-up findings

These findings were identified during the audit and are not fixed by F-001.

### F-002: Keyring encryption-key methods bypass the controller lock

- Severity: High
- Status: Open
- Affected methods:
  - [`storeKeyringEncryptionKey`](../src/SeedlessOnboardingController.ts#L1514-L1524)
  - [`loadKeyringEncryptionKey`](../src/SeedlessOnboardingController.ts#L1532-L1535)

`storeKeyringEncryptionKey` awaits vault access and then updates controller
state without the controller mutex. It can therefore write an encrypted key
after a password-change commit, lifecycle clear, or another recovery step has
changed the wrapping key or phase.

`loadKeyringEncryptionKey` is a read, but it is used to make recovery decisions.
It can observe a different combination of vault and encrypted-key state from
the one that existed when its operation started.

Recommended remediation:

- Add locked public wrappers and private unlocked helpers.
- Keep the public calls under the controller-to-vault lock order.
- Ensure key reads and writes used by a lifecycle transition share the same
  operation boundary as the phase transition.

### F-003: Token refresh and refresh-token rotation are not controller-serialized

- Severity: High
- Status: Open
- Affected methods:
  - [`fetchMetadataAccessCreds`](../src/SeedlessOnboardingController.ts#L519-L545)
  - [`refreshAuthTokens`](../src/SeedlessOnboardingController.ts#L2808-L2824)
  - [`rotateRefreshToken`](../src/SeedlessOnboardingController.ts#L2981-L3024)

`refreshAuthTokens` coalesces concurrent refresh requests, but that only
deduplicates refresh calls. It does not serialize refresh state and vault writes
against password changes or recovery. The refresh path re-authenticates, updates
tokens, rewrites the vault, and may rotate refresh tokens.

Recommended remediation:

- Split public locked wrappers from private refresh implementations.
- Ensure internal callers that already hold the controller lock use the private
  implementation rather than recursively acquiring the mutex.
- Serialize token/vault rewrites with password-change commits.
- Preserve one lock ordering for refresh, password change, and recovery.

### F-004: `clearState` can replace state during an in-flight operation

- Severity: High
- Status: Open
- Affected method: [`clearState`](../src/SeedlessOnboardingController.ts#L1447-L1453)

`clearState` replaces the complete controller state without acquiring the
controller mutex. If called while a remote operation or vault rewrite is
awaiting, it can remove lifecycle, authentication, vault, and recovery data.
A later continuation can then write a partial or newly inconsistent state.

Recommended remediation:

- Serialize state clearing with the controller operation mutex.
- Reject or cancel it while a password-change/recovery transaction is active.
- Make the caller explicitly confirm that destructive state reset is intended.

### F-005: Public lock bypasses weaken the lock contract

- Severity: Medium
- Status: Open
- Affected methods:
  - [`authenticate({ skipLock })`](../src/SeedlessOnboardingController.ts#L577-L647)
  - [`verifyVaultPassword({ skipLock })`](../src/SeedlessOnboardingController.ts#L1104-L1119)

These options are useful for internal callers that already own the mutex, but
they are present in public method signatures and messenger action handlers.
External callers can bypass serialization and mutate or inspect state while a
password operation is in flight.

Recommended remediation:

- Move unlocked variants to private helpers.
- Remove lock bypass options from public action signatures where possible.
- If an escape hatch must remain, document and enforce that it is internal-only.

### F-006: Lifecycle advance methods do not validate the transition owner

- Severity: Medium
- Status: Open
- Affected methods:
  - [`clearPasswordChangePhase`](../src/SeedlessOnboardingController.ts#L2399-L2406)
  - [`markPasswordChangeKeySyncPending`](../src/SeedlessOnboardingController.ts#L2417-L2429)

Both methods use the controller lock, but they accept no expected phase,
transaction identifier, or generation. A delayed client call can therefore
clear or overwrite a newer lifecycle transaction after it acquires the lock.

Recommended remediation:

- Add a non-sensitive transaction identifier or monotonically increasing
  lifecycle generation.
- Require the caller to provide the expected current phase/generation.
- Reject transitions that are not valid for the current lifecycle state.

### F-007: Other direct state mutators are outside the operation lock

- Severity: Medium
- Status: Open
- Affected methods:
  - [`setMigrationVersion`](../src/SeedlessOnboardingController.ts#L794-L795)
  - [`updateBackupMetadataState`](../src/SeedlessOnboardingController.ts#L1085-L1093)

These methods are synchronous and do not necessarily lose fields because
`update` derives each patch from the current state. They can nevertheless
change state between awaited steps of a lifecycle operation and are not covered
by a single operation-level invariant.

Recommended remediation:

- Classify each method as lifecycle-sensitive, safe concurrent metadata, or
  initialization-only.
- Lock lifecycle-sensitive methods.
- Keep unrelated metadata operations out of password-change critical sections
  only if their invariants are explicitly independent.

### F-008: In-memory phase updates are not proof of durable persistence

- Severity: High for crash recovery
- Status: Open

`#writePasswordChangePhase` calls `update`, which synchronously changes
in-memory state and publishes state-change events:

- [`#writePasswordChangePhase`](../src/SeedlessOnboardingController.ts#L2381-L2387)

The public lifecycle methods await the in-memory operation, but do not expose an
explicit acknowledgement that the downstream persisted state has been durably
written. A crash after an in-memory transition can leave durable state behind
the actual remote or local cryptographic state.

Recommended remediation:

- Provide an awaitable durable persistence boundary for lifecycle transitions.
- Do not clear the phase until key synchronization and required local writes
  have been durably confirmed.
- Treat the persisted phase as a recovery trigger, never as proof of completion.

## Test plan

The controller should add deterministic concurrency tests for each operation
that crosses an `await` and later updates state.

Required scenarios:

- `resolvePasswordSyncState` waits behind `changePassword` and observes
  `LOCAL_KEYRING_PENDING`.
- `resolvePasswordSyncState` waits behind a phase transition and never clears a
  newer phase.
- `storeKeyringEncryptionKey` overlaps with a password-change state commit.
- Token refresh overlaps with password-change vault rewriting.
- `clearState` is rejected or serialized while recovery is active.
- Delayed `clearPasswordChangePhase` and
  `markPasswordChangeKeySyncPending` cannot modify a newer transaction.
- Every failure path releases the controller and vault locks.
- Lifecycle state remains recoverable after an interrupted durable write.

The F-001 regression test currently passes with:

```sh
yarn workspace @metamask/seedless-onboarding-controller run test --no-coverage --runInBand
yarn workspace @metamask/seedless-onboarding-controller run build
```

## Acceptance criteria

The state-lock design is complete when:

- Every lifecycle-sensitive public operation reads state only after acquiring
  the shared operation lock.
- Every lifecycle transition is validated against the current transaction or
  generation.
- Controller and vault lock ordering is documented and enforced.
- Public lock bypasses are removed or made internal-only.
- Token refresh and vault rewrites cannot interleave with password changes.
- Durable lifecycle writes have an awaitable completion signal.
- Cross-controller Keyring operations are covered by a coordinator lock.
- Concurrency and process-interruption tests verify the final state, returned
  status, and recoverability rather than only individual method results.
