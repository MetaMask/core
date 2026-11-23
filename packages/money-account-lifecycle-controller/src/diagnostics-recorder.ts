import type { DerivedIdentity } from '@metamask/chomp-api-service';
import deepEqual from 'fast-deep-equal';

import {
  MAX_DIAGNOSTICS_HISTORY_LENGTH,
  buildLifecycleChangedEvent,
  isKeptInHistory,
  summarizeError,
} from './diagnostics.js';
import type {
  MoneyAccountLifecycleDiagnostics,
  MoneyAccountLifecycleErrorSummary,
  MoneyAccountLifecycleLogEntry,
  MoneyAccountLifecycleLogEvent,
  MoneyAccountMigrationStage,
  MoneyAccountOperation,
  MoneyAccountOperationDiagnostics,
  MoneyAccountRegistrationRole,
  MoneyAccountUpgradeSkipReason,
} from './diagnostics.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import { createModuleLogger, projectLogger } from './logger.js';

const log = createModuleLogger(
  projectLogger,
  'MoneyAccountLifecycleController',
);

/**
 * Records the diagnostics of a single `upgradeMoneyAccount` call, timed from
 * when it was tracked.
 */
export type UpgradeDiagnostics = {
  skipped: (reason: MoneyAccountUpgradeSkipReason) => void;
  started: (lifecycle: 'sfa' | 'notInIdentity') => void;
  succeeded: () => void;
  failed: (error: unknown) => void;
};

type OperationAttempt<Operation extends MoneyAccountOperation> = Omit<
  NonNullable<MoneyAccountLifecycleDiagnostics[Operation]['lastAttempt']>,
  'startedAt' | 'finishedAt'
>;

/**
 * Records what `MoneyAccountLifecycleController` does in its diagnostics and
 * passes each log entry to the `log` hook.
 *
 * Every entry and attempt belongs to the generation that was current when the
 * work started, and nothing is recorded once `clearState` has moved on from it.
 */
export class DiagnosticsRecorder {
  readonly #getDiagnostics: () => MoneyAccountLifecycleDiagnostics;

