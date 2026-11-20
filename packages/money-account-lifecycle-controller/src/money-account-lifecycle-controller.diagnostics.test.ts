import { ChompApiError } from '@metamask/chomp-api-service';
import type { DerivedIdentity } from '@metamask/chomp-api-service';
import { createDeferredPromise } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { afterEach, describe, it, expect, vi } from 'vitest';

import {
  MFA_ACCOUNT_ADDRESS,
  MFA_IDENTITY,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
  SFA_IDENTITY,
  SUCCESSOR_ADDRESS,
  buildLinkedIdentityResponse,
  flushPromises,
  getLoggedTypes,
  withController,
} from '../tests/helpers.js';
import { MAX_DIAGNOSTICS_HISTORY_LENGTH } from './diagnostics.js';
import type { MoneyAccountLifecycleLogEntry } from './diagnostics.js';
import {
  MoneyAccountLifecycleError,
  MoneyAccountLifecycleErrorCode,
} from './errors.js';
import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

const ADDRESSES = [
  MONEY_ACCOUNT_ADDRESS,
  SUCCESSOR_ADDRESS,
  MFA_ACCOUNT_ADDRESS,
];

const RESUMABLE_IDENTITY: DerivedIdentity = {
  ...MIGRATING_IDENTITY,
  migration: {
    ...MIGRATING_IDENTITY.migration,
    to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
  },
};

function getHistoryTypes(
  controller: MoneyAccountLifecycleController,
): string[] {
  return controller.state.diagnostics.history.map(({ type }) => type);
}

function getLoggedEntries(log: {
  mock: { calls: [MoneyAccountLifecycleLogEntry][] };
}): MoneyAccountLifecycleLogEntry[] {
  return log.mock.calls.map(([entry]) => entry);
}

