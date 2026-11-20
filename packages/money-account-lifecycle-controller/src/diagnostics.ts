import type {
  DerivedIdentityStatus,
  MigrationStepState,
} from '@metamask/chomp-api-service';

import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';

/**
 * How many recorded log entries `MoneyAccountLifecycleDiagnostics.history`
 * keeps; older entries are dropped first.
 */
export const MAX_DIAGNOSTICS_HISTORY_LENGTH = 50;

const MAX_ERROR_MESSAGE_LENGTH = 300;

const HEX_VALUE_PATTERN = /0x[0-9a-f]{40,}/giu;

/**
 * An error reduced to what is useful for debugging. Hex values as long as an
 * address or longer are redacted from the message.
 */
export type MoneyAccountLifecycleErrorSummary = {
  name: string;
  message: string;
  /** The error's `code`, such as a CHOMP or lifecycle error code. */
  code: string | null;
  /** The HTTP status of a failed request. */
  httpStatus: number | null;
  /** The step of a failed `MoneyAccountUpgradeController` upgrade. */
  step: string | null;
};

/**
 * The stages of `startMigration`, in the order they run. A new migration
 * creates its successor, while a resumed one restores it.
 */
export type MoneyAccountMigrationStage =
  | 'checkIdentities'
  | 'createSuccessor'
  | 'restoreSuccessor'
  | 'linkSuccessor'
  | 'moveSubscription'
  | 'registerIntents'
  | 'startFundsTransfer';

export type MoneyAccountUpgradeSkipReason =
  | 'migrationInFlight'
  | 'walletNotReady'
  | 'notUpgradable';

/**
 * Which address a registration status belongs to: the Money Account itself,
 * or the current address of its identity once it is a valid MFA.
 */
export type MoneyAccountRegistrationRole = 'moneyAccount' | 'mfaAccount';

export type MoneyAccountMigrationSummary = {
  steps: MigrationStepState[];
  transferStatus: string | null;
  premiumTransferStatus: string | null;
};

/**
 * Something `MoneyAccountLifecycleController` did. Events never contain
 * addresses or other identifiers, so they are safe to report to error
 * monitoring.
 */
export type MoneyAccountLifecycleLogEvent =
  | {
      type: 'identitiesFetchSucceeding';
      identityCount: number;
      statuses: DerivedIdentityStatus[];
    }
  | {
      type: 'identitiesFetchFailing';
      error: MoneyAccountLifecycleErrorSummary;
    }
  | {
      type: 'lifecycleChanged';
      from: MoneyAccountLifecycle['type'] | null;
      to: MoneyAccountLifecycle['type'];
      identityStatus: DerivedIdentityStatus | null;
      migration: MoneyAccountMigrationSummary | null;
    }
  | {
      type: 'registrationStatusChanged';
      role: MoneyAccountRegistrationRole;
      isRegistered: boolean;
    }
  | {
      type: 'registrationStatusFetchFailed';
      role: MoneyAccountRegistrationRole;
      error: MoneyAccountLifecycleErrorSummary;
    }
  | { type: 'mpcMoneyAccountSetAsDefault' }
  | { type: 'upgradeSkipped'; reason: MoneyAccountUpgradeSkipReason }
  | { type: 'upgradeStarted'; lifecycle: 'sfa' | 'notInIdentity' }
  | { type: 'upgradeSucceeded'; durationMs: number }
  | {
      type: 'upgradeFailed';
      durationMs: number;
      error: MoneyAccountLifecycleErrorSummary;
    }
  | { type: 'migrationStarted' }
  | { type: 'migrationStageStarted'; stage: MoneyAccountMigrationStage }
  | { type: 'fundsTransferRetried'; error: MoneyAccountLifecycleErrorSummary }
  | { type: 'migrationSucceeded'; durationMs: number }
  | {
      type: 'migrationFailed';
      durationMs: number;
      stage: MoneyAccountMigrationStage;
      error: MoneyAccountLifecycleErrorSummary;
    }
  | {
      type: 'stateCleared';
      upgradeWasInFlight: boolean;
      migrationWasInFlight: boolean;
    }
  | {
      type: 'unexpectedError';
      operation: 'sync' | 'lifecycleUpdate';
      error: MoneyAccountLifecycleErrorSummary;
    };

export type MoneyAccountLifecycleLogEntry = MoneyAccountLifecycleLogEvent & {
  timestamp: number;
};

/**
 * Events that can happen whenever a screen asks for an upgrade, so they would
 * crowd everything else out of the history. Their latest outcome is kept in
 * `MoneyAccountLifecycleDiagnostics.upgrade` instead.
 */
const EVENTS_KEPT_OUT_OF_HISTORY = new Set<
  MoneyAccountLifecycleLogEvent['type']
>(['upgradeSkipped', 'upgradeStarted', 'upgradeSucceeded', 'upgradeFailed']);

/**
 * How fetching identities from CHOMP is going. Only changes in how it goes
 * are recorded, so that frequent fetches do not update the state each time.
 */