  readonly #updateDiagnostics: (
    recipe: (diagnostics: MoneyAccountLifecycleDiagnostics) => void,
  ) => void;

  readonly #getGeneration: () => number;

  readonly #logHook?: (entry: MoneyAccountLifecycleLogEntry) => void;

  readonly #reportError: (error: unknown) => void;

  readonly #registrationStatusFailures = new Map<
    MoneyAccountRegistrationRole,
    MoneyAccountLifecycleErrorSummary
  >();

  #migration: {
    generation: number;
    startedAt: number;
    stage: MoneyAccountMigrationStage;
  } = { generation: 0, startedAt: 0, stage: 'checkIdentities' };

  constructor({
    getDiagnostics,
    updateDiagnostics,
    getGeneration,
    logHook,
    reportError,
  }: {
    getDiagnostics: () => MoneyAccountLifecycleDiagnostics;
    updateDiagnostics: (
      recipe: (diagnostics: MoneyAccountLifecycleDiagnostics) => void,
    ) => void;
    getGeneration: () => number;
    logHook?: (entry: MoneyAccountLifecycleLogEntry) => void;
    reportError: (error: unknown) => void;
  }) {
    this.#getDiagnostics = getDiagnostics;
    this.#updateDiagnostics = updateDiagnostics;
    this.#getGeneration = getGeneration;
    this.#logHook = logHook;
    this.#reportError = reportError;
  }

  identitiesFetchSucceeded(identities: DerivedIdentity[]): void {
    const { succeedingSince, identityCount } =
      this.#getDiagnostics().identitiesFetch;
    if (succeedingSince !== null && identityCount === identities.length) {
      return;
    }

    this.#updateDiagnostics(({ identitiesFetch }) => {
      identitiesFetch.succeedingSince ??= Date.now();
      identitiesFetch.failingSince = null;
      identitiesFetch.identityCount = identities.length;
    });
    this.#log({
      type: 'identitiesFetchSucceeding',
      identityCount: identities.length,
      statuses: identities.map(({ status }) => status),
    });
  }

  identitiesFetchFailed(error: unknown): void {
    const summary = summarizeError(error);
    const { failingSince, lastFailure } =
      this.#getDiagnostics().identitiesFetch;
    if (failingSince !== null && deepEqual(lastFailure?.error, summary)) {
      return;
    }

    this.#updateDiagnostics(({ identitiesFetch }) => {
      const now = Date.now();
      identitiesFetch.failingSince ??= now;
      identitiesFetch.succeedingSince = null;
      identitiesFetch.lastFailure = { at: now, error: summary };
    });
    this.#log({ type: 'identitiesFetchFailing', error: summary });
  }

  lifecycleChanged(
    previous: MoneyAccountLifecycle | undefined,
    lifecycle: MoneyAccountLifecycle,
  ): void {
    this.#log(buildLifecycleChangedEvent(previous, lifecycle));
  }

  mpcMoneyAccountSetAsDefault(): void {
    this.#log({ type: 'mpcMoneyAccountSetAsDefault' });
  }

  registrationStatusFetched(role: MoneyAccountRegistrationRole): void {
    this.#registrationStatusFailures.delete(role);
  }

  registrationStatusChanged(
    role: MoneyAccountRegistrationRole,
    isRegistered: boolean,
  ): void {
    this.#log({ type: 'registrationStatusChanged', role, isRegistered });
  }

  registrationStatusFetchFailed(
    role: MoneyAccountRegistrationRole,
    error: unknown,
  ): void {
    const summary = summarizeError(error);
    if (deepEqual(this.#registrationStatusFailures.get(role), summary)) {
      return;
    }
    this.#registrationStatusFailures.set(role, summary);
    this.#log({ type: 'registrationStatusFetchFailed', role, error: summary });
  }

  trackUpgrade(): UpgradeDiagnostics {
    const generation = this.#getGeneration();
    const startedAt = Date.now();
    const finish = (attempt: OperationAttempt<'upgrade'>): void =>
      this.#recordAttempt('upgrade', generation, startedAt, attempt);

    return {
      skipped: (reason) => {
        if (generation !== this.#getGeneration()) {
          return;
        }
        this.#log({ type: 'upgradeSkipped', reason });
        finish({ outcome: 'skipped', skipReason: reason, error: null });
      },
      started: (lifecycle) => {
        this.#log({ type: 'upgradeStarted', lifecycle }, generation);
      },
      succeeded: () => {
        this.#log(
          { type: 'upgradeSucceeded', durationMs: Date.now() - startedAt },
          generation,
        );
        finish({ outcome: 'succeeded', skipReason: null, error: null });
      },
      failed: (error) => {
        const summary = summarizeError(error);
        this.#log(
          {
            type: 'upgradeFailed',
            durationMs: Date.now() - startedAt,
            error: summary,
          },
          generation,
        );
        finish({ outcome: 'failed', skipReason: null, error: summary });
      },
    };
  }

  migrationStarted(): void {
    this.#migration = {
      generation: this.#getGeneration(),
      startedAt: Date.now(),
      stage: 'checkIdentities',
    };
    this.#log({ type: 'migrationStarted' });
  }

  migrationStageStarted(stage: MoneyAccountMigrationStage): void {
    this.#migration.stage = stage;
    this.#log(
      { type: 'migrationStageStarted', stage },
      this.#migration.generation,
    );
  }

  fundsTransferRetried(error: unknown): void {
    this.#log(
      { type: 'fundsTransferRetried', error: summarizeError(error) },
      this.#migration.generation,
    );
  }

  migrationSucceeded(): void {
    const { generation, startedAt, stage } = this.#migration;
    this.#log(
      { type: 'migrationSucceeded', durationMs: Date.now() - startedAt },
      generation,
    );
    this.#recordAttempt('migration', generation, startedAt, {
      outcome: 'succeeded',
      stage,
      error: null,
    });
  }

  migrationFailed(error: unknown): void {
    const { generation, startedAt, stage } = this.#migration;
    const summary = summarizeError(error);
    this.#log(
      {
        type: 'migrationFailed',
        durationMs: Date.now() - startedAt,
        stage,
        error: summary,
      },
      generation,
    );
    this.#recordAttempt('migration', generation, startedAt, {
      outcome: 'failed',
      stage,
      error: summary,
    });
  }

  stateCleared({
    upgradeWasInFlight,
    migrationWasInFlight,
  }: {
    upgradeWasInFlight: boolean;
    migrationWasInFlight: boolean;
  }): void {
    this.#registrationStatusFailures.clear();
    this.#log({
      type: 'stateCleared',
      upgradeWasInFlight,
      migrationWasInFlight,
    });
  }

  unexpectedError(operation: 'sync' | 'lifecycleUpdate', error: unknown): void {
    this.#log({
      type: 'unexpectedError',
      operation,
      error: summarizeError(error),
    });
  }

  #log(
    event: MoneyAccountLifecycleLogEvent,
    generation: number = this.#getGeneration(),
  ): void {
    const entry: MoneyAccountLifecycleLogEntry = {
      ...event,
      timestamp: Date.now(),
    };
    log(entry.type, entry);
    try {
      this.#logHook?.(entry);
    } catch (error) {
      this.#reportError(error);
    }

    if (generation !== this.#getGeneration() || !isKeptInHistory(event)) {
      return;
    }
    this.#updateDiagnostics(({ history }) => {
      history.push(entry);
      if (history.length > MAX_DIAGNOSTICS_HISTORY_LENGTH) {
        history.splice(0, history.length - MAX_DIAGNOSTICS_HISTORY_LENGTH);
      }
    });
  }

  #recordAttempt<Operation extends MoneyAccountOperation>(
    operation: Operation,
    generation: number,
    startedAt: number,
    attempt: OperationAttempt<Operation>,
  ): void {
    if (generation !== this.#getGeneration()) {
      return;
    }
    const record = { ...attempt, startedAt, finishedAt: Date.now() };
    this.#updateDiagnostics((diagnostics) => {
      const operationDiagnostics: MoneyAccountOperationDiagnostics<unknown> =
        diagnostics[operation];
      operationDiagnostics.lastAttempt = record;
      if (record.outcome === 'failed') {
        operationDiagnostics.lastFailure = record;
        operationDiagnostics.consecutiveFailures += 1;
      } else if (record.outcome === 'succeeded') {
        operationDiagnostics.consecutiveFailures = 0;
      }
    });
  }
}
