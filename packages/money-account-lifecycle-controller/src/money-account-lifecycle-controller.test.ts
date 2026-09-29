import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
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
        expect(controller.state).toStrictEqual({});
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

    it('does not change state', async () => {
      await withController(async ({ controller }) => {
        controller.init();
        await flushPromises();

        expect(controller.state).toStrictEqual({});
      });
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
};

type Mocks = {
  getDerivedIdentities: jest.Mock<Promise<DerivedIdentitiesResponse>, []>;
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
      'RemoteFeatureFlagController:getState',
    ],
    events: [
      'KeyringController:stateChange',
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
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
  const gates: Gates = {
    isEnabled,
    isUnlocked,
    hasHdKeyring,
    remoteFeatureFlags,
  };

  const mocks: Mocks = {
    getDerivedIdentities: jest
      .fn<Promise<DerivedIdentitiesResponse>, []>()
      .mockResolvedValue({ identities: [IDENTITY] }),
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
  });
}