describe('MoneyAccountLifecycleController diagnostics', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('identities fetch', () => {
    it('records and logs when fetches start succeeding', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();

        expect(controller.state.diagnostics.identitiesFetch).toStrictEqual({
          succeedingSince: expect.any(Number),
          identityCount: 1,
          failingSince: null,
          lastFailure: null,
        });
        expect(mocks.log).toHaveBeenCalledWith({
          type: 'identitiesFetchSucceeding',
          identityCount: 1,
          statuses: ['DONE'],
          timestamp: expect.any(Number),
        });
      });
    });

    it('does not update the state or log again while fetches keep succeeding with the same identity count', async () => {
      await withController(async ({ rootMessenger, mocks, init, refetch }) => {
        await init();
        const stateChange = vi.fn();
        rootMessenger.subscribe(
          'MoneyAccountLifecycleController:stateChanged',
          stateChange,
        );
        mocks.log.mockClear();

        await refetch();
        await refetch();

        expect(stateChange).not.toHaveBeenCalled();
        expect(mocks.log).not.toHaveBeenCalled();
      });
    });

    it('records a change of identity count while fetches keep succeeding', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();
        const { succeedingSince } =
          controller.state.diagnostics.identitiesFetch;
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [SFA_IDENTITY, MFA_IDENTITY],
        });

        await refetch();

        expect(controller.state.diagnostics.identitiesFetch).toMatchObject({
          succeedingSince,
          identityCount: 2,
        });
        expect(getHistoryTypes(controller)).toContain(
          'identitiesFetchSucceeding',
        );
      });
    });

    it('records when fetches start failing, and again only when the error changes', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        const unavailable = new ChompApiError(503, 'Unavailable', 'DOWN');
        mocks.getDerivedIdentities
          .mockRejectedValueOnce(unavailable)
          .mockRejectedValueOnce(unavailable)
          .mockRejectedValueOnce(new Error('Network request failed'));

        await init();
        const { failingSince } = controller.state.diagnostics.identitiesFetch;
        await refetch();

        expect(controller.state.diagnostics.identitiesFetch).toStrictEqual({
          succeedingSince: null,
          identityCount: null,
          failingSince: expect.any(Number),
          lastFailure: {
            at: expect.any(Number),
            error: {
              name: 'ChompApiError',
              message: 'Unavailable',
              code: 'DOWN',
              httpStatus: 503,
              step: null,
            },
          },
        });

        await refetch();

        expect(controller.state.diagnostics.identitiesFetch).toMatchObject({
          failingSince,
          lastFailure: { error: { message: 'Network request failed' } },
        });
        expect(getLoggedTypes(mocks.log)).toStrictEqual([
          'identitiesFetchFailing',
          'identitiesFetchFailing',
        ]);
        expect(mocks.captureException).toHaveBeenCalledTimes(3);
      });
    });

    it('keeps the last failure once fetches succeed again', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        mocks.getDerivedIdentities.mockRejectedValueOnce(new Error('Down'));
        await init();

        await refetch();

        expect(controller.state.diagnostics.identitiesFetch).toStrictEqual({
          succeedingSince: expect.any(Number),
          identityCount: 1,
          failingSince: null,
          lastFailure: {
            at: expect.any(Number),
            error: expect.objectContaining({ message: 'Down' }),
          },
        });
        expect(getHistoryTypes(controller).slice(0, 2)).toStrictEqual([
          'identitiesFetchFailing',
          'identitiesFetchSucceeding',
        ]);
      });
    });

    it('logs the fetch outcome before the lifecycle change it causes', async () => {
      await withController(async ({ mocks, init }) => {
        await init();

        expect(getLoggedTypes(mocks.log)).toStrictEqual([
          'identitiesFetchSucceeding',
          'lifecycleChanged',
          'registrationStatusChanged',
        ]);
      });
    });

    it('does not log or record a fetch superseded by another', async () => {
      await withController(async ({ controller, mocks, refetch }) => {
        const first = createDeferredPromise<{
          identities: DerivedIdentity[];
        }>();
        mocks.getDerivedIdentities
          .mockReturnValueOnce(first.promise)
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] });

        controller.init();
        await refetch();
        first.reject(new Error('Superseded'));
        await flushPromises();

        expect(getLoggedTypes(mocks.log)).not.toContain(
          'identitiesFetchFailing',
        );
        expect(
          controller.state.diagnostics.identitiesFetch.failingSince,
        ).toBeNull();
      });
    });
  });

  describe('lifecycle', () => {
    it('records each change of lifecycle in the history', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await refetch();
        await refetch();

        expect(
          controller.state.diagnostics.history.filter(
            ({ type }) => type === 'lifecycleChanged',
          ),
        ).toStrictEqual([
          {
            type: 'lifecycleChanged',
            from: null,
            to: 'sfa',
            identityStatus: 'DONE',
            migration: null,
            timestamp: expect.any(Number),
          },
          {
            type: 'lifecycleChanged',
            from: 'sfa',
            to: 'migrating',
            identityStatus: 'MIGRATING',
            migration: {
              steps: MIGRATING_IDENTITY.migration.steps,
              transferStatus: null,
              premiumTransferStatus: null,
            },
            timestamp: expect.any(Number),
          },
        ]);
      });
    });

    it('records making the MPC Money Account the default', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(getHistoryTypes(controller)).toContain(
            'mpcMoneyAccountSetAsDefault',
          );
        },
      );
    });

    it('records an error thrown while recording the lifecycle', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getMoneyAccount.mockImplementation(() => {
          throw new Error('Money account unavailable');
        });

        await init();

        expect(controller.state.diagnostics.history.slice(1)).toStrictEqual([
          {
            type: 'unexpectedError',
            operation: 'lifecycleUpdate',
            error: expect.objectContaining({
              message: 'Money account unavailable',
            }),
            timestamp: expect.any(Number),
          },
        ]);
      });
    });

    it('records an error thrown while checking whether to fetch', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.isEnabled.mockImplementation(() => {
          throw new Error('isEnabled failed');
        });

        controller.init();

        expect(controller.state.diagnostics.history).toStrictEqual([
          expect.objectContaining({
            type: 'unexpectedError',
            operation: 'sync',
          }),
        ]);
      });
    });
  });

  describe('registration status', () => {
    it('records a registration status only when it changes', async () => {
      await withController(
        async ({ controller, rootMessenger, mocks, init, refetch }) => {
          const stateChange = vi.fn();
          await init();
          rootMessenger.subscribe(
            'MoneyAccountLifecycleController:stateChanged',
            stateChange,
            (state) => state.addressRegistrations,
          );

          await refetch();

          expect(stateChange).not.toHaveBeenCalled();

          mocks.getRegistrationStatus.mockResolvedValue({
            isRegistered: false,
          });
          await refetch();

          expect(
            controller.state.diagnostics.history.filter(
              ({ type }) => type === 'registrationStatusChanged',
            ),
          ).toStrictEqual([
            {
              type: 'registrationStatusChanged',
              role: 'moneyAccount',
              isRegistered: true,
              timestamp: expect.any(Number),
            },
            {
              type: 'registrationStatusChanged',
              role: 'moneyAccount',
              isRegistered: false,
              timestamp: expect.any(Number),
            },
          ]);
        },
      );
    });

    it('logs the role of the address whose registration status changes', async () => {
      await withController(async ({ mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });

        await init();

        expect(mocks.log).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'registrationStatusChanged',
            role: 'mfaAccount',
          }),
        );
      });
    });

    it('records a failed registration status fetch, and again only when the error changes', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        const error = new Error('Lookup failed');
        mocks.getRegistrationStatus
          .mockRejectedValueOnce(error)
          .mockRejectedValueOnce(error)
          .mockRejectedValueOnce(new Error('Timed out'));

        await init();
        await refetch();
        await refetch();

        expect(
          controller.state.diagnostics.history.filter(
            ({ type }) => type === 'registrationStatusFetchFailed',
          ),
        ).toStrictEqual([
          {
            type: 'registrationStatusFetchFailed',
            role: 'moneyAccount',
            error: expect.objectContaining({ message: 'Lookup failed' }),
            timestamp: expect.any(Number),
          },
          {
            type: 'registrationStatusFetchFailed',
            role: 'moneyAccount',
            error: expect.objectContaining({ message: 'Timed out' }),
            timestamp: expect.any(Number),
          },
        ]);
        expect(mocks.captureException).toHaveBeenCalledTimes(3);
      });
    });

    it('records a repeated registration status failure again once a lookup has succeeded', async () => {
      await withController(async ({ mocks, init, refetch }) => {
        const error = new Error('Lookup failed');
        mocks.getRegistrationStatus
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce({ isRegistered: true })
          .mockRejectedValueOnce(error);

        await init();
        await refetch();
        await refetch();

        expect(
          getLoggedTypes(mocks.log).filter(
            (type) => type === 'registrationStatusFetchFailed',
          ),
        ).toHaveLength(2);
      });
    });

    it('does not log or record a failed lookup superseded by another, but still reports it', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        const first = createDeferredPromise<{ isRegistered: boolean }>();
        mocks.getRegistrationStatus
          .mockReturnValueOnce(first.promise)
          .mockResolvedValueOnce({ isRegistered: true });

        await init();
        await refetch();
        first.reject(new Error('Superseded'));
        await flushPromises();

        expect(getLoggedTypes(mocks.log)).not.toContain(
          'registrationStatusFetchFailed',
        );
        expect(getHistoryTypes(controller)).not.toContain(
          'registrationStatusFetchFailed',
        );
        expect(mocks.captureException).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Superseded' }),
        );
      });
    });

    it('records nothing for a lookup that fails after clearState, and records the next failure with the same error', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        const error = new Error('Lookup failed');
        const first = createDeferredPromise<{ isRegistered: boolean }>();
        mocks.getRegistrationStatus.mockReturnValueOnce(first.promise);

        await init();
        controller.clearState();
        first.reject(error);
        await flushPromises();

        expect(getHistoryTypes(controller)).toStrictEqual(['stateCleared']);

        mocks.getRegistrationStatus.mockRejectedValueOnce(error);
        await refetch();

        expect(getHistoryTypes(controller)).toContain(
          'registrationStatusFetchFailed',
        );
      });
    });
  });

  describe('upgradeMoneyAccount', () => {
    it('logs and records a successful upgrade', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        mocks.log.mockClear();

        await controller.upgradeMoneyAccount();

        expect(getLoggedTypes(mocks.log).slice(0, 2)).toStrictEqual([
          'upgradeStarted',
          'upgradeSucceeded',
        ]);
        expect(mocks.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'upgradeStarted', lifecycle: 'sfa' }),
        );
        expect(controller.state.diagnostics.upgrade).toStrictEqual({
          lastAttempt: {
            startedAt: expect.any(Number),
            finishedAt: expect.any(Number),
            outcome: 'succeeded',
            skipReason: null,
            error: null,
          },
          lastFailure: null,
          consecutiveFailures: 0,
        });
      });
    });

    it('records a failed upgrade with the failing step', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        const error = Object.assign(new Error('Signing failed'), {
          name: 'MoneyAccountUpgradeStepError',
          step: 'sign-delegation',
        });
        mocks.upgradeAccount.mockRejectedValue(error);

        await expect(controller.upgradeMoneyAccount()).rejects.toThrow(error);
        await expect(controller.upgradeMoneyAccount()).rejects.toThrow(error);

        const failure = {
          startedAt: expect.any(Number),
          finishedAt: expect.any(Number),
          outcome: 'failed',
          skipReason: null,
          error: {
            name: 'MoneyAccountUpgradeStepError',
            message: 'Signing failed',
            code: null,
            httpStatus: null,
            step: 'sign-delegation',
          },
        };
        expect(controller.state.diagnostics.upgrade).toStrictEqual({
          lastAttempt: failure,
          lastFailure: failure,
          consecutiveFailures: 2,
        });
        expect(getHistoryTypes(controller)).not.toContain('upgradeFailed');
      });
    });

    it('records a failed upgrade when the identities cannot be fetched first', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockRejectedValue(new Error('CHOMP down'));

        await expect(controller.upgradeMoneyAccount()).rejects.toThrow(
          'CHOMP down',
        );

        expect(controller.state.diagnostics.upgrade.lastFailure).toMatchObject({
          outcome: 'failed',
          error: { message: 'CHOMP down' },
        });
        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('records a failed upgrade when there is no money account', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller }) => {
          const upgrade = controller.upgradeMoneyAccount();

          await expect(upgrade).rejects.toThrow('No Money Account to upgrade');
          await expect(upgrade).rejects.toMatchObject({
            code: MoneyAccountLifecycleErrorCode.NoMoneyAccount,
          });
          expect(
            controller.state.diagnostics.upgrade.lastFailure?.error?.code,
          ).toBe('NO_MONEY_ACCOUNT');
        },
      );
    });

    it('records an upgrade skipped because the money account is not upgradable', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        await init();

        await controller.upgradeMoneyAccount();

        expect(mocks.log).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'upgradeSkipped',
            reason: 'notUpgradable',
          }),
        );
        expect(controller.state.diagnostics.upgrade).toStrictEqual({
          lastAttempt: {
            startedAt: expect.any(Number),
            finishedAt: expect.any(Number),
            outcome: 'skipped',
            skipReason: 'notUpgradable',
            error: null,
          },
          lastFailure: null,
          consecutiveFailures: 0,
        });
      });
    });

    it('does not reset the failure count when an upgrade is skipped', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();
        mocks.upgradeAccount.mockRejectedValueOnce(new Error('Failed'));
        await expect(controller.upgradeMoneyAccount()).rejects.toThrow(
          'Failed',
        );
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        await refetch();

        await controller.upgradeMoneyAccount();

        expect(controller.state.diagnostics.upgrade).toMatchObject({
          lastAttempt: { outcome: 'skipped' },
          consecutiveFailures: 1,
        });
      });
    });

    it('records an upgrade skipped because the wallet is locked', async () => {
      await withController({ isUnlocked: false }, async ({ controller }) => {
        await controller.upgradeMoneyAccount();

        expect(controller.state.diagnostics.upgrade.lastAttempt).toMatchObject({
          outcome: 'skipped',
          skipReason: 'walletNotReady',
        });
      });
    });

    it('records an upgrade skipped because the wallet locked while waiting for identities', async () => {
      await withController(
        async ({ controller, mocks, gates, triggerKeyringChange }) => {
          const { promise, resolve } = createDeferredPromise<{
            identities: DerivedIdentity[];
          }>();
          mocks.getDerivedIdentities.mockReturnValueOnce(promise);
          controller.init();

          const upgrade = controller.upgradeMoneyAccount();
          gates.isUnlocked = false;
          await triggerKeyringChange();
          resolve({ identities: [SFA_IDENTITY] });
          await upgrade;

          expect(
            controller.state.diagnostics.upgrade.lastAttempt,
          ).toMatchObject({ outcome: 'skipped', skipReason: 'walletNotReady' });
        },
      );
    });

    it('records an upgrade skipped because a migration is in flight', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeSuccessorAccount.mockReturnValueOnce(promise);
        const migration = controller.startMigration();
        await flushPromises();

        await controller.upgradeMoneyAccount();
        resolve();
        await migration;

        expect(controller.state.diagnostics.upgrade.lastAttempt).toMatchObject({
          outcome: 'skipped',
          skipReason: 'migrationInFlight',
        });
      });
    });

    it('logs and records nothing while the feature is disabled', async () => {
      await withController(
        { isEnabled: false },
        async ({ controller, mocks }) => {
          await controller.upgradeMoneyAccount();

          expect(mocks.log).not.toHaveBeenCalled();
          expect(controller.state.diagnostics.upgrade.lastAttempt).toBeNull();
        },
      );
    });

    it('records nothing for an upgrade that outlives clearState', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeAccount.mockReturnValueOnce(promise);

        const upgrade = controller.upgradeMoneyAccount();
        await flushPromises();
        controller.clearState();
        resolve();
        await upgrade;

        expect(controller.state.diagnostics.upgrade.lastAttempt).toBeNull();
        expect(controller.state.diagnostics.history).toStrictEqual([
          {
            type: 'stateCleared',
            upgradeWasInFlight: true,
            migrationWasInFlight: false,
            timestamp: expect.any(Number),
          },
        ]);
      });
    });

    it('records nothing for an upgrade skipped after clearState', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<{
          identities: DerivedIdentity[];
        }>();
        mocks.getDerivedIdentities.mockReturnValueOnce(promise);

        const upgrade = controller.upgradeMoneyAccount();
        controller.clearState();
        resolve({ identities: [SFA_IDENTITY] });
        await upgrade;

        expect(controller.state.diagnostics.upgrade.lastAttempt).toBeNull();
        expect(getLoggedTypes(mocks.log)).not.toContain('upgradeSkipped');
      });
    });
  });

  describe('startMigration', () => {
    it('records each stage of a new migration and its success', async () => {
      await withController(async ({ controller }) => {
        await controller.startMigration();

        expect(
          controller.state.diagnostics.history.filter(({ type }) =>
            type.startsWith('migration'),
          ),
        ).toStrictEqual(
          [
            { type: 'migrationStarted' },
            { type: 'migrationStageStarted', stage: 'checkIdentities' },
            { type: 'migrationStageStarted', stage: 'createSuccessor' },
            { type: 'migrationStageStarted', stage: 'linkSuccessor' },
            { type: 'migrationStageStarted', stage: 'moveSubscription' },
            { type: 'migrationStageStarted', stage: 'registerIntents' },
            { type: 'migrationStageStarted', stage: 'startFundsTransfer' },
            { type: 'migrationSucceeded', durationMs: expect.any(Number) },
          ].map((event) => ({ ...event, timestamp: expect.any(Number) })),
        );
        expect(controller.state.diagnostics.migration).toStrictEqual({
          lastAttempt: {
            startedAt: expect.any(Number),
            finishedAt: expect.any(Number),
            outcome: 'succeeded',
            stage: 'startFundsTransfer',
            error: null,
          },
          lastFailure: null,
          consecutiveFailures: 0,
        });
      });
    });

    it('records restoring the successor of a resumed migration', async () => {
      await withController(
        { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [RESUMABLE_IDENTITY],
          });

          await controller.startMigration();

          expect(controller.state.diagnostics.history).toContainEqual(
            expect.objectContaining({
              type: 'migrationStageStarted',
              stage: 'restoreSuccessor',
            }),
          );
          expect(controller.state.diagnostics.history).not.toContainEqual(
            expect.objectContaining({ stage: 'createSuccessor' }),
          );
        },
      );
    });

    it('records a migration stopped for lack of a Money Account Plus subscription', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentityByAddress.mockResolvedValue(
          buildLinkedIdentityResponse([
            { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: false },
          ]),
        );

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new MoneyAccountLifecycleError(
            MoneyAccountLifecycleErrorCode.SubscriptionMissing,
            'The premium migration of the Money Account needs an active Money Account Plus subscription paid in crypto by it or by its successor',
          ),
        );

        expect(
          controller.state.diagnostics.migration.lastFailure,
        ).toMatchObject({
          stage: 'moveSubscription',
          error: { code: MoneyAccountLifecycleErrorCode.SubscriptionMissing },
        });
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
      });
    });

    it('records a migration that failed to move the subscription', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        const error = new Error(`Delegation for ${MFA_ACCOUNT_ADDRESS} failed`);
        mocks.prepareDelegation.mockRejectedValue(error);

        await expect(controller.startMigration()).rejects.toThrow(error);

        expect(
          controller.state.diagnostics.migration.lastFailure,
        ).toMatchObject({
          stage: 'moveSubscription',
          error: { message: 'Delegation for 0x[redacted] failed' },
        });
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
      });
    });

    it('records the stage a migration failed in', async () => {
      await withController(async ({ controller, mocks }) => {
        const error = new Error('Intents rejected');
        mocks.registerMigrationIntents.mockRejectedValue(error);

        await expect(controller.startMigration()).rejects.toThrow(error);

        const failure = {
          startedAt: expect.any(Number),
          finishedAt: expect.any(Number),
          outcome: 'failed',
          stage: 'registerIntents',
          error: expect.objectContaining({ message: 'Intents rejected' }),
        };
        expect(controller.state.diagnostics.migration).toStrictEqual({
          lastAttempt: failure,
          lastFailure: failure,
          consecutiveFailures: 1,
        });
        expect(controller.state.diagnostics.history).toContainEqual({
          type: 'migrationFailed',
          durationMs: expect.any(Number),
          stage: 'registerIntents',
          error: expect.objectContaining({ message: 'Intents rejected' }),
          timestamp: expect.any(Number),
        });
      });
    });

    it('records the code of a migration that cannot start', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new MoneyAccountLifecycleError(
            MoneyAccountLifecycleErrorCode.NotMigratable,
            "The Money Account cannot be migrated while it is 'mfa'",
          ),
        );

        expect(
          controller.state.diagnostics.migration.lastFailure,
        ).toMatchObject({
          stage: 'checkIdentities',
          error: { code: 'NOT_MIGRATABLE' },
        });
      });
    });

    it('records retrying the funds transfer', async () => {
      vi.useFakeTimers();
      await withController(async ({ controller, mocks }) => {
        mocks.startFundsTransfer.mockRejectedValueOnce(
          new ChompApiError(409, 'Incomplete', 'MIGRATION_STEPS_INCOMPLETE'),
        );

        const migration = controller.startMigration();
        await vi.advanceTimersByTimeAsync(2000);
        await migration;

        expect(controller.state.diagnostics.history).toContainEqual({
          type: 'fundsTransferRetried',
          error: expect.objectContaining({
            code: 'MIGRATION_STEPS_INCOMPLETE',
            httpStatus: 409,
          }),
          timestamp: expect.any(Number),
        });
      });
    });

    it('rejects concurrent migrations with a code, without recording them', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeSuccessorAccount.mockReturnValueOnce(promise);
        const migration = controller.startMigration();
        await flushPromises();

        await expect(controller.startMigration()).rejects.toMatchObject({
          code: MoneyAccountLifecycleErrorCode.MigrationInProgress,
        });
        resolve();
        await migration;

        expect(controller.state.diagnostics.migration).toMatchObject({
          lastFailure: null,
          consecutiveFailures: 0,
        });
      });
    });

    it('rejects a migration while an upgrade is in flight with a code', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeAccount.mockReturnValueOnce(promise);
        const upgrade = controller.upgradeMoneyAccount();
        await flushPromises();

        await expect(controller.startMigration()).rejects.toMatchObject({
          code: MoneyAccountLifecycleErrorCode.UpgradeInProgress,
        });
        resolve();
        await upgrade;
      });
    });

    it('records nothing for a migration interrupted by clearState', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeSuccessorAccount.mockReturnValueOnce(promise);
        const migration = controller.startMigration();
        await flushPromises();

        controller.clearState();
        resolve();

        await expect(migration).rejects.toMatchObject({
          code: MoneyAccountLifecycleErrorCode.StateCleared,
        });
        expect(controller.state.diagnostics.migration.lastAttempt).toBeNull();
        expect(controller.state.diagnostics.history).toStrictEqual([
          {
            type: 'stateCleared',
            upgradeWasInFlight: false,
            migrationWasInFlight: true,
            timestamp: expect.any(Number),
          },
        ]);
        expect(mocks.log).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'migrationFailed',
            stage: 'linkSuccessor',
          }),
        );
      });
    });
  });

  describe('log hook', () => {
    it('never passes an address to the log hook', async () => {
      await withController(
        { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
        async ({ controller, mocks, init, refetch }) => {
          await init();
          mocks.upgradeAccount.mockRejectedValueOnce(
            new Error(`Could not upgrade ${MONEY_ACCOUNT_ADDRESS}`),
          );
          await expect(controller.upgradeMoneyAccount()).rejects.toThrow(
            'Could not upgrade',
          );
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [RESUMABLE_IDENTITY],
          });
          await refetch();
          await controller.startMigration();
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });
          await refetch();

          const logged = JSON.stringify(getLoggedEntries(mocks.log));
          expect(mocks.log.mock.calls.length).toBeGreaterThan(10);
          for (const address of ADDRESSES) {
            expect(logged.toLowerCase()).not.toContain(address.toLowerCase());
          }
        },
      );
    });

    it('reports an error thrown by the log hook and still records the entry', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Hook failed');
        mocks.log.mockImplementation(() => {
          throw error;
        });

        await init();

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(getHistoryTypes(controller)).toContain('lifecycleChanged');
      });
    });

    it('works without a log hook', async () => {
      await withController(
        { options: { hooks: { isEnabled: () => true } } },
        async ({ controller, init }) => {
          await init();

          expect(getHistoryTypes(controller)).toContain('lifecycleChanged');
        },
      );
    });
  });

  describe('history', () => {
    it(`keeps the latest ${MAX_DIAGNOSTICS_HISTORY_LENGTH} entries`, async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();
        for (let index = 0; index < MAX_DIAGNOSTICS_HISTORY_LENGTH; index++) {
          mocks.getRegistrationStatus.mockResolvedValueOnce({
            isRegistered: index % 2 === 0,
          });
          await refetch();
        }

        const { history } = controller.state.diagnostics;
        expect(history).toHaveLength(MAX_DIAGNOSTICS_HISTORY_LENGTH);
        expect(history[0]).not.toMatchObject({ type: 'lifecycleChanged' });
        expect(history.at(-1)).toMatchObject({
          type: 'registrationStatusChanged',
          isRegistered: false,
        });
      });
    });
  });
});
