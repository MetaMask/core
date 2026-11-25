import { bytesToHex, stringToBytes } from '@metamask/utils';
import type { Hex, Json } from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

/**
 * The point in `startMigration` at which a binding migrator runs.
 *
 * - `afterLink`: after the MPC Money Account is linked as the successor.
 * - `beforeFundsTransfer`: before CHOMP is asked to move the funds, after
 * which the migration can no longer be cancelled.
 * - `afterDone`: once the identity is `DONE` and the MPC Money Account of
 * this wallet is its current address.
 */
export type BindingMigrationPhase =
  | 'afterLink'
  | 'beforeFundsTransfer'
  | 'afterDone';

export type BindingMigrationContext = {
  /**
   * Derived from the previous and current addresses, so it is the same on
   * every run and every device. Use it for backend idempotency keys.
   */
  migrationId: Hex;
  /**
   * The SRP Money Account, lowercased.
   */
  previousAddress: Hex;
  /**
   * The MPC successor, lowercased.
   */
  currentAddress: Hex;
  identityStatus: 'MIGRATING' | 'DONE';
};

export type BindingMigrationResult =
  | { status: 'not_required' }
  | { status: 'completed' }
  | { status: 'pending'; reason: string }
  | { status: 'blocked'; reason: string };

/**
 * What a binding migrator knows about its migration from local state alone.
 * `unknown` means it has not found out yet, for example after a reinstall.
 * `details` must not hold secrets such as signatures or signed messages.
 */
export type BindingMigratorStatus = {
  status: BindingMigrationResult['status'] | 'unknown';
  details?: Json;
};

/**
 * Moves one integration bound to the Money Account address, such as a
 * deposit destination, to the successor when the Money Account migrates.
 */
export type BindingMigrator = {
  /**
   * Unique and stable, for example `vba`.
   */
  id: string;
  phase: BindingMigrationPhase;
  /**
   * How long `reconcile` may take before it is treated as `pending`.
   * Defaults to 30 seconds.
   */
  timeoutMs?: number;
  /**
   * Brings the binding to the successor. Must be idempotent: safe to call any
   * number of times, after a crash, and concurrently from another device.
   * A thrown error is treated as `pending`.
   */
  reconcile(context: BindingMigrationContext): Promise<BindingMigrationResult>;
  /**
   * Reads the migrator's own persisted progress, synchronously and without
   * network calls.
   */
  getStatus(context: BindingMigrationContext): BindingMigratorStatus;
};

export type BindingMigrationState = {
  phase: BindingMigrationPhase;
  status: BindingMigratorStatus;
  lastResult: BindingMigrationResult | null;
  lastError: string | null;
};

export type IncompleteBindingMigration = {
  migratorId: string;
  result: Extract<BindingMigrationResult, { status: 'pending' | 'blocked' }>;
};

/**
 * Thrown by `startMigration` when a binding migrator of a phase returns
 * `pending` or `blocked`, or throws. Every migrator of the phase has run.
 */
export class BindingMigrationIncompleteError extends Error {
  readonly phase: BindingMigrationPhase;

  readonly migrations: IncompleteBindingMigration[];

  constructor(
    phase: BindingMigrationPhase,
    migrations: IncompleteBindingMigration[],
  ) {
    super(
      `Binding migrations did not complete in the '${phase}' phase: ${migrations
        .map(
          ({ migratorId, result }) =>
            `${migratorId} (${result.status}: ${result.reason})`,
        )
        .join(', ')}`,
    );
    this.name = 'BindingMigrationIncompleteError';
    this.phase = phase;
    this.migrations = migrations;
  }
}

export function getBindingMigrationId(
  previousAddress: string,
  currentAddress: string,
): Hex {
  return bytesToHex(
    keccak256(
      stringToBytes(
        `${previousAddress.toLowerCase()}:${currentAddress.toLowerCase()}`,
      ),
    ),
  );
}

export function buildBindingMigrationContext(
  previousAddress: string,
  currentAddress: string,
  identityStatus: BindingMigrationContext['identityStatus'],
): BindingMigrationContext {
  return {
    migrationId: getBindingMigrationId(previousAddress, currentAddress),
    previousAddress: previousAddress.toLowerCase() as Hex,
    currentAddress: currentAddress.toLowerCase() as Hex,
    identityStatus,
  };
}
