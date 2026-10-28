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
import type { RegistrationStatus } from './money-account-upgrade-controller-registration-status.js';

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
  });

  describe('reconciliation', () => {
    it('registers an unregistered SFA money account and records the refreshed registration status', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getRegistrationStatus
          .mockResolvedValueOnce({ isRegistered: false })
          .mockResolvedValueOnce({ isRegistered: true });

        await init();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);
        expect(mocks.upgradeAccount).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        });
      });
    });

    it('registers an unregistered money account that is not in an identity', async () => {
      await withController(async ({ mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });
        mocks.getRegistrationStatus.mockResolvedValueOnce({
          isRegistered: false,
        });

        await init();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(mocks.upgradeAccount).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
      });
    });

    it('does not register a money account that is already registered', async () => {
      await withController(async ({ mocks, init }) => {
        await init();

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('does not register any address for an MFA', async () => {
      await withController(async ({ mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        await init();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('records the registration status of a migrating money account without registering it', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        await init();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(1);
        expect(mocks.getRegistrationStatus).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: false },
        });
        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it.each([
      { lifecycle: 'started migrating', identity: MIGRATING_IDENTITY },
      { lifecycle: 'become an MFA', identity: MFA_IDENTITY },
    ])(
      'does not register the money account when it has $lifecycle by the time its registration status arrives',
      async ({ identity }) => {
        await withController(async ({ mocks, init, refetch }) => {
          const { promise, resolve } =
            createDeferredPromise<RegistrationStatus>();
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
            .mockResolvedValueOnce({ identities: [identity] });
          mocks.getRegistrationStatus
            .mockReturnValueOnce(promise)
            .mockResolvedValue({ isRegistered: false });

          await init();
          await refetch();
          resolve({ isRegistered: false });
          await flushPromises();

          expect(mocks.upgradeAccount).not.toHaveBeenCalled();
        });
      },
    );

    it('does not register again when the refreshed registration status is still unregistered', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        await init();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);
        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: false },
        });
      });
    });

    it('does not start a second registration while one for the same address is in flight', async () => {
      await withController(async ({ mocks, init, refetch }) => {
        mocks.upgradeAccount.mockReturnValue(
          createDeferredPromise<void>().promise,
        );
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        await init();
        await refetch();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(1);
      });
    });

    it('reports a failed registration and retries on the next identity fetch', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        const error = new Error('Upgrade failed');
        mocks.upgradeAccount.mockRejectedValueOnce(error);
        mocks.getRegistrationStatus
          .mockResolvedValueOnce({ isRegistered: false })
          .mockResolvedValueOnce({ isRegistered: false })
          .mockResolvedValueOnce({ isRegistered: true });

        await init();

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: false },
        });

        await refetch();

        expect(mocks.upgradeAccount).toHaveBeenCalledTimes(2);
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        });
      });
    });
  });
});
