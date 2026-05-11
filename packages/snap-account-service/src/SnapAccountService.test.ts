import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  KeyringControllerState,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type {
  KeyringEntry,
  RestrictedController,
} from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { TruncatedSnap } from '@metamask/snaps-utils';

import type {
  SnapAccountServiceMessenger,
  SnapAccountServiceOptions,
} from './SnapAccountService';
import { SnapAccountService } from './SnapAccountService';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

/** Mock keyring controller state type for tests. */
type MockKeyringControllerState = Pick<KeyringControllerState, 'keyrings'>;

/** Mock truncated snap type for tests. */
type MockTruncatedSnap = Pick<
  TruncatedSnap,
  'id' | 'initialPermissions' | 'enabled' | 'blocked'
>;

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SnapController: {
    getState: jest.MockedFunction<() => SnapControllerState>;
    getRunnableSnaps: jest.MockedFunction<() => TruncatedSnap[]>;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  KeyringController: {
    getState: jest.MockedFunction<() => { keyrings: { type: string }[] }>;
    withController: jest.Mock;
  };
};

/**
 * Constructs the root messenger for the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test, and delegates all
 * required external actions and events from the root messenger to it.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SnapAccountServiceMessenger {
  const messenger = new Messenger({
    namespace: 'SnapAccountService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'SnapController:getState',
      'SnapController:getSnap',
      'SnapController:getRunnableSnaps',
      'KeyringController:getState',
      'KeyringController:withController',
    ],
    events: [
      'SnapController:stateChange',
      'SnapController:snapInstalled',
      'SnapController:snapEnabled',
      'SnapController:snapDisabled',
      'SnapController:snapBlocked',
      'SnapController:snapUnblocked',
      'SnapController:snapUninstalled',
      'KeyringController:stateChange',
    ],
  });
  return messenger;
}

/**
 * Publishes a SnapController stateChange event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param isReady - Whether the Snap platform is ready.
 */
function publishSnapIsReady(
  rootMessenger: RootMessenger,
  isReady: boolean,
): void {
  rootMessenger.publish(
    'SnapController:stateChange',
    { isReady } as SnapControllerState,
    [],
  );
}

/**
 * Publishes a KeyringController stateChange event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param keyrings - The keyrings to publish.
 */
function publishKeyrings(
  rootMessenger: RootMessenger,
  keyrings: { type: string }[],
): void {
  rootMessenger.publish(
    'KeyringController:stateChange',
    { keyrings } as MockKeyringControllerState as KeyringControllerState,
    [],
  );
}

/**
 * Builds a minimal `TruncatedSnap` for tests.
 *
 * @param id - The Snap ID.
 * @param hasKeyring - Whether the Snap declares the `endowment:keyring` initial permission.
 * @returns A minimal `TruncatedSnap`.
 */
function buildSnap(id: string, hasKeyring: boolean): TruncatedSnap {
  return {
    id: id as SnapId,
    initialPermissions: hasKeyring ? { 'endowment:keyring': {} } : {},
    enabled: true,
    blocked: false,
  } as MockTruncatedSnap as TruncatedSnap;
}

/**
 * Builds a fake {@link KeyringEntry} with the given type.
 *
 * @param type - The keyring type.
 * @returns A minimal KeyringEntry for tests.
 */
function buildKeyringEntry(type: string): KeyringEntry {
  return {
    keyring: { type } as KeyringEntry['keyring'],
    metadata: { id: `id-${type}`, name: type },
  };
}

/**
 * Configures `mocks.KeyringController.withController` to invoke the
 * operation with a controllable {@link RestrictedController}.
 *
 * @param mocks - The mocks object from {@link setup}.
 * @param initialEntries - Entries exposed via `controller.keyrings`.
 * @returns The mocked `addNewKeyring` jest fn for assertions.
 */
