import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import { createDeferredPromise } from '@metamask/utils';
import type { DeferredPromise, Hex } from '@metamask/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MFA_ACCOUNT_ADDRESS,
  MFA_IDENTITY,
  MIGRATED_IDENTITY,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  SFA_IDENTITY,
  SUCCESSOR_ADDRESS,
  buildBindingMigrator,
  buildLinkedIdentityResponse,
  buildMigratedIdentityResponse,
  getLifecycle,
  withController,
} from '../tests/helpers.js';
import { BindingMigrationIncompleteError } from './binding-migration.js';
import type {
  BindingMigrationResult,
  BindingMigrationsState,
} from './binding-migration.js';
import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

const SUCCESSOR_CONTEXT = {
  migrationId:
    '0xf4bd66b23233da5810ca057e3d75295a14fe6f0db0e4f54e41477a5de84464bc',
  previousAddress: '0x00000000000000000000000000000000000000aa',
  currentAddress: '0x00000000000000000000000000000000000000dd',
};

const MIGRATION_TO_SUCCESSOR: DerivedIdentityMigration = {
  ...MIGRATING_IDENTITY.migration,
  to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
};

const MIGRATING_TO_SUCCESSOR_IDENTITY: DerivedIdentity = {
  ...MIGRATING_IDENTITY,
  migration: MIGRATION_TO_SUCCESSOR,
};

const MIGRATION_CONTEXT = {
  migrationId:
    '0x10715ad7eb270b0d8c7fbb3859a25e442e8f640f03b5db0d5857d7acc092681e',
  previousAddress: '0x00000000000000000000000000000000000000aa',
  currentAddress: '0x00000000000000000000000000000000000000bb',
};

function getMigrators(
  controller: MoneyAccountLifecycleController,
): BindingMigrationsState['migrators'] {
  return controller.state.bindingMigrations?.migrators ?? {};
}

