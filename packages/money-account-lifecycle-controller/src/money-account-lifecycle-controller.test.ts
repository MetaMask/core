import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
  IntentEntry,
} from '@metamask/chomp-api-service';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { MoneyAccount } from '@metamask/money-account-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerState,
} from '@metamask/remote-feature-flag-controller';
import { createDeferredPromise } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerMessenger } from './money-account-lifecycle-controller.js';
import type { RegistrationStatus } from './money-account-upgrade-controller-registration-status.js';

const MONEY_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Aa';

const MONEY_ACCOUNT_KEY = MONEY_ACCOUNT_ADDRESS.toLowerCase();

const SUCCESSOR_ADDRESS = '0x00000000000000000000000000000000000000Bb';

const SFA_IDENTITY: DerivedIdentity = {
  currentAddress: MONEY_ACCOUNT_ADDRESS,
  previousAddresses: [],
  status: 'DONE',
  migration: null,
};

const MFA_IDENTITY: DerivedIdentity = {
  currentAddress: SUCCESSOR_ADDRESS,
  previousAddresses: [MONEY_ACCOUNT_ADDRESS],
  status: 'DONE',
  migration: null,
};

const MFA_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Dd';

const MIGRATING_IDENTITY: DerivedIdentity = {
  currentAddress: MONEY_ACCOUNT_ADDRESS,
  previousAddresses: [],
  status: 'MIGRATING',
  migration: {
    from: MONEY_ACCOUNT_ADDRESS,
    to: SUCCESSOR_ADDRESS,
    requiredSteps: ['SUCCESSOR_DEPOSIT_INTENT', 'ROOT_DELEGATION'],
    completedSteps: [],
    missingSteps: ['SUCCESSOR_DEPOSIT_INTENT', 'ROOT_DELEGATION'],
  },
};

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

  describe('money account lifecycle', () => {
    it('records the money account as not in an identity', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'notInIdentity' },
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('reports an error and does not record anything when the money account cannot be read', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Money account unavailable');
        mocks.getMoneyAccount.mockImplementation(() => {
          throw error;
        });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({});
        expect(mocks.getRegistrationStatus).not.toHaveBeenCalled();
        expect(mocks.captureException).toHaveBeenCalledWith(error);
      });
    });

    it('records a valid SFA without switching to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('records a money account that is migrating to a successor without switching to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: {
            type: 'migrating',
            identity: MIGRATING_IDENTITY,
          },
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('records a valid MFA and switches to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'mfa', identity: MFA_IDENTITY },
        });
        expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        expect(mocks.useMpcKeyring).toHaveBeenCalledWith({
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          mpcAddress: SUCCESSOR_ADDRESS,
        });
      });
    });

    it('records a valid MFA and switches to the MPC keyring when its identity is migrating to a further address', async () => {
      const migratingIdentity: DerivedIdentity = {
        ...MFA_IDENTITY,
        status: 'MIGRATING',
        migration: {
          from: SUCCESSOR_ADDRESS,
          to: '0x00000000000000000000000000000000000000cc',
          requiredSteps: ['ROOT_DELEGATION'],
          completedSteps: [],
          missingSteps: ['ROOT_DELEGATION'],
        },
      };

      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [migratingIdentity],
        });

        await init();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: migratingIdentity,
        });
        expect(mocks.useMpcKeyring).toHaveBeenCalledWith({
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          mpcAddress: SUCCESSOR_ADDRESS,
        });
        expect(mocks.captureException).not.toHaveBeenCalled();
      });
    });

    it('switches to the MPC keyring on init when the persisted state already records the MFA', async () => {
      await withController(
        {
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: { type: 'mfa', identity: MFA_IDENTITY },
              },
            },
          },
        },
        async ({ mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not switch to the MPC keyring again when a money account change leaves the MFA unchanged', async () => {
      await withController(
        async ({ mocks, init, triggerMoneyAccountChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(2);
          expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('switches to the new MPC address when the successor address changes', async () => {
      const newSuccessorAddress = '0x00000000000000000000000000000000000000cc';
      const newIdentity: DerivedIdentity = {
        currentAddress: newSuccessorAddress,
        previousAddresses: [MONEY_ACCOUNT_ADDRESS, SUCCESSOR_ADDRESS],
        status: 'DONE',
        migration: null,
      };

      await withController(async ({ controller, mocks, init, refetch }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [MFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [newIdentity] });

        await init();
        await refetch();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: newIdentity,
        });
        expect(mocks.useMpcKeyring).toHaveBeenLastCalledWith({
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          mpcAddress: newSuccessorAddress,
        });
      });
    });

    it('reports a failure to switch to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Switch failed');
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.useMpcKeyring.mockRejectedValue(error);

        await init();

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: MFA_IDENTITY,
        });
      });
    });

    it('waits for the money account to exist before recording its lifecycle and registration status', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({
          controller,
          gates,
          mocks,
          init,
          triggerMoneyAccountChange,
        }) => {
          await init();

          expect(controller.state).toStrictEqual({
            moneyAccounts: {},
            addressRegistrations: {},
          });

          gates.moneyAccountAddress = MONEY_ACCOUNT_ADDRESS;
          await triggerMoneyAccountChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(controller.state).toStrictEqual({
            moneyAccounts: {
              [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
            },
            addressRegistrations: {
              [MONEY_ACCOUNT_KEY]: { isRegistered: true },
            },
          });
        },
      );
    });

    it('ignores money account changes before derived identities have been fetched', async () => {
      await withController(
        { isUnlocked: false },
        async ({ controller, mocks, init, triggerMoneyAccountChange }) => {
          await init();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).not.toHaveBeenCalled();
          expect(controller.state.moneyAccounts).toStrictEqual({});
        },
      );
    });
  });

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

    it('does not register the money account when it has started migrating by the time its registration status arrives', async () => {
      await withController(async ({ mocks, init, refetch }) => {
        const { promise, resolve } =
          createDeferredPromise<RegistrationStatus>();
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });
        mocks.getRegistrationStatus
          .mockReturnValueOnce(promise)
          .mockResolvedValue({ isRegistered: false });

        await init();
        await refetch();
        resolve({ isRegistered: false });
        await flushPromises();

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('does not register the money account when it has become an MFA by the time its registration status arrives', async () => {
      await withController(async ({ mocks, init, refetch }) => {
        const { promise, resolve } =
          createDeferredPromise<RegistrationStatus>();
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MFA_IDENTITY] });
        mocks.getRegistrationStatus
          .mockReturnValueOnce(promise)
          .mockResolvedValue({ isRegistered: false });

        await init();
        await refetch();
        resolve({ isRegistered: false });
        await flushPromises();

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

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

  describe('startMigration', () => {
    it('creates an MFA account and stops at the unimplemented migration once the pre-checks pass', async () => {
      await withController(async ({ rootMessenger, mocks }) => {
        await expect(
          rootMessenger.call('MoneyAccountLifecycleController:startMigration'),
        ).rejects.toThrow(
          `Migrating Money Account ${MONEY_ACCOUNT_ADDRESS} to ${MFA_ACCOUNT_ADDRESS} is not implemented yet`,
        );

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(mocks.createMfaAccount).toHaveBeenCalledTimes(1);
        expect(mocks.getIntentsByAddress).toHaveBeenCalledWith(
          MFA_ACCOUNT_ADDRESS,
        );
      });
    });

    it('records the freshly fetched identities', async () => {
      await withController(
        {
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
              },
            },
          },
        },
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            'A Money Account identity is already migrating',
          );

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'migrating',
            identity: MIGRATING_IDENTITY,
          });
        },
      );
    });

    it.each([
      { description: 'the money account', identities: [MIGRATING_IDENTITY] },
      {
        description: 'another identity',
        identities: [
          SFA_IDENTITY,
          {
            ...MFA_IDENTITY,
            currentAddress: '0x00000000000000000000000000000000000000ee',
            previousAddresses: [],
            status: 'MIGRATING',
          },
        ],
      },
    ] as const)(
      'does not start a second migration while $description is migrating',
      async ({ identities }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [...identities],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            'A Money Account identity is already migrating',
          );
          expect(mocks.createMfaAccount).not.toHaveBeenCalled();
        });
      },
    );

    it.each([
      { type: 'notInIdentity', identities: [] },
      { type: 'mfa', identities: [MFA_IDENTITY] },
    ] as const)(
      'does not migrate a money account that is $type',
      async ({ type, identities }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [...identities],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `Money Account ${MONEY_ACCOUNT_ADDRESS} cannot be migrated while it is '${type}'`,
          );
          expect(mocks.createMfaAccount).not.toHaveBeenCalled();
        });
      },
    );

    it('throws when there is no money account', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, mocks }) => {
          await expect(controller.startMigration()).rejects.toThrow(
            'There is no Money Account to migrate',
          );
          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
        },
      );
    });

    it.each([
      { description: 'the feature is disabled', isEnabled: false },
      { description: 'the wallet is locked', isUnlocked: false },
      { description: 'there is no HD keyring', hasHdKeyring: false },
    ])('throws when $description', async ({ description, ...gates }) => {
      await withController(gates, async ({ controller, mocks }) => {
        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
      });
    });

    it.each([
      {
        description: 'the current address of an identity',
        identity: {
          ...MFA_IDENTITY,
          currentAddress: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
          previousAddresses: [],
        },
      },
      {
        description: 'a previous address of an identity',
        identity: {
          ...MFA_IDENTITY,
          currentAddress: '0x00000000000000000000000000000000000000ee',
          previousAddresses: [MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex],
        },
      },
    ] as const)(
      'does not migrate to an MFA address that is $description',
      async ({ identity }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [SFA_IDENTITY, identity],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `MFA account ${MFA_ACCOUNT_ADDRESS} is already part of a Money Account identity`,
          );
        });
      },
    );

    it('does not migrate to an MFA address that already has intents', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getIntentsByAddress.mockResolvedValue([
          { account: MFA_ACCOUNT_ADDRESS } as IntentEntry,
        ]);

        await expect(controller.startMigration()).rejects.toThrow(
          `MFA account ${MFA_ACCOUNT_ADDRESS} already has CHOMP intents`,
        );
      });
    });

    it('does not start a migration while another is in flight, and allows one once it settles', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<Hex>();
        mocks.createMfaAccount.mockReturnValueOnce(promise);

        const first = controller.startMigration();
        await expect(controller.startMigration()).rejects.toThrow(
          'A Money Account migration is already in progress',
        );
        resolve(MFA_ACCOUNT_ADDRESS);
        await expect(first).rejects.toThrow('is not implemented yet');

        await expect(controller.startMigration()).rejects.toThrow(
          'is not implemented yet',
        );
        expect(mocks.createMfaAccount).toHaveBeenCalledTimes(2);
      });
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
      const initSpy = jest.spyOn(
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

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountLifecycleControllerMessenger>,
  MessengerEvents<MoneyAccountLifecycleControllerMessenger>
>;

type Gates = {
  isEnabled: boolean;
  isUnlocked: boolean;
  hasHdKeyring: boolean;
  remoteFeatureFlags: FeatureFlags;
  moneyAccountAddress: string | undefined;
};

type Mocks = {
  getDerivedIdentities: jest.Mock<Promise<DerivedIdentitiesResponse>, []>;
  getIntentsByAddress: jest.Mock<Promise<IntentEntry[]>, [Hex]>;
  createMfaAccount: jest.Mock<Promise<Hex>, []>;
  getMoneyAccount: jest.Mock<MoneyAccount | undefined, []>;
  getRegistrationStatus: jest.Mock<Promise<RegistrationStatus>, [string]>;
  upgradeAccount: jest.Mock<Promise<void>, [Hex]>;
  useMpcKeyring: jest.Mock<
    Promise<void>,
    [{ moneyAccountAddress: string; mpcAddress: string }]
  >;
  isEnabled: jest.Mock<boolean, [FeatureFlags]>;
  captureException: jest.Mock<void, [Error]>;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: MoneyAccountLifecycleController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountLifecycleControllerMessenger;
  mocks: Mocks;
  gates: Gates;
  triggerKeyringChange: () => Promise<void>;
  triggerFlagChange: () => Promise<void>;
  triggerMoneyAccountChange: () => Promise<void>;
  init: () => Promise<void>;
  refetch: () => Promise<void>;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountLifecycleController>[0]
  >;
} & Partial<Gates>;

function getLifecycle(
  controller: MoneyAccountLifecycleController,
): MoneyAccountLifecycle | undefined {
  return controller.state.moneyAccounts[MONEY_ACCOUNT_KEY];
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function buildKeyringControllerState(gates: Gates): KeyringControllerState {
  return {
    isUnlocked: gates.isUnlocked,
    keyrings:
      gates.isUnlocked && gates.hasHdKeyring
        ? [{ type: KeyringTypes.hd, accounts: [], metadata: { id: 'hd' } }]
        : [],
  } as unknown as KeyringControllerState;
}

function buildRemoteFeatureFlagControllerState(
  gates: Gates,
): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: gates.remoteFeatureFlags,
    cacheTimestamp: 0,
  };
}

