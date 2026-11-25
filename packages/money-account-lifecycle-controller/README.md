# `@metamask/money-account-lifecycle-controller`

Manages the money account’s life cycle

## Installation

`yarn add @metamask/money-account-lifecycle-controller`

or

`npm install @metamask/money-account-lifecycle-controller`

## Binding migrators

Turning on MFA moves the Money Account from the SFA (SRP-derived) address to a new MPC address. The old address is linked to the new address in CHOMP, which sweeps funds from it for a retention window (90 days).

Other integrations are bound to the Money Account address, and that binding is not changed by CHOMP: for example, the VBA deposit destination address, the card allowance, and the rewards destination address. Each integration registers a binding migrator with `MoneyAccountLifecycleController` at runtime, so the controller does not know about each binding. The controller provides the migration context and the phase ordering; each migrator owns its own logic, persists its own state, and guarantees idempotency.

### Registering a migrator

```ts
messenger.call('MoneyAccountLifecycleController:registerBindingMigrator', {
  id: 'vba',
  phase: 'afterDone',
  timeoutMs: 30_000,
  reconcile: async (context) => {
    // Move the binding to `context.currentAddress`.
    return { status: 'completed' };
  },
  getStatus: (context) => ({ status: 'completed' }),
});
```

- `id` is unique and stable, for example `vba`. Registering a second migrator with the same `id` throws.
- `timeoutMs` is optional and defaults to 30 seconds.
- `reconcile` returns one of:
  - `{ status: 'not_required' }`
  - `{ status: 'completed' }`
  - `{ status: 'pending'; reason: string }`: retryable.
  - `{ status: 'blocked'; reason: string }`: terminal, needs investigation.
- `getStatus` returns `{ status, details? }`, where `status` is one of the `reconcile` statuses or `unknown` (the migrator has no local record yet, for example after a reinstall), and `details` is any JSON the migrator wants to expose.

### Phases

`startMigration` runs each phase's migrators at its step boundary:

| Phase                 | When it runs                                                                            |
| --------------------- | --------------------------------------------------------------------------------------- |
| `afterLink`           | After the MPC address is linked as the successor (`upgradeSuccessorAccount`).           |
| `beforeFundsTransfer` | Before CHOMP is asked to move the funds (`startFundsTransfer`).                         |
| `afterDone`           | Once the identity is `DONE` and this wallet's MPC Money Account is its current address. |

- Within a phase, migrators run in the order they were registered. A migrator registered after its phase has passed is not run; owners must roll out their work accordingly.
- Every migrator of a phase runs. If any returns `pending` or `blocked`, `startMigration` then stops before the next step and throws a `BindingMigrationIncompleteError` naming those migrators.
- A migrator that throws, or takes longer than its `timeoutMs`, is treated as `pending` and reported. A `blocked` result is reported too.
- When `afterDone` migrators are registered, `startMigration` waits up to a minute for CHOMP to finish moving the funds, then runs them. If the funds have not moved by then, calling `startMigration` again once the migration has finished runs them.

### Context

`reconcile` and `getStatus` receive:

- `migrationId`: deterministic, derived from the previous and current addresses (lowercased).
- `previousAddress`: the SRP Money Account.
- `currentAddress`: the MPC successor.
- `identityStatus`: `MIGRATING` in `afterLink` and `beforeFundsTransfer`, `DONE` in `afterDone`.

### Idempotency rules

Every migrator must follow these rules:

- `reconcile` must be safe to call any number of times. That includes after a crash at any point, after a reinstall, and concurrently from another device.
- Whether a migration is needed must come from the authoritative source (backend or chain).
- A migrator must never create a duplicate binding. For example, it must not create a second AutoRamp.
- Every backend write uses an idempotency key derived from `migrationId`.
- If a submission's outcome is unknown, the migrator queries its status before signing or submitting again.
- Once completed, it stays completed. Later calls return quickly without side effects.
- A context the migrator doesn't apply to returns `not_required`; it doesn't throw. A thrown error is treated as `pending` and reported.
- Any signature a migrator needs must not trigger an extra 2FA prompt. For example, it must be covered by `@metamask/money-account-mfa-whitelist`, because calls can happen unattended.
- The migrator owns its kill switch. While disabled it returns `not_required` and keeps any pending work in its own state. Turning the flag back on resumes the work on the next `startMigration` without creating a duplicate.
- The migrator owns and persists its own progress. `getStatus` reads that state synchronously, makes no network calls, and must not return secrets (no signatures or signed messages).
- A migrator should return `not_required` from `getStatus` and `reconcile` if `currentAddress` in the context matches the current address used by that workload (for example, if a feature was added after an earlier migration run, so no migration was ever needed).

### State and clients

While the Money Account is migrating or migrated, `bindingMigrations` in the controller state records each migrator's phase, last result, last error, and `getStatus` output. It is not persisted: it is refreshed from `getStatus` when a migrator registers and after each identity fetch, and cleared on lock and by `clearState`.

The controller does not run migrators by itself. Clients call `startMigration` again when `moneyAccountLifecycleControllerSelectors.selectHasUnfinishedBindingMigrations` is true. A call made while a migration is in flight joins it and gets its outcome.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
