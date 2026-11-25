import type { DerivedIdentity } from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MFA_ACCOUNT_ADDRESS,
  MFA_IDENTITY,
  MIGRATED_IDENTITY,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_ADDRESS,
  SFA_IDENTITY,
  buildBindingMigrator,
  buildLinkedIdentityResponse,
  buildMigratedIdentityResponse,
  getLifecycle,
  withController,
} from '../tests/helpers.js';
import { BindingMigrationIncompleteError } from './binding-migration.js';

const SUCCESSOR_CONTEXT = {
  migrationId:
    '0xf4bd66b23233da5810ca057e3d75295a14fe6f0db0e4f54e41477a5de84464bc',
  previousAddress: '0x00000000000000000000000000000000000000aa',
  currentAddress: '0x00000000000000000000000000000000000000dd',
};

const MIGRATING_TO_SUCCESSOR_IDENTITY: DerivedIdentity = {
  ...MIGRATING_IDENTITY,
  migration: {
    ...MIGRATING_IDENTITY.migration,
    to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
  },
};

const MIGRATION_CONTEXT = {
  migrationId:
    '0x10715ad7eb270b0d8c7fbb3859a25e442e8f640f03b5db0d5857d7acc092681e',
  previousAddress: '0x00000000000000000000000000000000000000aa',
  currentAddress: '0x00000000000000000000000000000000000000bb',
};

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
          vba: {
            phase: 'afterLink',
            status: {
              status: 'pending',
              details: { step: 'wallet-registration' },
            },
            lastResult: null,
            lastError: null,
          },
        });
      });
    });

    it('gives a valid MFA the money account as the previous address and the identity current address as the current address', async () => {
      await withController(async ({ controller, mocks, init }) => {
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
          expect(controller.state.bindingMigrations).toStrictEqual({});
        });
      },
    );

    it('records nothing while the wallet is locked', async () => {
      await withController(
        { isUnlocked: false },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });
          await init();
          const migrator = buildBindingMigrator();

          controller.registerBindingMigrator(migrator);

          expect(migrator.getStatus).not.toHaveBeenCalled();
          expect(controller.state.bindingMigrations).toStrictEqual({});
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
          expect(controller.state.bindingMigrations).toStrictEqual({});
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

        expect(Object.keys(controller.state.bindingMigrations)).toStrictEqual([
          'second',
          'first',
        ]);
      });
    });

    it('throws when a migrator with the same id is already registered', async () => {
      await withController(({ controller }) => {
        controller.registerBindingMigrator(buildBindingMigrator({ id: 'vba' }));

        expect(() =>
          controller.registerBindingMigrator(
            buildBindingMigrator({ id: 'vba' }),
          ),
        ).toThrow("A binding migrator with the id 'vba' is already registered");
      });
    });

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

        expect(controller.state.bindingMigrations).toStrictEqual({
          vba: {
            phase: 'afterLink',
            status: { status: 'unknown' },
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

          expect(controller.state.bindingMigrations).toHaveProperty('vba');
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

        expect(controller.state.bindingMigrations.vba?.status).toStrictEqual({
          status: 'unknown',
        });

        migrator.getStatus.mockReturnValue({ status: 'completed' });
        await controller.refresh();

        expect(controller.state.bindingMigrations.vba?.status).toStrictEqual({
          status: 'completed',
        });
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

        expect(controller.state.bindingMigrations).toStrictEqual({});
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

          expect(controller.state.bindingMigrations).toStrictEqual({});

          gates.isUnlocked = true;
          await triggerKeyringChange();

          expect(controller.state.bindingMigrations).toHaveProperty('vba');
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

        expect(controller.state.bindingMigrations).toStrictEqual({});

        await controller.refresh();

        expect(controller.state.bindingMigrations).toHaveProperty('vba');
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
          vba: {
            phase: 'afterLink',
            status: { status: 'completed' },
            lastResult: { status: 'completed' },
            lastError: null,
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
        expect(
          controller.state.bindingMigrations.blocked?.lastResult,
        ).toStrictEqual({ status: 'blocked', reason: 'Denied' });
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
        expect(controller.state.bindingMigrations.vba).toStrictEqual({
          phase: 'afterLink',
          status: { status: 'unknown' },
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
        expect(controller.state.bindingMigrations).toStrictEqual({});
      });
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

      it('does not run the afterDone migrators when the refetched identities do not show the migration finished', async () => {
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
            expect(migrator.reconcile).not.toHaveBeenCalled();
          },
        );
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
});
