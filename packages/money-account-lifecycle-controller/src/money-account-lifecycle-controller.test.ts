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
import type { MoneyAccountLifecycleControllerMessenger } from './money-account-lifecycle-controller.js';

const MONEY_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Aa';

const SUCCESSOR_ADDRESS = '0x00000000000000000000000000000000000000bb';

const IDENTITY = buildDerivedIdentity();

const OTHER_IDENTITY = buildDerivedIdentity({
  currentAddress: '0x0000000000000000000000000000000000000002',
  previousAddresses: ['0x0000000000000000000000000000000000000003'],
  status: 'MIGRATING',
});

describe('MoneyAccountLifecycleController', () => {
  describe('constructor', () => {
    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({ moneyAccounts: {} });
      });
    });

    it('accepts initial state', async () => {
      const state = {
        moneyAccounts: {
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' as const },
        },
      };

      await withController({ options: { state } }, ({ controller }) => {
        expect(controller.state).toStrictEqual(state);
      });
    });

    it('does not fetch derived identities before init is called', async () => {
      await withController(async ({ controller, mocks }) => {
        await flushPromises();

        expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
        expect(controller.derivedIdentities).toBeUndefined();
      });
    });
  });

  describe('init', () => {
    it('fetches derived identities when the feature is enabled and the wallet is ready', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [IDENTITY, OTHER_IDENTITY],
        });

        controller.init();
        await flushPromises();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
        expect(controller.derivedIdentities).toStrictEqual([
          IDENTITY,
          OTHER_IDENTITY,
        ]);
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
          expect(controller.derivedIdentities).toStrictEqual([IDENTITY]);
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
            identities: [OTHER_IDENTITY],
          });
          gates.remoteFeatureFlags = { someFlag: false };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(controller.derivedIdentities).toStrictEqual([OTHER_IDENTITY]);
        },
      );
    });

    it('clears derived identities when the wallet locks, and refetches when it unlocks', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerKeyringChange }) => {
          controller.init();
          await flushPromises();

          gates.isUnlocked = false;
          await triggerKeyringChange();

          expect(controller.derivedIdentities).toBeUndefined();

          gates.isUnlocked = true;
          await triggerKeyringChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(controller.derivedIdentities).toStrictEqual([IDENTITY]);
        },
      );
    });

    it('clears derived identities when the feature is disabled', async () => {
      await withController(async ({ controller, gates, triggerFlagChange }) => {
        controller.init();
        await flushPromises();

        gates.isEnabled = false;
        await triggerFlagChange();

        expect(controller.derivedIdentities).toBeUndefined();
      });
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
          resolve({ identities: [IDENTITY] });
          await flushPromises();

          expect(controller.derivedIdentities).toBeUndefined();
        },
      );
    });

    it('discards a response that was superseded by a fetch for newer flags', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const first = createDeferredPromise<DerivedIdentitiesResponse>();
          mocks.getDerivedIdentities
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ identities: [OTHER_IDENTITY] });

          controller.init();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();
          first.resolve({ identities: [IDENTITY] });
          await flushPromises();

          expect(controller.derivedIdentities).toStrictEqual([OTHER_IDENTITY]);
        },
      );
    });

    it('reports a failed fetch and retries on the next trigger', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          const error = new Error('Chomp is down');
          mocks.getDerivedIdentities
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({ identities: [IDENTITY] });

          controller.init();
          await flushPromises();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(controller.derivedIdentities).toBeUndefined();

          gates.remoteFeatureFlags = {};
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(controller.derivedIdentities).toStrictEqual([IDENTITY]);
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
            .mockResolvedValueOnce({ identities: [OTHER_IDENTITY] });

          controller.init();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();
          first.reject(error);
          await flushPromises();

          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(controller.derivedIdentities).toStrictEqual([OTHER_IDENTITY]);
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

  describe('money account lifecycle status', () => {
    it('records the money account as unregistered when it is not among any derived identity addresses', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [IDENTITY, OTHER_IDENTITY],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'unregistered' },
        });
      });
    });

    it('records the money account as unregistered when there are no derived identities', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'unregistered' },
        });
      });
    });

    it('records a valid SFA when the money account is the current address, ignoring case', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [
            buildDerivedIdentity({
              currentAddress: MONEY_ACCOUNT_ADDRESS.toLowerCase(),
              status: 'DONE',
            }),
          ],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
        });
      });
    });

    it('records a valid SFA when the money account is the current address of a migrating identity', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [
            buildDerivedIdentity({
              currentAddress: MONEY_ACCOUNT_ADDRESS,
              status: 'MIGRATING',
            }),
          ],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
        });
      });
    });

    it('records a valid MFA and publishes mfaDetected when the money account is a previous address', async () => {
      await withController(async ({ controller, mocks, rootMessenger }) => {
        const mfaDetected = jest.fn();
        rootMessenger.subscribe(
          'MoneyAccountLifecycleController:mfaDetected',
          mfaDetected,
        );
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [
            buildDerivedIdentity({
              currentAddress: SUCCESSOR_ADDRESS,
              previousAddresses: [MONEY_ACCOUNT_ADDRESS.toLowerCase()],
              status: 'DONE',
            }),
          ],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: {
            status: 'mfa',
            currentAddress: SUCCESSOR_ADDRESS,
          },
        });
        expect(mfaDetected).toHaveBeenCalledTimes(1);
        expect(mfaDetected).toHaveBeenCalledWith({
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          currentAddress: SUCCESSOR_ADDRESS,
        });
      });
    });

    it('records a valid SFA when the money account is the current address of one identity and a previous address of another', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [
            buildDerivedIdentity({
              currentAddress: SUCCESSOR_ADDRESS,
              previousAddresses: [MONEY_ACCOUNT_ADDRESS],
              status: 'DONE',
            }),
            buildDerivedIdentity({
              currentAddress: MONEY_ACCOUNT_ADDRESS,
              status: 'DONE',
            }),
          ],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
        });
      });
    });

    it('reports an error and does not record anything when the money account is a previous address of an identity that is not done', async () => {
      await withController(async ({ controller, mocks, rootMessenger }) => {
        const mfaDetected = jest.fn();
        rootMessenger.subscribe(
          'MoneyAccountLifecycleController:mfaDetected',
          mfaDetected,
        );
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [
            buildDerivedIdentity({
              currentAddress: SUCCESSOR_ADDRESS,
              previousAddresses: [MONEY_ACCOUNT_ADDRESS],
              status: 'MIGRATING',
            }),
          ],
        });

        controller.init();
        await flushPromises();

        expect(controller.state.moneyAccounts).toStrictEqual({});
        expect(mfaDetected).not.toHaveBeenCalled();
        expect(mocks.captureException).toHaveBeenCalledWith(
          new Error(
            `Money account ${MONEY_ACCOUNT_ADDRESS} is a previous address of a derived identity with status 'MIGRATING'`,
          ),
        );
      });
    });

    it('does not publish mfaDetected again when a refetch finds the same MFA', async () => {
      await withController(
        async ({
          controller,
          gates,
          mocks,
          rootMessenger,
          triggerFlagChange,
        }) => {
          const mfaDetected = jest.fn();
          rootMessenger.subscribe(
            'MoneyAccountLifecycleController:mfaDetected',
            mfaDetected,
          );
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [
              buildDerivedIdentity({
                currentAddress: SUCCESSOR_ADDRESS,
                previousAddresses: [MONEY_ACCOUNT_ADDRESS],
                status: 'DONE',
              }),
            ],
          });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          expect(mfaDetected).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('publishes mfaDetected again when the successor address changes', async () => {
      await withController(
        async ({
          controller,
          gates,
          mocks,
          rootMessenger,
          triggerFlagChange,
        }) => {
          const newSuccessorAddress =
            '0x00000000000000000000000000000000000000cc';
          const mfaDetected = jest.fn();
          rootMessenger.subscribe(
            'MoneyAccountLifecycleController:mfaDetected',
            mfaDetected,
          );
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({
              identities: [
                buildDerivedIdentity({
                  currentAddress: SUCCESSOR_ADDRESS,
                  previousAddresses: [MONEY_ACCOUNT_ADDRESS],
                  status: 'DONE',
                }),
              ],
            })
            .mockResolvedValueOnce({
              identities: [
                buildDerivedIdentity({
                  currentAddress: newSuccessorAddress,
                  previousAddresses: [MONEY_ACCOUNT_ADDRESS, SUCCESSOR_ADDRESS],
                  status: 'DONE',
                }),
              ],
            });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(controller.state.moneyAccounts).toStrictEqual({
            [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: {
              status: 'mfa',
              currentAddress: newSuccessorAddress,
            },
          });
          expect(mfaDetected).toHaveBeenCalledTimes(2);
          expect(mfaDetected).toHaveBeenLastCalledWith({
            moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
            currentAddress: newSuccessorAddress,
          });
        },
      );
    });

    it('updates the recorded status when a refetch changes it', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerFlagChange }) => {
          mocks.getDerivedIdentities
            .mockResolvedValueOnce({ identities: [] })
            .mockResolvedValueOnce({
              identities: [
                buildDerivedIdentity({ currentAddress: MONEY_ACCOUNT_ADDRESS }),
              ],
            });

          controller.init();
          await flushPromises();
          gates.remoteFeatureFlags = { someFlag: true };
          await triggerFlagChange();

          expect(controller.state.moneyAccounts).toStrictEqual({
            [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
          });
        },
      );
    });

    it('waits for the money account to exist before recording its status', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, gates, mocks, triggerMoneyAccountChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [
              buildDerivedIdentity({ currentAddress: MONEY_ACCOUNT_ADDRESS }),
            ],
          });

          controller.init();
          await flushPromises();

          expect(controller.state.moneyAccounts).toStrictEqual({});

          gates.moneyAccountAddress = MONEY_ACCOUNT_ADDRESS;
          await triggerMoneyAccountChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(controller.state.moneyAccounts).toStrictEqual({
            [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
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

    it('keeps the recorded status when the wallet locks', async () => {
      await withController(
        async ({ controller, gates, mocks, triggerKeyringChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [
              buildDerivedIdentity({ currentAddress: MONEY_ACCOUNT_ADDRESS }),
            ],
          });

          controller.init();
          await flushPromises();
          gates.isUnlocked = false;
          await triggerKeyringChange();

          expect(controller.state.moneyAccounts).toStrictEqual({
            [MONEY_ACCOUNT_ADDRESS.toLowerCase()]: { status: 'sfa' },
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
      .mockResolvedValue({ identities: [IDENTITY] }),
    getMoneyAccount: jest
      .fn<MoneyAccount | undefined, []>()
      .mockImplementation(() =>
        gates.moneyAccountAddress === undefined
          ? undefined
          : ({ address: gates.moneyAccountAddress } as MoneyAccount),
      ),
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
