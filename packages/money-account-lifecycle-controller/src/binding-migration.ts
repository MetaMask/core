import {
  bytesToHex,
  getSafeJson,
  isObject,
  stringToBytes,
} from '@metamask/utils';
import type { Hex, Json } from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';

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

export const BINDING_MIGRATION_PHASES: readonly BindingMigrationPhase[] = [
  'afterLink',
  'beforeFundsTransfer',
  'afterDone',
];

export type BindingMigrationContext = {
  /**
   * Derived from the previous and current addresses, so it is the same on
   * every run and every device. It is the same for every migrator, so derive
   * backend idempotency keys from it together with the migrator's id.
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

const BINDING_MIGRATOR_STATUSES: readonly BindingMigratorStatus['status'][] = [
  'not_required',
  'completed',
  'pending',
  'blocked',
  'unknown',
];

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

/**
 * The binding migrations of the Money Account's migration. The migration's
 * id and addresses are recorded alongside the migrators because a status
 * only holds for the migration it was read for, so consumers can tell which
 * migration these statuses describe, and whether they are stale.
 */
export type BindingMigrationsState = {
  migrationId: Hex;
  previousAddress: Hex;
  currentAddress: Hex;
  migrators: {
    [migratorId: string]: BindingMigratorState;
  };
};

export type BindingMigratorState = {
  phase: BindingMigrationPhase;
  status: BindingMigratorStatus['status'];
  details: Json | null;
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

/**
 * The phases whose migrators `startMigration` can still run for a Money
 * Account in the given lifecycle. `afterLink` and `beforeFundsTransfer` have
 * passed once CHOMP has started the funds transfer.
 *
 * @param lifecycle - The lifecycle of the Money Account.
 * @returns The phases that can still run.
 */
export function getRunnableBindingMigrationPhases(
  lifecycle: MoneyAccountLifecycle | undefined,
): BindingMigrationPhase[] {
  const migration =
    lifecycle?.type === 'migrating' ? lifecycle.identity.migration : null;
  if (
    lifecycle?.type === 'mfa' ||
    migration?.transfer ||
    migration?.premiumTransfer
  ) {
    return ['afterDone'];
  }
  return [...BINDING_MIGRATION_PHASES];
}

/**
 * Copies the result a migrator returned, keeping only the fields of a valid
 * result.
 *
 * @param value - What `reconcile` resolved with.
 * @returns The result, or `undefined` when it is not a valid result.
 */
export function sanitizeBindingMigrationResult(
  value: unknown,
): BindingMigrationResult | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { status, reason } = value;
  if (status === 'not_required' || status === 'completed') {
    return { status };
  }
  if (
    (status === 'pending' || status === 'blocked') &&
    typeof reason === 'string'
  ) {
    return { status, reason };
  }
  return undefined;
}

/**
 * Copies the status a migrator returned, keeping only the fields of a valid
 * status and copying its details, so the migrator's own objects are never
 * stored, and frozen, in state.
 *
 * @param value - What `getStatus` returned.
 * @returns The status, or `undefined` when it is not a valid status.
 */
export function sanitizeBindingMigratorStatus(
  value: unknown,
): Pick<BindingMigratorState, 'status' | 'details'> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { status, details } = value;
  if (
    !BINDING_MIGRATOR_STATUSES.includes(
      status as BindingMigratorStatus['status'],
    )
  ) {
    return undefined;
  }
  if (details === undefined) {
    return { status: status as BindingMigratorStatus['status'], details: null };
  }
  try {
    return {
      status: status as BindingMigratorStatus['status'],
      details: getSafeJson(details),
    };
  } catch {
    return undefined;
  }
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