function mockWithController(
  mocks: Mocks,
  initialEntries: KeyringEntry[],
): {
  addNewKeyring: jest.MockedFunction<RestrictedController['addNewKeyring']>;
} {
  const entries = [...initialEntries];
  const addNewKeyring = jest.fn(async (type: string) => {
    const entry = buildKeyringEntry(type);
    entries.push(entry);
    return entry;
  });
  mocks.KeyringController.withController.mockImplementation(async (operation) =>
    operation({
      get keyrings() {
        return Object.freeze([...entries]);
      },
      addNewKeyring,
      removeKeyring: jest.fn(),
    }),
  );
  return { addNewKeyring };
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.snapIsReady - Initial value of `SnapController.isReady`.
 * @param args.keyrings - Initial keyrings returned by `KeyringController:getState`.
 * @param args.runnableSnaps - Snaps returned by `SnapController:getRunnableSnaps`.
 * @param args.config - Optional service config.
 * @returns The new service, root messenger, service messenger, and mocks.
 */
function setup({
  snapIsReady = true,
  keyrings = [{ type: KeyringTypes.snap }],
  runnableSnaps = [],
  config,
}: {
  snapIsReady?: boolean;
  keyrings?: { type: string }[];
  runnableSnaps?: TruncatedSnap[];
  config?: SnapAccountServiceOptions['config'];
} = {}): {
  service: SnapAccountService;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
  mocks: Mocks;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);

  const mocks: Mocks = {
    SnapController: {
      getState: jest
        .fn()
        .mockReturnValue({ isReady: snapIsReady } as SnapControllerState),
      getRunnableSnaps: jest.fn().mockReturnValue(runnableSnaps),
    },
    KeyringController: {
      getState: jest.fn().mockReturnValue({ keyrings }),
      withController: jest.fn(),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    mocks.SnapController.getRunnableSnaps,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:withController',
    mocks.KeyringController.withController,
  );

  const service = new SnapAccountService({ messenger, config });

  return { service, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = setup();

      expect(await service.init()).toBeUndefined();
    });
  });

  describe('getSnaps', () => {
    it('exposes tracked Snaps seeded by init', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });
  });

  describe('ensureReady', () => {
    it('throws when the Snap is not tracked', async () => {
      const { service } = setup();

      await service.init();

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('throws before init even for runnable Snaps', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('resolves when platform is already ready', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      expect(await service.ensureReady(MOCK_SNAP_ID)).toBeUndefined();
    });

    it('waits for the Snap platform to become ready', async () => {
      const { service, rootMessenger } = setup({
        snapIsReady: false,
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      expect(resolved).toBe(false);

      publishSnapIsReady(rootMessenger, true);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('waits for the Snap keyring to appear via KeyringController:stateChange', async () => {
      const { service, rootMessenger } = setup({
        keyrings: [],
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      // Flush microtasks so #waitForSnapKeyring subscribes.
      await Promise.resolve();
      await Promise.resolve();

      expect(resolved).toBe(false);

      publishKeyrings(rootMessenger, [{ type: KeyringTypes.snap }]);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('rejects if the Snap keyring does not appear within snapKeyringWaitTimeoutMs', async () => {
      const { service } = setup({
        keyrings: [],
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
        config: {
          snapPlatformWatcher: { snapKeyringWaitTimeoutMs: 1_000 },
        },
      });

      await service.init();

      jest.useFakeTimers();
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID);
      // Attach rejection handler before advancing timers to avoid unhandled rejection.
      // eslint-disable-next-line jest/valid-expect -- assertion is awaited after advancing timers
      const expectRejection = expect(ensurePromise).rejects.toThrow(
        'Snap platform or keyrings still not ready. Aborting.',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000 + 1);
      jest.useRealTimers();

      await expectRejection;
    });

    it('awaits config.snapPlatformWatcher.ensureOnboardingComplete before resolving', async () => {
      let resolveOnboarding: (() => void) | undefined;
      const ensureOnboardingComplete = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOnboarding = resolve;
          }),
      );

      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
        config: { snapPlatformWatcher: { ensureOnboardingComplete } },
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      await Promise.resolve();
      expect(ensureOnboardingComplete).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      resolveOnboarding?.();

      await ensurePromise;
      expect(resolved).toBe(true);
    });
  });

  describe('getLegacySnapKeyring', () => {
    it('returns the existing Snap keyring when one is already present', async () => {
      const { service, mocks } = setup();
      const existing = buildKeyringEntry(KeyringTypes.snap);
      const { addNewKeyring } = mockWithController(mocks, [
        buildKeyringEntry(KeyringTypes.hd),
        existing,
      ]);

      const result = await service.getLegacySnapKeyring();

      expect(result).toBe(existing.keyring as unknown as SnapKeyring);
      expect(addNewKeyring).not.toHaveBeenCalled();
    });

    it('creates a new Snap keyring when none exists', async () => {
      const { service, mocks } = setup();
      const { addNewKeyring } = mockWithController(mocks, [
        buildKeyringEntry(KeyringTypes.hd),
      ]);

      const result = await service.getLegacySnapKeyring();

      expect(addNewKeyring).toHaveBeenCalledWith(KeyringTypes.snap);
      expect(result.type).toBe(KeyringTypes.snap);
    });

    it('propagates errors thrown by withController', async () => {
      const { service, mocks } = setup();
      mocks.KeyringController.withController.mockImplementation(async () => {
        throw new Error('boom');
      });

      await expect(service.getLegacySnapKeyring()).rejects.toThrow('boom');
    });
  });
});