export type MoneyAccountIdentitiesFetchDiagnostics = {
  /**
   * When fetches started succeeding, or `null` while they fail or before the
   * first fetch.
   */
  succeedingSince: number | null;
  /** How many identities the latest successful fetch returned. */
  identityCount: number | null;
  /**
   * When fetches started failing, or `null` while they succeed or before the
   * first fetch.
   */
  failingSince: number | null;
  /** The latest failure whose error differs from the one before it. */
  lastFailure: {
    at: number;
    error: MoneyAccountLifecycleErrorSummary;
  } | null;
};

export type MoneyAccountUpgradeAttempt = {
  startedAt: number;
  finishedAt: number;
  outcome: 'succeeded' | 'skipped' | 'failed';
  skipReason: MoneyAccountUpgradeSkipReason | null;
  error: MoneyAccountLifecycleErrorSummary | null;
};

export type MoneyAccountMigrationAttempt = {
  startedAt: number;
  finishedAt: number;
  outcome: 'succeeded' | 'failed';
  /** The last stage the migration reached. */
  stage: MoneyAccountMigrationStage;
  error: MoneyAccountLifecycleErrorSummary | null;
};

export type MoneyAccountOperationDiagnostics<Attempt> = {
  lastAttempt: Attempt | null;
  lastFailure: Attempt | null;
  /** Failures since the last success. Skipped attempts do not count. */
  consecutiveFailures: number;
};

/**
 * What `MoneyAccountLifecycleController` did recently, for debugging from
 * state logs.
 */
export type MoneyAccountLifecycleDiagnostics = {
  identitiesFetch: MoneyAccountIdentitiesFetchDiagnostics;
  upgrade: MoneyAccountOperationDiagnostics<MoneyAccountUpgradeAttempt>;
  migration: MoneyAccountOperationDiagnostics<MoneyAccountMigrationAttempt>;
  /**
   * The most recent notable log entries, oldest first, up to
   * {@link MAX_DIAGNOSTICS_HISTORY_LENGTH}.
   */
  history: MoneyAccountLifecycleLogEntry[];
};

export type MoneyAccountOperation = 'upgrade' | 'migration';

export function getDefaultMoneyAccountLifecycleDiagnostics(): MoneyAccountLifecycleDiagnostics {
  const emptyOperation = {
    lastAttempt: null,
    lastFailure: null,
    consecutiveFailures: 0,
  };
  return {
    identitiesFetch: {
      succeedingSince: null,
      identityCount: null,
      failingSince: null,
      lastFailure: null,
    },
    upgrade: { ...emptyOperation },
    migration: { ...emptyOperation },
    history: [],
  };
}

/**
 * Whether a log event is kept in the diagnostics history.
 *
 * @param event - The log event.
 * @returns Whether the event is kept in the history.
 */
export function isKeptInHistory(event: MoneyAccountLifecycleLogEvent): boolean {
  return !EVENTS_KEPT_OUT_OF_HISTORY.has(event.type);
}

/**
 * Reduces an error to what is useful for debugging, without addresses.
 *
 * @param error - The error.
 * @returns The error summary.
 */
export function summarizeError(
  error: unknown,
): MoneyAccountLifecycleErrorSummary {
  if (!(error instanceof Error)) {
    return {
      name: 'Error',
      message: redactMessage(String(error)),
      code: null,
      httpStatus: null,
      step: null,
    };
  }

  const { code, httpStatus, step } = error as {
    code?: unknown;
    httpStatus?: unknown;
    step?: unknown;
  };
  return {
    name: error.name,
    message: redactMessage(error.message),
    code: typeof code === 'string' ? code : null,
    httpStatus: typeof httpStatus === 'number' ? httpStatus : null,
    step: typeof step === 'string' ? step : null,
  };
}

/**
 * Summarises a lifecycle without its addresses.
 *
 * @param previous - The lifecycle recorded before, if any.
 * @param lifecycle - The lifecycle recorded now.
 * @returns The `lifecycleChanged` log event.
 */
export function buildLifecycleChangedEvent(
  previous: MoneyAccountLifecycle | undefined,
  lifecycle: MoneyAccountLifecycle,
): MoneyAccountLifecycleLogEvent {
  const identity =
    lifecycle.type === 'notInIdentity' ? null : lifecycle.identity;
  const migration = identity?.migration ?? null;
  return {
    type: 'lifecycleChanged',
    from: previous?.type ?? null,
    to: lifecycle.type,
    identityStatus: identity?.status ?? null,
    migration: migration && {
      steps: migration.steps.map(({ step, completed }) => ({
        step,
        completed,
      })),
      transferStatus: migration.transfer?.status ?? null,
      premiumTransferStatus: migration.premiumTransfer?.status ?? null,
    },
  };
}

function redactMessage(message: string): string {
  const redacted = message.replace(HEX_VALUE_PATTERN, '0x[redacted]');
  return redacted.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : redacted;
}