function getRootMessenger(
  captureException: Mocks['captureException'],
): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException,
  });
}

function getMessenger(
  rootMessenger: RootMessenger,
): MoneyAccountLifecycleControllerMessenger {
  const messenger: MoneyAccountLifecycleControllerMessenger = new Messenger({
    namespace: 'MoneyAccountLifecycleController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ChompApiService:getDerivedIdentities',
      'ChompApiService:getIntentsByAddress',
      'KeyringController:getState',
      'MfaMigrationController:createMfaAccount',
      'MoneyAccountController:getMoneyAccount',
      'MoneyAccountController:useMpcKeyring',
      'MoneyAccountUpgradeController:getRegistrationStatus',
      'MoneyAccountUpgradeController:upgradeAccount',
      'RemoteFeatureFlagController:getState',
    ],
    events: [
      'KeyringController:stateChange',
      'MoneyAccountController:stateChange',
      'RemoteFeatureFlagController:stateChange',
    ],
    messenger,
  });
  return messenger;
}

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    {
      options = {},
      isEnabled = true,
      isUnlocked = true,
      hasHdKeyring = true,
      remoteFeatureFlags = {},
      ...gateOverrides
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
  const gates: Gates = {
    isEnabled,
    isUnlocked,
    hasHdKeyring,
    remoteFeatureFlags,
    moneyAccountAddress:
      'moneyAccountAddress' in gateOverrides
        ? gateOverrides.moneyAccountAddress
        : MONEY_ACCOUNT_ADDRESS,
  };

  const mocks: Mocks = {
    getDerivedIdentities: jest
      .fn<Promise<DerivedIdentitiesResponse>, []>()
      .mockResolvedValue({ identities: [SFA_IDENTITY] }),
    getIntentsByAddress: jest
      .fn<Promise<IntentEntry[]>, [Hex]>()
      .mockResolvedValue([]),
    createMfaAccount: jest
      .fn<Promise<Hex>, []>()
      .mockResolvedValue(MFA_ACCOUNT_ADDRESS),
    getMoneyAccount: jest
      .fn<MoneyAccount | undefined, []>()
      .mockImplementation(() =>
        gates.moneyAccountAddress === undefined
          ? undefined
          : ({ address: gates.moneyAccountAddress } as MoneyAccount),
      ),
    getRegistrationStatus: jest
      .fn<Promise<RegistrationStatus>, [string]>()
      .mockResolvedValue({ isRegistered: true }),
    upgradeAccount: jest
      .fn<Promise<void>, [Hex]>()
      .mockResolvedValue(undefined),
    useMpcKeyring: jest
      .fn<
        Promise<void>,
        [{ moneyAccountAddress: string; mpcAddress: string }]
      >()
      .mockResolvedValue(undefined),
    isEnabled: jest
      .fn<boolean, [FeatureFlags]>()
      .mockImplementation(() => gates.isEnabled),
    captureException: jest.fn<void, [Error]>(),
  };

  const rootMessenger = getRootMessenger(mocks.captureException);
  rootMessenger.registerActionHandler(
    'ChompApiService:getDerivedIdentities',
    mocks.getDerivedIdentities,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getIntentsByAddress',
    mocks.getIntentsByAddress,
  );
  rootMessenger.registerActionHandler(
    'MfaMigrationController:createMfaAccount',
    mocks.createMfaAccount,
  );
  rootMessenger.registerActionHandler('KeyringController:getState', () =>
    buildKeyringControllerState(gates),
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:getMoneyAccount',
    mocks.getMoneyAccount,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:useMpcKeyring',
    mocks.useMpcKeyring,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountUpgradeController:getRegistrationStatus',
    mocks.getRegistrationStatus,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountUpgradeController:upgradeAccount',
    mocks.upgradeAccount,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => buildRemoteFeatureFlagControllerState(gates),
  );

  const triggerKeyringChange = async (): Promise<void> => {
    rootMessenger.publish(
      'KeyringController:stateChange',
      buildKeyringControllerState(gates),
      [],
    );
    await flushPromises();
  };

  const triggerFlagChange = async (): Promise<void> => {
    rootMessenger.publish(
      'RemoteFeatureFlagController:stateChange',
      buildRemoteFeatureFlagControllerState(gates),
      [],
    );
    await flushPromises();
  };

  const triggerMoneyAccountChange = async (): Promise<void> => {
    rootMessenger.publish(
      'MoneyAccountController:stateChange',
      { moneyAccounts: {} },
      [],
    );
    await flushPromises();
  };

  const messenger = getMessenger(rootMessenger);
  const controller = new MoneyAccountLifecycleController({
    messenger,
    hooks: { isEnabled: mocks.isEnabled },
    ...options,
  });

  const init = async (): Promise<void> => {
    controller.init();
    await flushPromises();
  };

  let refetchCount = 0;
  const refetch = async (): Promise<void> => {
    refetchCount += 1;
    gates.remoteFeatureFlags = { refetchCount };
    await triggerFlagChange();
  };

  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    mocks,
    gates,
    triggerKeyringChange,
    triggerFlagChange,
    triggerMoneyAccountChange,
    init,
    refetch,
  });
}
