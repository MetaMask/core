import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { DerivedIdentitiesResponse } from '@metamask/chomp-api-service';
import { createDeferredPromise } from '@metamask/utils';
import { describe, it, expect, vi } from 'vitest';

import {
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  SUCCESSOR_ADDRESS,
  SFA_IDENTITY,
  MFA_IDENTITY,
  MIGRATING_IDENTITY,
  getLifecycle,
  flushPromises,
  withController,
} from '../tests/helpers.js';
import { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

describe('MoneyAccountLifecycleController', () => {
  describe('constructor', () => {
    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          moneyAccounts: {},
          addressRegistrations: {},
        });
      });
    });

    it('accepts initial state', async () => {
      const state = {
        moneyAccounts: {
          [MONEY_ACCOUNT_KEY]: {
            type: 'sfa' as const,
            identity: SFA_IDENTITY,
          },
        },
        addressRegistrations: {
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        },
      };

      await withController({ options: { state } }, ({ controller }) => {
        expect(controller.state).toStrictEqual(state);
      });
    });

    it('does not fetch derived identities before init is called', async () => {
      await withController(async ({ mocks }) => {
        await flushPromises();

        expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
      });
    });
  });

  describe('init', () => {
    it('fetches derived identities when the feature is enabled and the wallet is ready', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'sfa',
          identity: SFA_IDENTITY,
        });
      });
    });

    it('passes the remote feature flags to the isEnabled hook', async () => {
      const remoteFeatureFlags = { someFlag: true };

      await withController({ remoteFeatureFlags }, async ({ mocks, init }) => {
        await init();

        expect(mocks.isEnabled).toHaveBeenCalledWith(remoteFeatureFlags);
      });
    });

    it('does not subscribe or fetch again when called more than once', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        controller.init();
        await init();
        await refetch();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
      });
    });

    it.each([
      { gate: 'isUnlocked', trigger: 'triggerKeyringChange' },
      { gate: 'hasHdKeyring', trigger: 'triggerKeyringChange' },
      { gate: 'isEnabled', trigger: 'triggerFlagChange' },
    ] as const)(
      'does not fetch while $gate is false, and fetches once it becomes true',
      async ({ gate, trigger }) => {
        await withController({ [gate]: false }, async (payload) => {
          const { controller, gates, mocks, init } = payload;
          await init();

          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();

          gates[gate] = true;
          await payload[trigger]();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        });
      },
    );

    it.each([
      { gate: 'isUnlocked', trigger: 'triggerKeyringChange' },
      { gate: 'isEnabled', trigger: 'triggerFlagChange' },
    ] as const)(
      'clears derived identities but keeps the recorded lifecycle while $gate is false, and refetches once it is true again',
      async ({ gate, trigger }) => {
        await withController(async (payload) => {
          const { controller, gates, mocks, init, triggerMoneyAccountChange } =
            payload;
          await init();

          gates[gate] = false;
          await payload[trigger]();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(1);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });

          gates[gate] = true;
          await payload[trigger]();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(2);
        });
      },
    );

    it('refetches when the remote feature flags change', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();

        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        await refetch();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: MFA_IDENTITY,
        });
      });
    });

    it('does not refetch when the remote feature flags refresh without changing, even while a fetch is in flight', async () => {
      await withController(async ({ controller, mocks, triggerFlagChange }) => {
        mocks.getDerivedIdentities.mockReturnValue(
          createDeferredPromise<DerivedIdentitiesResponse>().promise,
        );

        controller.init();
        await triggerFlagChange();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
      });
    });

    it('discards a response that arrives after the wallet has locked', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerKeyringChange }) => {
          const { promise, resolve } =
            createDeferredPromise<DerivedIdentitiesResponse>();
          mocks.getDerivedIdentities.mockReturnValue(promise);

          controller.init();
          gates.isUnlocked = false;
          await triggerKeyringChange();
          resolve({ identities: [SFA_IDENTITY] });
          await flushPromises();

          expect(controller.state.moneyAccounts).toStrictEqual({});
        },
      );
    });

    it('discards a response that was superseded by a fetch for newer flags', async () => {
      await withController(async ({ controller, mocks, refetch }) => {
        const first = createDeferredPromise<DerivedIdentitiesResponse>();
        mocks.getDerivedIdentities
          .mockReturnValueOnce(first.promise)
          .mockResolvedValueOnce({ identities: [MFA_IDENTITY] });

        controller.init();
        await refetch();
        first.resolve({ identities: [SFA_IDENTITY] });
        await flushPromises();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: MFA_IDENTITY,
        });
      });
    });

    it('reports a failed fetch and retries on the next trigger', async () => {
      await withController(
        async ({ controller, mocks, init, triggerFlagChange }) => {
          const error = new Error('Chomp is down');
          mocks.getDerivedIdentities
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] });

          await init();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(controller.state.moneyAccounts).toStrictEqual({});

          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        },
      );
    });

    it('does not let a superseded failed fetch force a refetch', async () => {
      await withController(
        async ({ controller, mocks, refetch, triggerFlagChange }) => {
          const first = createDeferredPromise<DerivedIdentitiesResponse>();
          const error = new Error('Chomp is down');
          mocks.getDerivedIdentities
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ identities: [MFA_IDENTITY] });

          controller.init();
          await refetch();
          first.reject(error);
          await flushPromises();
          await triggerFlagChange();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: MFA_IDENTITY,
          });
        },
      );
    });

    it('reports an error thrown while checking whether to fetch, without throwing', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.isEnabled.mockImplementation(() => {
          throw new Error('isEnabled failed');
        });

        expect(() => controller.init()).not.toThrow();
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error('isEnabled failed'),
        );
        expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
      });
    });

    it('wraps a non-Error rejection in an Error when reporting it', async () => {
      await withController(async ({ mocks, init }) => {
        mocks.getDerivedIdentities.mockRejectedValue('Chomp is down');

        await init();

        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error('Chomp is down'),
        );
      });
    });
  });

  describe('getMoneyAccountIdentity', () => {
    it.each([
      { lifecycle: { type: 'sfa', identity: SFA_IDENTITY } },
      { lifecycle: { type: 'migrating', identity: MIGRATING_IDENTITY } },
      { lifecycle: { type: 'mfa', identity: MFA_IDENTITY } },
    ] as const)(
      'projects the identity of a recorded $lifecycle.type money account',
      async ({ lifecycle }) => {
        await withController(
          {
            options: {
              state: { moneyAccounts: { [MONEY_ACCOUNT_KEY]: lifecycle } },
            },
          },
          ({ rootMessenger }) => {
            expect(
              rootMessenger.call(
                'MoneyAccountLifecycleController:getMoneyAccountIdentity',
              ),
            ).toStrictEqual({
              currentAddress: lifecycle.identity.currentAddress,
              previousAddresses: lifecycle.identity.previousAddresses,
              status: lifecycle.identity.status,
            });
          },
        );
      },
    );

    it('projects the identity recorded from the latest fetch', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });

        await init();

        expect(controller.getMoneyAccountIdentity()).toStrictEqual({
          currentAddress: SUCCESSOR_ADDRESS,
          previousAddresses: [MONEY_ACCOUNT_ADDRESS],
          status: 'DONE',
        });
      });
    });

    it('projects the money account as its own unregistered identity when it is not in an identity', async () => {
      await withController(
        {
          options: {
            state: {
              moneyAccounts: { [MONEY_ACCOUNT_KEY]: { type: 'notInIdentity' } },
            },
          },
        },
        ({ controller }) => {
          expect(controller.getMoneyAccountIdentity()).toStrictEqual({
            currentAddress: MONEY_ACCOUNT_KEY,
            previousAddresses: [],
            status: 'NONE',
          });
        },
      );
    });

    it('returns undefined when no lifecycle has been recorded for the money account', async () => {
      await withController(({ controller }) => {
        expect(controller.getMoneyAccountIdentity()).toBeUndefined();
      });
    });

    it('returns undefined when there is no money account', async () => {
      await withController(
        {
          moneyAccountAddress: undefined,
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
              },
            },
          },
        },
        ({ controller }) => {
          expect(controller.getMoneyAccountIdentity()).toBeUndefined();
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "addressRegistrations": {},
            "moneyAccounts": {},
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "addressRegistrations": {},
            "moneyAccounts": {},
          }
        `);
      });
    });

    it('exposes expected state to the UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });
  });

  describe('MoneyAccountLifecycleController:init', () => {
    it('calls init on the controller', async () => {
      const initSpy = vi.spyOn(
        MoneyAccountLifecycleController.prototype,
        'init',
      );

      await withController(({ rootMessenger }) => {
        rootMessenger.call('MoneyAccountLifecycleController:init');

        expect(initSpy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
