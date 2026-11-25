import type { DerivedIdentity } from '@metamask/chomp-api-service';
import { describe, expect, it } from 'vitest';

import {
  MFA_IDENTITY,
  MIGRATING_IDENTITY,
  SFA_IDENTITY,
  buildBindingMigrator,
  withController,
} from '../tests/helpers.js';

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
});
