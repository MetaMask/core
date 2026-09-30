import { deriveStateFromMetadata } from '@metamask/base-controller';
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

import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
} from './chomp-api-service-derived-identities.js';
import { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';
import type {
  MoneyAccountLifecycle,
  MoneyAccountLifecycleControllerMessenger,
} from './money-account-lifecycle-controller.js';
import type { RegistrationStatus } from './money-account-upgrade-controller-registration-status.js';

const MONEY_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Aa';

const MONEY_ACCOUNT_KEY = MONEY_ACCOUNT_ADDRESS.toLowerCase();

const SUCCESSOR_ADDRESS = '0x00000000000000000000000000000000000000Bb';

const SFA_IDENTITY = buildDerivedIdentity({
  currentAddress: MONEY_ACCOUNT_ADDRESS,
  status: 'DONE',
});

const MFA_IDENTITY = buildDerivedIdentity({
  currentAddress: SUCCESSOR_ADDRESS,
  previousAddresses: [MONEY_ACCOUNT_ADDRESS],
  status: 'DONE',
});

const UNRELATED_IDENTITY = buildDerivedIdentity();

const OTHER_UNRELATED_IDENTITY = buildDerivedIdentity({
  currentAddress: '0x0000000000000000000000000000000000000002',
  previousAddresses: ['0x0000000000000000000000000000000000000003'],
  status: 'MIGRATING',
});

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
      await withController(async ({ controller, mocks }) => {
        controller.init();
        await flushPromises();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'sfa',
          identity: SFA_IDENTITY,
        });
      });
    });

    it('passes the remote feature flags to the isEnabled hook', async () => {
      const remoteFeatureFlags = { someFlag: true };

      await withController(
        { remoteFeatureFlags },
        async ({ controller, mocks }) => {
          controller.init();
          await flushPromises();

          expect(mocks.isEnabled).toHaveBeenCalledWith(remoteFeatureFlags);
        },
      );
    });

    it('does not subscribe or fetch again when called more than once', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          controller.init();
          controller.init();
          await flushPromises();

          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('does not fetch while the wallet is locked, and fetches once it unlocks', async () => {
      await withController(
        { isUnlocked: false },
        async ({ controller, gates, mocks, triggerKeyringChange }) => {
          controller.init();
          await flushPromises();

          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();

          gates.isUnlocked = true;
          await triggerKeyringChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        },
      );
    });

    it('does not fetch without an HD keyring, and fetches once one is added while unlocked', async () => {
      await withController(
        { hasHdKeyring: false },
        async ({ controller, gates, mocks, triggerKeyringChange }) => {
          controller.init();
          await flushPromises();

          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();

          gates.hasHdKeyring = true;
          await triggerKeyringChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not fetch while the feature is disabled, and fetches once it is enabled', async () => {
      await withController(
        { isEnabled: false },
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          controller.init();
          await flushPromises();

          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();

          gates.isEnabled = true;
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('ignores keyring changes that do not affect whether the wallet is ready', async () => {
      await withController(
        async ({ controller, mocks, triggerKeyringChange }) => {
          controller.init();
          await flushPromises();

          await triggerKeyringChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not refetch when the remote feature flags refresh without changing', async () => {
      await withController(
        { remoteFeatureFlags: { someFlag: true } },
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          controller.init();
          await flushPromises();

          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('refetches when the remote feature flags change', async () => {
      await withController(
        { remoteFeatureFlags: { someFlag: true } },
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          controller.init();
          await flushPromises();

          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });
          gates.remoteFeatureFlags = { someFlag: false };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: MFA_IDENTITY,
          });
        },
      );
    });

    it('clears derived identities when the wallet locks, and refetches when it unlocks', async () => {
      await withController(
        async ({
          controller,
          gates,
          mocks,
          triggerKeyringChange,
          triggerMoneyAccountChange,
        }) => {
          controller.init();
          await flushPromises();

          gates.isUnlocked = false;
          await triggerKeyringChange();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(1);

          gates.isUnlocked = true;
          await triggerKeyringChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('clears derived identities when the feature is disabled', async () => {
      await withController(
        async ({
          controller,
          gates,
          mocks,
          triggerFlagChange,
          triggerMoneyAccountChange,
        }) => {
          controller.init();
          await flushPromises();

          gates.isEnabled = false;
          await triggerFlagChange();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not start a second fetch while one with the same flags is in flight', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const { promise } =
            createDeferredPromise<DerivedIdentitiesResponse>();
          mocks.getDerivedIdentities.mockReturnValue(promise);

          controller.init();
          gates.remoteFeatureFlags = {};
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
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
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const first = createDeferredPromise<DerivedIdentitiesResponse>();
          mocks.getDerivedIdentities
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ identities: [MFA_IDENTITY] });

          controller.init();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();
          first.resolve({ identities: [SFA_IDENTITY] });
          await flushPromises();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: MFA_IDENTITY,
          });
        },
      );
    });

    it('reports a failed fetch and retries on the next trigger', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const error = new Error('Chomp is down');
          mocks.getDerivedIdentities
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] });

          controller.init();
          await flushPromises();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(controller.state.moneyAccounts).toStrictEqual({});

          gates.remoteFeatureFlags = {};
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
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const first = createDeferredPromise<DerivedIdentitiesResponse>();
          const error = new Error('Chomp is down');
          mocks.getDerivedIdentities
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ identities: [MFA_IDENTITY] });

          controller.init();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();
          first.reject(error);
          await flushPromises();

          gates.remoteFeatureFlags = { someFlag: true };
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
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockRejectedValue('Chomp is down');

        controller.init();
        await flushPromises();

        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error('Chomp is down'),
        );
      });
    });
  });

  describe('money account lifecycle', () => {
    it('records the money account as not in an identity when it is not among any derived identity addresses', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [UNRELATED_IDENTITY, OTHER_UNRELATED_IDENTITY],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'notInIdentity' },
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('records the money account as not in an identity when there are no derived identities', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'notInIdentity' },
        });
      });
    });

    it('records a valid SFA with its identity when the money account is the current address, ignoring case', async () => {
      const identity = buildDerivedIdentity({
        currentAddress: MONEY_ACCOUNT_KEY,
        status: 'DONE',
      });

      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [UNRELATED_IDENTITY, identity],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity },
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('records a valid SFA when the money account is the current address of a migrating identity', async () => {
      const identity = buildDerivedIdentity({
        currentAddress: MONEY_ACCOUNT_ADDRESS,
        status: 'MIGRATING',
      });

      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [identity],
        });

        controller.init();
        await flushPromises();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'sfa',
          identity,
        });
      });
    });

    it('records a valid MFA with its identity and switches to the MPC keyring when the money account is a previous address, ignoring case', async () => {
      const identity = buildDerivedIdentity({
        currentAddress: SUCCESSOR_ADDRESS,
        previousAddresses: [MONEY_ACCOUNT_KEY],
        status: 'DONE',
      });

      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [identity],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'mfa', identity },
        });
        expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        expect(mocks.useMpcKeyring).toHaveBeenCalledWith({
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          mpcAddress: SUCCESSOR_ADDRESS,
        });
      });
    });

    it('records a valid SFA when the money account is the current address of one identity and a previous address of another', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY, SFA_IDENTITY],
        });

        controller.init();
        await flushPromises();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'sfa',
          identity: SFA_IDENTITY,
        });
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
      });
    });

    it('reports an error and does not record anything when the money account is a previous address of an identity that is not done', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [{ ...MFA_IDENTITY, status: 'MIGRATING' }],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({});
        expect(mocks.useMpcKeyring).not.toHaveBeenCalled();
        expect(mocks.getRegistrationStatus).not.toHaveBeenCalled();
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error(
            `Money account ${MONEY_ACCOUNT_ADDRESS} is a previous address of a derived identity with status 'MIGRATING'`,
          ),
        );
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
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          controller.init();
          await flushPromises();

          expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('switches to the MPC keyring again when a refetch finds the same MFA', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('does not switch to the MPC keyring again when a money account change leaves the MFA unchanged', async () => {
      await withController(
        async ({ controller, mocks, triggerMoneyAccountChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          controller.init();
          await flushPromises();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).toHaveBeenCalledTimes(2);
          expect(mocks.useMpcKeyring).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('switches to the new MPC address when the successor address changes', async () => {
      const newSuccessorAddress = '0x00000000000000000000000000000000000000cc';
      const newIdentity = buildDerivedIdentity({
        currentAddress: newSuccessorAddress,
        previousAddresses: [MONEY_ACCOUNT_ADDRESS, SUCCESSOR_ADDRESS],
        status: 'DONE',
      });

      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [MFA_IDENTITY] })
            .mockResolvedValueOnce({ identities: [newIdentity] });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: newIdentity,
          });
          expect(mocks.useMpcKeyring).toHaveBeenLastCalledWith({
            moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
            mpcAddress: newSuccessorAddress,
          });
        },
      );
    });

    it('reports a failure to switch to the MPC keyring', async () => {
      await withController(async ({ controller, mocks }) => {
        const error = new Error('Switch failed');
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.useMpcKeyring.mockRejectedValue(error);

        controller.init();
        await flushPromises();

        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'mfa',
          identity: MFA_IDENTITY,
        });
      });
    });

    it('updates the recorded lifecycle when a refetch changes it', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [] })
            .mockResolvedValueOnce({ identities: [SFA_IDENTITY] });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        },
      );
    });

    it('waits for the money account to exist before recording its lifecycle', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, gates, mocks, triggerMoneyAccountChange }) => {
          controller.init();
          await flushPromises();

          expect(controller.state.moneyAccounts).toStrictEqual({});

          gates.moneyAccountAddress = MONEY_ACCOUNT_ADDRESS;
          await triggerMoneyAccountChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        },
      );
    });

    it('ignores money account changes before derived identities have been fetched', async () => {
      await withController(
        { isUnlocked: false },
        async ({ controller, mocks, triggerMoneyAccountChange }) => {
          controller.init();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).not.toHaveBeenCalled();
          expect(controller.state.moneyAccounts).toStrictEqual({});
        },
      );
    });

    it('keeps the recorded lifecycle when the wallet locks', async () => {
      await withController(
        async ({ controller, gates, triggerKeyringChange }) => {
          controller.init();
          await flushPromises();
          gates.isUnlocked = false;
          await triggerKeyringChange();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
        },
      );
    });
  });

  describe('current address registration', () => {
    it('records the registration status of the current address of an SFA, keyed by lowercased address', async () => {
      await withController(async ({ controller, mocks }) => {
        controller.init();
        await flushPromises();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(controller.state.addressRegistrations).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { isRegistered: true },
        });
      });
    });

    it('records the registration status of the current address of an MFA', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MFA_IDENTITY],
        });
        mocks.getRegistrationStatus.mockResolvedValue({ isRegistered: false });

        controller.init();
        await flushPromises();

        expect(mocks.getRegistrationStatus).toHaveBeenCalledWith(
          SUCCESSOR_ADDRESS,
        );
        expect(controller.state.addressRegistrations).toStrictEqual({
          [SUCCESSOR_ADDRESS.toLowerCase()]: { isRegistered: false },
        });
      });
    });

    it('does not look up a registration status when the money account is not in an identity', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });

        controller.init();
        await flushPromises();

        expect(mocks.getRegistrationStatus).not.toHaveBeenCalled();
        expect(controller.state.addressRegistrations).toStrictEqual({});
      });
    });

    it('refreshes the registration status on every identity fetch', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          mocks.getRegistrationStatus
            .mockResolvedValueOnce({ isRegistered: false })
            .mockResolvedValueOnce({ isRegistered: true });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(2);
          expect(controller.state.addressRegistrations).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { isRegistered: true },
          });
        },
      );
    });

    it('does not refresh the registration status when a money account change leaves the lifecycle unchanged', async () => {
      await withController(
        async ({ controller, mocks, triggerMoneyAccountChange }) => {
          controller.init();
          await flushPromises();
          await triggerMoneyAccountChange();

          expect(mocks.getRegistrationStatus).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('looks up the registration status when a money account change records a new lifecycle', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, gates, mocks, triggerMoneyAccountChange }) => {
          controller.init();
          await flushPromises();

          expect(mocks.getRegistrationStatus).not.toHaveBeenCalled();

          gates.moneyAccountAddress = MONEY_ACCOUNT_ADDRESS;
          await triggerMoneyAccountChange();

          expect(controller.state.addressRegistrations).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { isRegistered: true },
          });
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
        async ({ controller, mocks }) => {
          const error = new Error('Lookup failed');
          mocks.getRegistrationStatus.mockRejectedValue(error);

          controller.init();
          await flushPromises();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(controller.state.addressRegistrations).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { isRegistered: true },
          });
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
  getMoneyAccount: jest.Mock<MoneyAccount | undefined, []>;
  getRegistrationStatus: jest.Mock<Promise<RegistrationStatus>, [string]>;
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
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountLifecycleController>[0]
  >;
} & Partial<Gates>;

function buildDerivedIdentity(
  overrides: Partial<DerivedIdentity> = {},
): DerivedIdentity {
  return {
    currentAddress: '0x0000000000000000000000000000000000000001',
    previousAddresses: [],
    status: 'NONE',
    ...overrides,
  };
}

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
      'KeyringController:getState',
      'MoneyAccountController:getMoneyAccount',
      'MoneyAccountController:useMpcKeyring',
      'MoneyAccountUpgradeController:getRegistrationStatus',
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

  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    mocks,
    gates,
    triggerKeyringChange,
    triggerFlagChange,
    triggerMoneyAccountChange,
  });
}
