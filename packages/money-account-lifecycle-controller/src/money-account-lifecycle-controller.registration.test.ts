import { createDeferredPromise } from '@metamask/utils';
import { describe, it, expect } from 'vitest';

import {
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  SUCCESSOR_ADDRESS,
  SFA_IDENTITY,
  MFA_IDENTITY,
  MIGRATING_IDENTITY,
  flushPromises,
  withController,
} from '../tests/helpers.js';

describe('MoneyAccountLifecycleController', () => {
  describe('address registration', () => {
    it('records the registration status of the money account once for an SFA, keyed by lowercased address', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(1);
        expect(mocks.getRegistrationStatus).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        });
      });
    });

    it('records the registration status of both the money account and the current address of an MFA', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.getRegistrationStatus.mockImplementation(async (address) => ({
          isRegistered: address === SUCCESSOR_ADDRESS,
        }));

        await init();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: false },
          [SUCCESSOR_ADDRESS.toLowerCase()]: { isRegistered: true },
        });
      });
    });

    it('refreshes the registration status on every identity fetch', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        mocks.upgradeAccount.mockReturnValue(
          createDeferredPromise<void>().promise,
        );
        mocks.getRegistrationStatus
          .mockResolvedValueOnce({ isRegistered: true })
          .mockResolvedValueOnce({ isRegistered: false });

        await init();
        await refetch();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: false },
        });
      });
    });

    it('does not refresh the registration status when a money account change leaves the lifecycle unchanged', async () => {
      await withController(
        async ({ mocks, init, triggerMoneyAccountChange }) => {
          await init();
          await triggerMoneyAccountChange();

          expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('reports a failed lookup and keeps the previously recorded status', async () => {
      await withController(
        {
          options: {
            state: {
              addressRegistrations: {
                [MONEY_ACCOUNT_KEY]: { isRegistered: true },
              },
            },
          },
        },
        async ({ controller, mocks, init }) => {
          const error = new Error('Lookup failed');
          mocks.getRegistrationStatus.mockRejectedValue(error);

          await init();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(controller.state.addressRegistrations).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { isRegistered: true },
          });
        },
      );
    });

    it('reports a failed lookup of the current address of an MFA', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Lookup failed');
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.getRegistrationStatus
          .mockResolvedValueOnce({ isRegistered: true })
          .mockRejectedValueOnce(error);

        await init();

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        });
      });
    });
  });

  describe('upgradeMoneyAccount', () => {
    it('does not upgrade an unregistered money account on its own', async () => {
      await withController(async ({ mocks, init, refetch }) => {
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        await init();
        await refetch();

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it.each([
      { lifecycle: 'a valid SFA', identities: [SFA_IDENTITY] },
      { lifecycle: 'not in an identity', identities: [] },
    ])(
      'upgrades the money account when it is $lifecycle and records the refreshed registration status',
      async ({ identities }) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({ identities });
          mocks.getRegistrationStatus
            .mockResolvedValueOnce({ isRegistered: false })
            .mockResolvedValueOnce({ isRegistered: true });
          await init();

          await controller.upgradeMoneyAccount();

          expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);
          expect(mocks.upgradeAccount).toHaveBeenCalledWith(
            MONEY_ACCOUNT_ADDRESS,
          );
          expect(controller.state.addressRegistrations).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { isRegistered: true },
          });
        });
      },
    );

    it.each([
      { lifecycle: 'migrating', identity: MIGRATING_IDENTITY },
      { lifecycle: 'a valid MFA', identity: MFA_IDENTITY },
    ])(
      'resolves without upgrading when the recorded lifecycle is $lifecycle',
      async ({ identity }) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [identity],
          });
          await init();

          await controller.upgradeMoneyAccount();

          expect(mocks.upgradeAccount).not.toHaveBeenCalled();
        });
      },
    );

    it('uses the recorded lifecycle without fetching identities again', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [MFA_IDENTITY] })
          .mockResolvedValue({ identities: [SFA_IDENTITY] });
        await init();

        await controller.upgradeMoneyAccount();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('fetches identities fresh and records the lifecycle when none has been recorded', async () => {
      await withController(async ({ controller, mocks }) => {
        await controller.upgradeMoneyAccount();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
        });
        expect(mocks.upgradeAccount).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
      });
    });

    it('resolves without upgrading when the freshly fetched lifecycle is not upgradeable', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });

        await controller.upgradeMoneyAccount();

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('rejects with the error when fetching identities fails', async () => {
      await withController(async ({ controller, mocks }) => {
        const error = new Error('CHOMP unavailable');
        mocks.getDerivedIdentities.mockRejectedValue(error);

        await expect(controller.upgradeMoneyAccount()).rejects.toBe(error);
        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('rejects with the upgrade error unchanged, without reporting it', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Upgrade failed');
        mocks.upgradeAccount.mockRejectedValue(error);
        await init();

        await expect(controller.upgradeMoneyAccount()).rejects.toBe(error);
        expect(mocks.captureException).not.toHaveBeenCalled();
      });
    });

    it('reports a failed registration status refresh after upgrading, without rejecting', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();
        const error = new Error('Lookup failed');
        mocks.getRegistrationStatus.mockRejectedValueOnce(error);

        await controller.upgradeMoneyAccount();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);
        expect(mocks.captureException).toHaveBeenCalledWith(error);
      });
    });

    it('shares an in-flight upgrade across concurrent calls, and starts a new one once it settles', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeAccount.mockReturnValueOnce(promise);
        await init();

        const first = controller.upgradeMoneyAccount();
        const second = controller.upgradeMoneyAccount();
        await flushPromises();
        resolve();
        await Promise.all([first, second]);

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);

        await controller.upgradeMoneyAccount();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(2);
      });
    });

    it('starts a new upgrade after a failed one settles', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.upgradeAccount.mockRejectedValueOnce(new Error('Upgrade failed'));
        await init();

        await expect(controller.upgradeMoneyAccount()).rejects.toThrow(
          'Upgrade failed',
        );
        await controller.upgradeMoneyAccount();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(2);
      });
    });

    it.each([
      { reason: 'there is no money account', moneyAccountAddress: undefined },
      { reason: 'the feature is disabled', isEnabled: false },
      { reason: 'the wallet is locked', isUnlocked: false },
      { reason: 'there is no HD keyring', hasHdKeyring: false },
    ])(
      'resolves without fetching or upgrading when $reason',
      async ({ reason: _reason, ...gates }) => {
        await withController(gates, async ({ controller, mocks }) => {
          await controller.upgradeMoneyAccount();

          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
          expect(mocks.upgradeAccount).not.toHaveBeenCalled();
        });
      },
    );
  });
});