describe('MoneyAccountLifecycleController binding migrations', () => {
  describe('registerBindingMigrator', () => {
    it('records the status of a migrator for a migrating money account', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.getStatus.mockReturnValue({
          status: 'pending',
          details: { step: 'wallet-registration' },
        });

        controller.registerBindingMigrator(migrator);

        expect(migrator.getStatus).toHaveBeenCalledWith({
          ...MIGRATION_CONTEXT,
          identityStatus: 'MIGRATING',
        });
        expect(migrator.reconcile).not.toHaveBeenCalled();
        expect(controller.state.bindingMigrations).toStrictEqual({
          ...MIGRATION_CONTEXT,
          migrators: {
            vba: {
              phase: 'afterLink',
              status: 'pending',
              details: { step: 'wallet-registration' },
              lastResult: null,
              lastError: null,
            },
          },
        });
      });
    });

    it('gives a valid MFA the money account as the previous address and the identity current address as the current address', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });
          await init();
          const migrator = buildBindingMigrator({ phase: 'afterDone' });

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).toHaveBeenCalledWith({
            ...MIGRATION_CONTEXT,
            identityStatus: 'DONE',
          });
        },
      );
    });

    it.each<[string, DerivedIdentity, string | undefined]>([
      [
        'migrating to the MPC Money Account of another wallet',
        MIGRATING_IDENTITY,
        '0x00000000000000000000000000000000000000ee',
      ],
      [
        'migrated, without the MPC Money Account on this wallet',
        MFA_IDENTITY,
        undefined,
      ],
      [
        'migrated to the MPC Money Account of another wallet',
        MFA_IDENTITY,
        '0x00000000000000000000000000000000000000ee',
      ],
    ])(
      'records nothing while the money account is %s, which this wallet cannot migrate',
      async (_description, identity, mpcAccountAddress) => {
        await withController(
          { mpcAccountAddress },
          async ({ controller, mocks, init }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [identity],
            });
            await init();
            const migrator = buildBindingMigrator({ phase: 'afterDone' });

            controller.registerBindingMigrator(migrator);

            expect(migrator.getStatus).not.toHaveBeenCalled();
            expect(controller.state.bindingMigrations).toBeNull();
          },
        );
      },
    );

    it.each<[string, DerivedIdentity[]]>([
      [
        'while another identity is also migrating',
        [
          MIGRATING_IDENTITY,
          {
            ...MIGRATING_IDENTITY,
            currentAddress: '0x00000000000000000000000000000000000000ee',
          },
        ],
      ],
      [
        'whose migration starts from another address',
        [
          {
            ...MIGRATING_IDENTITY,
            migration: {
              ...MIGRATING_IDENTITY.migration,
              from: '0x00000000000000000000000000000000000000ee',
            },
          },
        ],
      ],
    ])(
      'records nothing for a migrating money account %s, as startMigration cannot resume it',
      async (_description, identities) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({ identities });
          await init();
          const migrator = buildBindingMigrator();

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).not.toHaveBeenCalled();
          expect(controller.state.bindingMigrations).toBeNull();
        });
      },
    );

    it('records the binding migrations of a migrating money account whose MPC Money Account is missing, as resuming restores it', async () => {
      await withController(
        { mpcAccountAddress: undefined },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });
          await init();

          controller.registerBindingMigrator(
            buildBindingMigrator({ id: 'vba' }),
          );

          expect(getMigrators(controller)).toHaveProperty('vba');
        },
      );
    });

    it('records no binding migrations while no migrator is registered', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });

        await init();

        expect(controller.state.bindingMigrations).toBeNull();
      });
    });

    it.each([
      ['a valid SFA', [SFA_IDENTITY]],
      ['not in an identity', []],
    ] as [string, DerivedIdentity[]][])(
      'records nothing while the money account is %s',
      async (_description, identities) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({ identities });
          await init();
          const migrator = buildBindingMigrator();

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).not.toHaveBeenCalled();
          expect(controller.state.bindingMigrations).toBeNull();
        });
      },
    );

    it('records nothing while the wallet is locked, even with a migrating lifecycle recorded', async () => {
      await withController(
        {
          isUnlocked: false,
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: {
                  type: 'migrating',
                  identity: MIGRATING_IDENTITY,
                },
              },
            },
          },
        },
        async ({ controller, init }) => {
          await init();
          const migrator = buildBindingMigrator();

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).not.toHaveBeenCalled();
          expect(controller.state.bindingMigrations).toBeNull();
        },
      );
    });

    it('records the binding migrations of a recorded migrating lifecycle before identities are fetched', async () => {
      await withController(
        {
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: {
                  type: 'migrating',
                  identity: MIGRATING_IDENTITY,
                },
              },
            },
          },
        },
        async ({ controller }) => {
          controller.registerBindingMigrator(
            buildBindingMigrator({ id: 'vba' }),
          );

          expect(getMigrators(controller)).toHaveProperty('vba');
        },
      );
    });

    it('records nothing when there is no money account', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, init }) => {
          await init();
          const migrator = buildBindingMigrator();

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).not.toHaveBeenCalled();
          expect(controller.state.bindingMigrations).toBeNull();
        },
      );
    });

    it('records the migrators in the order they were registered', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();

        controller.registerBindingMigrator(
          buildBindingMigrator({ id: 'second', phase: 'beforeFundsTransfer' }),
        );
        controller.registerBindingMigrator(
          buildBindingMigrator({ id: 'first', phase: 'afterLink' }),
        );

        expect(Object.keys(getMigrators(controller))).toStrictEqual([
          'second',
          'first',
        ]);
      });
    });

    it('ignores a migrator with the id of one already registered', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        const first = buildBindingMigrator({ id: 'vba' });
        const second = buildBindingMigrator({
          id: 'vba',
          phase: 'afterDone',
        });
        controller.registerBindingMigrator(first);

        expect(() => controller.registerBindingMigrator(second)).not.toThrow();
        expect(second.getStatus).not.toHaveBeenCalled();
        expect(getMigrators(controller)).toStrictEqual({
          vba: expect.objectContaining({ phase: 'afterLink' }),
        });
      });
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31])(
      'throws when the timeout of the migrator is %d',
      async (timeoutMs) => {
        await withController(({ controller }) => {
          expect(() =>
            controller.registerBindingMigrator(
              buildBindingMigrator({ id: 'vba', timeoutMs }),
            ),
          ).toThrow(
            `The timeout of binding migrator 'vba' must be a positive number of milliseconds up to ${2 ** 31 - 1}`,
          );
        });
      },
    );

    it('records an unknown status and reports the error when the migrator cannot read its status', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        const error = new Error('Status unavailable');
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.getStatus.mockImplementation(() => {
          throw error;
        });

        controller.registerBindingMigrator(migrator);

        expect(getMigrators(controller)).toStrictEqual({
          vba: {
            phase: 'afterLink',
            status: 'unknown',
            details: null,
            lastResult: null,
            lastError: null,
          },
        });
        expect(mocks.captureException).toHaveBeenCalledWith(error);
      });
    });

    it('is exposed through the messenger', async () => {
      await withController(
        async ({ controller, rootMessenger, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });
          await init();
          const migrator = buildBindingMigrator({ id: 'vba' });

          rootMessenger.call(
            'MoneyAccountLifecycleController:registerBindingMigrator',
            migrator,
          );

          expect(getMigrators(controller)).toHaveProperty('vba');
        },
      );
    });
  });

  describe('bindingMigrations state', () => {
    it('reads the statuses of the registered migrators after each identity fetch', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const migrator = buildBindingMigrator({ id: 'vba' });
        controller.registerBindingMigrator(migrator);
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });

        await init();

        expect(getMigrators(controller).vba?.status).toBe('unknown');

        migrator.getStatus.mockReturnValue({ status: 'completed' });
        await controller.refresh();

        expect(getMigrators(controller).vba?.status).toBe('completed');
      });
    });

    it('drops the statuses once the money account is no longer migrating or migrated', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        controller.registerBindingMigrator(buildBindingMigrator());
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [SFA_IDENTITY],
        });

        await controller.refresh();

        expect(controller.state.bindingMigrations).toBeNull();
      });
    });

    it('clears the statuses when the wallet locks and reads them again once it unlocks', async () => {
      await withController(
        async ({ controller, mocks, gates, init, triggerKeyringChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });
          await init();
          controller.registerBindingMigrator(
            buildBindingMigrator({ id: 'vba' }),
          );

          gates.isUnlocked = false;
          await triggerKeyringChange();

          expect(controller.state.bindingMigrations).toBeNull();

          gates.isUnlocked = true;
          await triggerKeyringChange();

          expect(getMigrators(controller)).toHaveProperty('vba');
        },
      );
    });

    it('is cleared by clearState, which keeps the registered migrators', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        controller.registerBindingMigrator(buildBindingMigrator({ id: 'vba' }));

        controller.clearState();

        expect(controller.state.bindingMigrations).toBeNull();

        await controller.refresh();

        expect(getMigrators(controller)).toHaveProperty('vba');
      });
    });
  });

  describe('startMigration', () => {
    it('runs the afterLink migrators once the successor is linked, before moving the subscription', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator({ phase: 'afterLink' });
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(migrator.reconcile).toHaveBeenCalledTimes(1);
        expect(migrator.reconcile).toHaveBeenCalledWith({
          ...SUCCESSOR_CONTEXT,
          identityStatus: 'MIGRATING',
        });
        const [reconcileOrder] = migrator.reconcile.mock.invocationCallOrder;
        expect(reconcileOrder).toBeGreaterThan(
          mocks.upgradeSuccessorAccount.mock.invocationCallOrder[0],
        );
        expect(reconcileOrder).toBeLessThan(
          mocks.getSubscriptions.mock.invocationCallOrder[0],
        );
      });
    });

    it('runs the beforeFundsTransfer migrators once the migration intents are registered, before starting the funds transfer', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator({
          phase: 'beforeFundsTransfer',
        });
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(migrator.reconcile).toHaveBeenCalledWith({
          ...SUCCESSOR_CONTEXT,
          identityStatus: 'MIGRATING',
        });
        const [reconcileOrder] = migrator.reconcile.mock.invocationCallOrder;
        expect(reconcileOrder).toBeGreaterThan(
          mocks.registerMigrationIntents.mock.invocationCallOrder[0],
        );
        expect(reconcileOrder).toBeLessThan(
          mocks.startFundsTransfer.mock.invocationCallOrder[0],
        );
      });
    });

    it('runs the migrators of a phase in the order they were registered', async () => {
      await withController(async ({ controller }) => {
        const first = buildBindingMigrator({ id: 'first' });
        const second = buildBindingMigrator({ id: 'second' });
        controller.registerBindingMigrator(first);
        controller.registerBindingMigrator(second);

        await controller.startMigration();

        expect(first.reconcile.mock.invocationCallOrder[0]).toBeLessThan(
          second.reconcile.mock.invocationCallOrder[0],
        );
      });
    });

    it('does not run a migrator registered after its phase has passed', async () => {
      await withController(async ({ controller, mocks }) => {
        const lateMigrator = buildBindingMigrator({ phase: 'afterLink' });
        mocks.registerMigrationIntents.mockImplementationOnce(async () => {
          controller.registerBindingMigrator(lateMigrator);
        });

        await controller.startMigration();

        expect(lateMigrator.reconcile).not.toHaveBeenCalled();
      });
    });

    it('does not run a migrator registered while its phase is running', async () => {
      await withController(async ({ controller }) => {
        const lateMigrator = buildBindingMigrator({ id: 'late' });
        const migrator = buildBindingMigrator({ id: 'first' });
        migrator.reconcile.mockImplementation(async () => {
          controller.registerBindingMigrator(lateMigrator);
          return { status: 'completed' };
        });
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(lateMigrator.reconcile).not.toHaveBeenCalled();
      });
    });

    it('records the result and the status of each migrator it runs', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({
            identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
          });
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockImplementation(async () => {
          migrator.getStatus.mockReturnValue({ status: 'completed' });
          return { status: 'completed' };
        });
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(controller.state.bindingMigrations).toStrictEqual({
          ...SUCCESSOR_CONTEXT,
          migrators: {
            vba: {
              phase: 'afterLink',
              status: 'completed',
              details: null,
              lastResult: { status: 'completed' },
              lastError: null,
            },
          },
        });
      });
    });

    it('carries on when a migrator does not need to migrate anything', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator();
        migrator.reconcile.mockResolvedValue({ status: 'not_required' });
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
      });
    });

    it('runs every migrator of the phase, then throws naming the incomplete ones without going on to the next step', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({
            identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
          });
        const pending = buildBindingMigrator({ id: 'pending' });
        pending.reconcile.mockResolvedValue({
          status: 'pending',
          reason: 'Busy',
        });
        const blocked = buildBindingMigrator({ id: 'blocked' });
        blocked.reconcile.mockResolvedValue({
          status: 'blocked',
          reason: 'Denied',
        });
        const completed = buildBindingMigrator({ id: 'completed' });
        controller.registerBindingMigrator(pending);
        controller.registerBindingMigrator(blocked);
        controller.registerBindingMigrator(completed);

        const error = await controller
          .startMigration()
          .catch((caught: unknown) => caught);

        expect(error).toStrictEqual(
          new BindingMigrationIncompleteError('afterLink', [
            {
              migratorId: 'pending',
              result: { status: 'pending', reason: 'Busy' },
            },
            {
              migratorId: 'blocked',
              result: { status: 'blocked', reason: 'Denied' },
            },
          ]),
        );
        expect(completed.reconcile).toHaveBeenCalledTimes(1);
        expect(mocks.getSubscriptions).not.toHaveBeenCalled();
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        expect(getLifecycle(controller)?.type).toBe('migrating');
        expect(getMigrators(controller).blocked?.lastResult).toStrictEqual({
          status: 'blocked',
          reason: 'Denied',
        });
      });
    });

    it('stops before starting the funds transfer when a beforeFundsTransfer migrator is incomplete', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator({
          phase: 'beforeFundsTransfer',
        });
        migrator.reconcile.mockResolvedValue({
          status: 'pending',
          reason: 'Busy',
        });
        controller.registerBindingMigrator(migrator);

        await expect(controller.startMigration()).rejects.toThrow(
          BindingMigrationIncompleteError,
        );
        expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
      });
    });

    it('reports a blocked migrator', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockResolvedValue({
          status: 'blocked',
          reason: 'Denied',
        });
        controller.registerBindingMigrator(migrator);

        await expect(controller.startMigration()).rejects.toThrow(
          BindingMigrationIncompleteError,
        );
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error("Binding migrator 'vba' is blocked: Denied"),
        );
      });
    });

    it('treats a migrator that throws as pending, and reports and records the error', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({
            identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
          });
        const error = new Error('Network failure');
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockRejectedValue(error);
        controller.registerBindingMigrator(migrator);

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new BindingMigrationIncompleteError('afterLink', [
            {
              migratorId: 'vba',
              result: { status: 'pending', reason: 'Network failure' },
            },
          ]),
        );
        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(getMigrators(controller).vba).toStrictEqual({
          phase: 'afterLink',
          status: 'unknown',
          details: null,
          lastResult: { status: 'pending', reason: 'Network failure' },
          lastError: 'Network failure',
        });
      });
    });

    it('reads the reason from a migrator that throws something other than an error', async () => {
      await withController(async ({ controller }) => {
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockRejectedValue('Network failure');
        controller.registerBindingMigrator(migrator);

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new BindingMigrationIncompleteError('afterLink', [
            {
              migratorId: 'vba',
              result: { status: 'pending', reason: 'Network failure' },
            },
          ]),
        );
      });
    });

    it('throws without recording the result or running the next migrator when the wallet locks while a migrator runs', async () => {
      await withController(async ({ controller, gates }) => {
        const first = buildBindingMigrator({ id: 'first' });
        first.reconcile.mockImplementation(async () => {
          gates.isUnlocked = false;
          return { status: 'completed' };
        });
        const second = buildBindingMigrator({ id: 'second' });
        controller.registerBindingMigrator(first);
        controller.registerBindingMigrator(second);

        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(second.reconcile).not.toHaveBeenCalled();
        expect(controller.state.bindingMigrations).toBeNull();
      });
    });

    it('keeps the last result of a migrator when its status is read again while the phase runs', async () => {
      await withController(
        async ({ controller, mocks, init, triggerMoneyAccountChange }) => {
          await init();
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValueOnce({
              identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
            });
          const first = buildBindingMigrator({ id: 'first' });
          const second = buildBindingMigrator({ id: 'second' });
          second.reconcile.mockImplementation(async () => {
            await triggerMoneyAccountChange();
            return { status: 'completed' };
          });
          controller.registerBindingMigrator(first);
          controller.registerBindingMigrator(second);

          await controller.startMigration();

          expect(getMigrators(controller).first?.lastResult).toStrictEqual({
            status: 'completed',
          });
        },
      );
    });

    describe('when a migrator takes too long', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('treats it as pending after 30 seconds, reports it, and runs the next migrator', async () => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValue({
              identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
            });
          const slow = buildBindingMigrator({ id: 'slow' });
          slow.reconcile.mockReturnValue(new Promise(() => undefined));
          const next = buildBindingMigrator({ id: 'next' });
          controller.registerBindingMigrator(slow);
          controller.registerBindingMigrator(next);

          const migration = controller
            .startMigration()
            .catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(29_999);
          expect(next.reconcile).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(1);

          expect(await migration).toStrictEqual(
            new BindingMigrationIncompleteError('afterLink', [
              {
                migratorId: 'slow',
                result: {
                  status: 'pending',
                  reason: 'Timed out after 30000 ms',
                },
              },
            ]),
          );
          expect(next.reconcile).toHaveBeenCalledTimes(1);
          expect(mocks.captureException).toHaveBeenCalledWith(
            new Error("Binding migrator 'slow' timed out after 30000 ms"),
          );
          expect(getMigrators(controller).slow?.lastError).toBe(
            'Timed out after 30000 ms',
          );
        });
      });

      it('uses the timeout the migrator registered with', async () => {
        await withController(async ({ controller }) => {
          const slow = buildBindingMigrator({ id: 'slow', timeoutMs: 5000 });
          slow.reconcile.mockReturnValue(new Promise(() => undefined));
          controller.registerBindingMigrator(slow);

          const migration = controller
            .startMigration()
            .catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(5000);

          expect(await migration).toStrictEqual(
            new BindingMigrationIncompleteError('afterLink', [
              {
                migratorId: 'slow',
                result: {
                  status: 'pending',
                  reason: 'Timed out after 5000 ms',
                },
              },
            ]),
          );
        });
      });

      it.each<{
        description: string;
        settle: (deferred: DeferredPromise<BindingMigrationResult>) => void;
      }>([
        {
          description: 'completes',
          settle: ({ resolve }): void => resolve({ status: 'completed' }),
        },
        {
          description: 'fails',
          settle: ({ reject }): void => reject(new Error('Too late')),
        },
      ])(
        'ignores a migrator that $description after timing out',
        async ({ settle }) => {
          await withController(async ({ controller, mocks }) => {
            mocks.getDerivedIdentities
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValue({
                identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
              });
            const deferred = createDeferredPromise<BindingMigrationResult>();
            const slow = buildBindingMigrator({ id: 'slow', timeoutMs: 1000 });
            slow.reconcile.mockReturnValue(deferred.promise);
            controller.registerBindingMigrator(slow);

            const migration = controller
              .startMigration()
              .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(1000);
            await migration;
            settle(deferred);
            await vi.advanceTimersByTimeAsync(0);

            expect(getMigrators(controller).slow?.lastResult).toStrictEqual({
              status: 'pending',
              reason: 'Timed out after 1000 ms',
            });
            expect(mocks.captureException).toHaveBeenCalledTimes(1);
          });
        },
      );
    });

    it('does not wait for the migration to finish when no afterDone migrator is registered', async () => {
      await withController(async ({ controller, mocks }) => {
        controller.registerBindingMigrator(buildBindingMigrator());

        await controller.startMigration();

        // Only the subscription intent check reads the identity.
        expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(1);
      });
    });

    describe('when an afterDone migrator is registered', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('waits for the migration to finish, then runs the afterDone migrators', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({
                identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
              })
              .mockResolvedValue({ identities: [MIGRATED_IDENTITY] });
            mocks.getDerivedIdentityByAddress
              .mockResolvedValueOnce(buildLinkedIdentityResponse())
              .mockResolvedValueOnce(buildLinkedIdentityResponse())
              .mockResolvedValue(buildMigratedIdentityResponse());
            const migrator = buildBindingMigrator({ phase: 'afterDone' });
            controller.registerBindingMigrator(migrator);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(2000);
            expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(2);
            expect(migrator.reconcile).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(4000);

            expect(await migration).toBeUndefined();
            expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(3);
            expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledWith(
              MONEY_ACCOUNT_ADDRESS,
            );
            expect(migrator.reconcile).toHaveBeenCalledTimes(1);
            expect(migrator.reconcile).toHaveBeenCalledWith({
              ...SUCCESSOR_CONTEXT,
              identityStatus: 'DONE',
            });
            expect(getLifecycle(controller)).toStrictEqual({
              type: 'mfa',
              identity: MIGRATED_IDENTITY,
            });
          },
        );
      });

      it('throws naming an incomplete afterDone migrator', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValue({ identities: [MIGRATED_IDENTITY] });
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              buildMigratedIdentityResponse(),
            );
            const migrator = buildBindingMigrator({
              id: 'rewards',
              phase: 'afterDone',
            });
            migrator.reconcile.mockResolvedValue({
              status: 'pending',
              reason: 'Busy',
            });
            controller.registerBindingMigrator(migrator);

            const migration = controller
              .startMigration()
              .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(2000);

            expect(await migration).toStrictEqual(
              new BindingMigrationIncompleteError('afterDone', [
                {
                  migratorId: 'rewards',
                  result: { status: 'pending', reason: 'Busy' },
                },
              ]),
            );
          },
        );
      });

      it('gives up waiting after a minute, backing off between checks, without running the afterDone migrators', async () => {
        await withController(async ({ controller, mocks }) => {
          const migrator = buildBindingMigrator({ phase: 'afterDone' });
          controller.registerBindingMigrator(migrator);

          const migration = controller.startMigration();
          await vi.advanceTimersByTimeAsync(59_999);
          expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(6);
          await vi.advanceTimersByTimeAsync(1);

          expect(await migration).toBeUndefined();
          expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(7);
          expect(migrator.reconcile).not.toHaveBeenCalled();
        });
      });

      it.each(['transfer', 'premiumTransfer'] as const)(
        'stops waiting without running the afterDone migrators when the %s fails',
        async (transferKey) => {
          await withController(async ({ controller, mocks }) => {
            const response = buildLinkedIdentityResponse();
            mocks.getDerivedIdentityByAddress.mockResolvedValue({
              ...response,
              identity: {
                ...response.identity,
                migration: {
                  ...MIGRATING_IDENTITY.migration,
                  [transferKey]: {
                    requestId: 'transfer-request-id',
                    status: 'FAILED',
                  },
                },
              },
            });
            const migrator = buildBindingMigrator({ phase: 'afterDone' });
            controller.registerBindingMigrator(migrator);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(2000);

            expect(await migration).toBeUndefined();
            expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(2);
            expect(migrator.reconcile).not.toHaveBeenCalled();
          });
        },
      );

      it('reports a failed check and keeps waiting', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValue({ identities: [MIGRATED_IDENTITY] });
            const error = new Error('Network failure');
            mocks.getDerivedIdentityByAddress
              .mockResolvedValueOnce(buildLinkedIdentityResponse())
              .mockRejectedValueOnce(error)
              .mockResolvedValue(buildMigratedIdentityResponse());
            const migrator = buildBindingMigrator({ phase: 'afterDone' });
            controller.registerBindingMigrator(migrator);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(6000);

            expect(await migration).toBeUndefined();
            expect(mocks.captureException).toHaveBeenCalledWith(error);
            expect(migrator.reconcile).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('throws when the wallet locks while waiting', async () => {
        await withController(async ({ controller, gates, mocks }) => {
          controller.registerBindingMigrator(
            buildBindingMigrator({ phase: 'afterDone' }),
          );

          const migration = controller
            .startMigration()
            .catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(1000);
          gates.isUnlocked = false;
          await vi.advanceTimersByTimeAsync(1000);

          expect(await migration).toStrictEqual(
            new Error('Money Account migration is not available'),
          );
          expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(1);
        });
      });

      it('runs the afterDone migrators for the identity CHOMP reported finished, even when the refetched identities lag behind', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [SFA_IDENTITY],
            });
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              buildMigratedIdentityResponse(),
            );
            const migrator = buildBindingMigrator({ phase: 'afterDone' });
            controller.registerBindingMigrator(migrator);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(2000);

            expect(await migration).toBeUndefined();
            expect(migrator.reconcile).toHaveBeenCalledWith({
              ...SUCCESSOR_CONTEXT,
              identityStatus: 'DONE',
            });
          },
        );
      });

      it('runs the afterDone migrators even when refetching the identities fails', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
              .mockResolvedValueOnce({
                identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
              })
              .mockRejectedValue(new Error('CHOMP unavailable'));
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              buildMigratedIdentityResponse(),
            );
            const migrator = buildBindingMigrator({ phase: 'afterDone' });
            controller.registerBindingMigrator(migrator);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(2000);

            expect(await migration).toBeUndefined();
            expect(migrator.reconcile).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('gives up after a minute of waiting even when the clock moves back', async () => {
        await withController(async ({ controller, mocks }) => {
          controller.registerBindingMigrator(
            buildBindingMigrator({ phase: 'afterDone' }),
          );

          const migration = controller.startMigration();
          await vi.advanceTimersByTimeAsync(2000);
          vi.setSystemTime(Date.now() - 24 * 60 * 60 * 1000);
          await vi.advanceTimersByTimeAsync(58_000);

          expect(await migration).toBeUndefined();
          expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledTimes(7);
        });
      });
    });

    describe('when the money account has already migrated', () => {
      it('runs only the afterDone migrators', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [MIGRATED_IDENTITY],
            });
            const afterLink = buildBindingMigrator({
              id: 'afterLink',
              phase: 'afterLink',
            });
            const afterDone = buildBindingMigrator({
              id: 'afterDone',
              phase: 'afterDone',
            });
            controller.registerBindingMigrator(afterLink);
            controller.registerBindingMigrator(afterDone);

            expect(await controller.startMigration()).toBeUndefined();

            expect(afterDone.reconcile).toHaveBeenCalledWith({
              ...SUCCESSOR_CONTEXT,
              identityStatus: 'DONE',
            });
            expect(afterLink.reconcile).not.toHaveBeenCalled();
            expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
            expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
            expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
            expect(mocks.getDerivedIdentityByAddress).not.toHaveBeenCalled();
          },
        );
      });

      it.each([
        ['is missing', undefined],
        ['is another address', '0x00000000000000000000000000000000000000ee'],
      ])(
        'throws without running the afterDone migrators when the MPC Money Account of this wallet %s',
        async (_description, mpcAccountAddress) => {
          await withController(
            { mpcAccountAddress },
            async ({ controller, mocks }) => {
              mocks.getDerivedIdentities.mockResolvedValue({
                identities: [MIGRATED_IDENTITY],
              });
              const migrator = buildBindingMigrator({ phase: 'afterDone' });
              controller.registerBindingMigrator(migrator);

              await expect(controller.startMigration()).rejects.toThrow(
                `Money Account ${MONEY_ACCOUNT_ADDRESS} has migrated to ${MIGRATED_IDENTITY.currentAddress}, which is not the MPC Money Account of this wallet`,
              );
              expect(migrator.reconcile).not.toHaveBeenCalled();
            },
          );
        },
      );
    });
  });

  describe('registerBindingMigrator validation', () => {
    it.each<[string, Record<string, unknown>, string]>([
      [
        'an empty id',
        { id: '' },
        'A binding migrator needs a non-empty string id other than __proto__',
      ],
      [
        'the id __proto__',
        { id: '__proto__' },
        'A binding migrator needs a non-empty string id other than __proto__',
      ],
      [
        'an id that is not a string',
        { id: 1 },
        'A binding migrator needs a non-empty string id other than __proto__',
      ],
      [
        'an unknown phase',
        { phase: 'afterlink' },
        "Binding migrator 'vba' has an unknown phase 'afterlink'",
      ],
      [
        'no reconcile function',
        { reconcile: undefined },
        "Binding migrator 'vba' needs reconcile and getStatus functions",
      ],
      [
        'no getStatus function',
        { getStatus: 'completed' },
        "Binding migrator 'vba' needs reconcile and getStatus functions",
      ],
      [
        'a timeout that is not a number',
        { timeoutMs: '5000' },
        "The timeout of binding migrator 'vba' must be a positive number of milliseconds up to 2147483647",
      ],
    ])('throws for %s', async (_description, overrides, message) => {
      await withController(({ controller }) => {
        const migrator = {
          ...buildBindingMigrator({ id: 'vba' }),
          ...overrides,
        };

        expect(() =>
          controller.registerBindingMigrator(
            migrator as unknown as Parameters<
              typeof controller.registerBindingMigrator
            >[0],
          ),
        ).toThrow(message);
      });
    });

    it('accepts the longest timeout setTimeout supports', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.registerBindingMigrator(
            buildBindingMigrator({ timeoutMs: 2 ** 31 - 1 }),
          ),
        ).not.toThrow();
      });
    });

    it('registers the migrator and reports the error when its status cannot be recorded', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        const error = new Error('Handler not registered');
        mocks.getMoneyAccount.mockImplementationOnce(() => {
          throw error;
        });

        controller.registerBindingMigrator(buildBindingMigrator({ id: 'vba' }));

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        await init();
        expect(getMigrators(controller)).toHaveProperty('vba');
      });
    });
  });

  describe('binding migrator statuses', () => {
    it('records a copy of the details, so the migrator can keep changing its own objects', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        const progress = { status: 'pending' as const, details: { step: 1 } };
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.getStatus.mockReturnValue(progress);

        controller.registerBindingMigrator(migrator);
        progress.details.step = 2;

        expect(Object.isFrozen(progress.details)).toBe(false);
        expect(getMigrators(controller).vba?.details).toStrictEqual({
          step: 1,
        });
      });
    });

    it.each([
      ['nothing', undefined],
      ['an unknown status', { status: 'failed' }],
      [
        'details that are not JSON',
        { status: 'pending', details: { at: (): void => undefined } },
      ],
    ])(
      'records an unknown status and reports it when the migrator returns %s',
      async (_description, status) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });
          await init();
          const migrator = buildBindingMigrator({ id: 'vba' });
          migrator.getStatus.mockReturnValue(status as never);

          controller.registerBindingMigrator(migrator);

          expect(getMigrators(controller).vba?.status).toBe('unknown');
          expect(mocks.captureException).toHaveBeenCalledWith(
            new Error("Binding migrator 'vba' returned an invalid status"),
          );
        });
      },
    );

    it('reports a thrown value that cannot be turned into a string', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        await init();
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.getStatus.mockImplementation(() => {
          throw Object.create(null);
        });

        controller.registerBindingMigrator(migrator);

        expect(getMigrators(controller).vba?.status).toBe('unknown');
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error('Unknown error'),
        );
      });
    });
  });

  describe('binding migration results', () => {
    it.each<{
      description: string;
      reset: (payload: {
        controller: MoneyAccountLifecycleController;
        gates: { isUnlocked: boolean };
        triggerKeyringChange: () => Promise<void>;
      }) => Promise<void>;
    }>([
      {
        description: 'clearState',
        reset: async ({ controller }): Promise<void> => {
          controller.clearState();
        },
      },
      {
        description: 'the wallet locks and unlocks',
        reset: async ({ gates, triggerKeyringChange }): Promise<void> => {
          gates.isUnlocked = false;
          await triggerKeyringChange();
          gates.isUnlocked = true;
          await triggerKeyringChange();
        },
      },
    ])('forgets the last results after $description', async ({ reset }) => {
      await withController(
        async ({ controller, gates, mocks, init, triggerKeyringChange }) => {
          await init();
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValue({
              identities: [MIGRATING_TO_SUCCESSOR_IDENTITY],
            });
          const migrator = buildBindingMigrator({ id: 'vba' });
          migrator.reconcile.mockResolvedValue({
            status: 'pending',
            reason: 'Busy',
          });
          controller.registerBindingMigrator(migrator);
          await controller.startMigration().catch(() => undefined);
          expect(getMigrators(controller).vba?.lastResult).toStrictEqual({
            status: 'pending',
            reason: 'Busy',
          });

          await reset({ controller, gates, triggerKeyringChange });
          await controller.refresh();

          expect(getMigrators(controller).vba?.lastResult).toBeNull();
        },
      );
    });

    it('records each result as soon as the migrator returns, including in the afterDone phase', async () => {
      await withController(
        { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATED_IDENTITY],
          });
          const migrator = buildBindingMigrator({
            id: 'rewards',
            phase: 'afterDone',
          });
          migrator.reconcile.mockImplementation(async () => {
            migrator.getStatus.mockReturnValue({ status: 'completed' });
            return { status: 'completed' };
          });
          controller.registerBindingMigrator(migrator);

          await controller.startMigration();

          expect(getMigrators(controller).rewards).toStrictEqual({
            phase: 'afterDone',
            status: 'completed',
            details: null,
            lastResult: { status: 'completed' },
            lastError: null,
          });
        },
      );
    });

    it('treats an invalid result as pending, reports it, and does not start the funds transfer', async () => {
      await withController(async ({ controller, mocks }) => {
        const migrator = buildBindingMigrator({
          id: 'vba',
          phase: 'beforeFundsTransfer',
        });
        migrator.reconcile.mockResolvedValue({ status: 'failed' } as never);
        controller.registerBindingMigrator(migrator);

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new BindingMigrationIncompleteError('beforeFundsTransfer', [
            {
              migratorId: 'vba',
              result: { status: 'pending', reason: 'Invalid result' },
            },
          ]),
        );
        expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error("Binding migrator 'vba' returned an invalid result"),
        );
      });
    });

    it('treats a migrator that returns something other than a promise like one', async () => {
      await withController(async ({ controller }) => {
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockReturnValue({ status: 'completed' } as never);
        controller.registerBindingMigrator(migrator);

        expect(await controller.startMigration()).toBeUndefined();
      });
    });

    it('records only the fields of a result', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({ identities: [MIGRATING_TO_SUCCESSOR_IDENTITY] });
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile.mockResolvedValue({
          status: 'completed',
          signature: '0xdeadbeef',
        } as BindingMigrationResult);
        controller.registerBindingMigrator(migrator);

        await controller.startMigration();

        expect(getMigrators(controller).vba?.lastResult).toStrictEqual({
          status: 'completed',
        });
      });
    });
  });

  describe('when the migration resumes after the funds transfer started', () => {
    it('only runs the afterDone migrators, as the earlier phases have passed', async () => {
      vi.useFakeTimers();
      try {
        const transferring: DerivedIdentity = {
          ...MIGRATING_TO_SUCCESSOR_IDENTITY,
          migration: {
            ...MIGRATION_TO_SUCCESSOR,
            transfer: { requestId: 'transfer-request-id', status: 'PENDING' },
          },
        };
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [transferring],
            });
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              buildMigratedIdentityResponse(),
            );
            const afterLink = buildBindingMigrator({ id: 'afterLink' });
            const beforeFundsTransfer = buildBindingMigrator({
              id: 'beforeFundsTransfer',
              phase: 'beforeFundsTransfer',
            });
            const afterDone = buildBindingMigrator({
              id: 'afterDone',
              phase: 'afterDone',
            });
            controller.registerBindingMigrator(afterLink);
            controller.registerBindingMigrator(beforeFundsTransfer);
            controller.registerBindingMigrator(afterDone);

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(2000);

            expect(await migration).toBeUndefined();
            expect(afterLink.reconcile).not.toHaveBeenCalled();
            expect(beforeFundsTransfer.reconcile).not.toHaveBeenCalled();
            expect(afterDone.reconcile).toHaveBeenCalledTimes(1);
            expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
          },
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('when the money account has migrated and another identity is migrating', () => {
    it('still runs the afterDone migrators', async () => {
      await withController(
        { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [
              MIGRATED_IDENTITY,
              {
                ...MIGRATING_IDENTITY,
                currentAddress: '0x00000000000000000000000000000000000000ee',
                migration: null,
              },
            ],
          });
          const migrator = buildBindingMigrator({ phase: 'afterDone' });
          controller.registerBindingMigrator(migrator);

          expect(await controller.startMigration()).toBeUndefined();
          expect(migrator.reconcile).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('when a migrator is still running from an earlier run', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits for that call instead of calling reconcile again', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({ identities: [MIGRATING_TO_SUCCESSOR_IDENTITY] });
        mocks.createMoneyAccount.mockResolvedValue({
          id: 'mpc-account-id',
          address: MFA_ACCOUNT_ADDRESS,
        } as never);
        const deferred = createDeferredPromise<BindingMigrationResult>();
        const slow = buildBindingMigrator({ id: 'slow', timeoutMs: 1000 });
        slow.reconcile.mockReturnValue(deferred.promise);
        controller.registerBindingMigrator(slow);

        const first = controller
          .startMigration()
          .catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(1000);
        expect(await first).toBeInstanceOf(BindingMigrationIncompleteError);

        const second = controller.startMigration();
        await vi.advanceTimersByTimeAsync(100);
        expect(slow.reconcile).toHaveBeenCalledTimes(1);
        deferred.resolve({ status: 'completed' });

        expect(await second).toBeUndefined();
        expect(slow.reconcile).toHaveBeenCalledTimes(1);
        expect(getMigrators(controller).slow?.lastResult).toStrictEqual({
          status: 'completed',
        });
      });
    });

    it('leaves no timer behind once a migrator settles', async () => {
      await withController(async ({ controller }) => {
        controller.registerBindingMigrator(buildBindingMigrator());

        await controller.startMigration();

        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });

  describe('when the state is cleared while a migration runs', () => {
    it('starts a new migration once the earlier one has stopped, instead of joining it', async () => {
      await withController(async ({ controller, mocks }) => {
        const deferred = createDeferredPromise<BindingMigrationResult>();
        const migrator = buildBindingMigrator({ id: 'vba' });
        migrator.reconcile
          .mockReturnValueOnce(deferred.promise)
          .mockResolvedValue({ status: 'completed' });
        controller.registerBindingMigrator(migrator);

        const first = controller
          .startMigration()
          .catch((error: unknown) => error);
        await vi.waitFor(() => expect(migrator.reconcile).toHaveBeenCalled());
        controller.clearState();
        const second = controller.startMigration();
        deferred.resolve({ status: 'completed' });

        expect(await first).toStrictEqual(
          new Error(
            'Money Account migration was interrupted because the state was cleared',
          ),
        );
        expect(await second).toBeUndefined();
        expect(mocks.createMoneyAccount).toHaveBeenCalledTimes(2);
        expect(migrator.reconcile).toHaveBeenCalledTimes(2);
      });
    });
  });
});
