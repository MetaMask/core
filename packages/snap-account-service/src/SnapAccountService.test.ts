import {
  KeyringControllerState,
  KeyringTypes,
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

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

/** Mock keyring controller state type for tests. */
type MockKeyringControllerState = Pick<KeyringControllerState, 'keyrings'>;

/** Mock truncated snap type for tests. */
type MockTruncatedSnap = Pick<TruncatedSnap, 'id' | 'initialPermissions'>;

/**
 * Mock objects for all external dependencies of {@link SnapAccountService}.
 */
type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SnapController: {
    getState: jest.MockedFunction<() => SnapControllerState>;
    getSnap: jest.MockedFunction<(snapId: string) => TruncatedSnap | null>;
    getRunnableSnaps: jest.MockedFunction<() => TruncatedSnap[]>;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  KeyringController: {
    getState: jest.MockedFunction<() => { keyrings: { type: string }[] }>;
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
  } as MockTruncatedSnap as TruncatedSnap;
}

/**
 * Publishes a `SnapController:snapInstalled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was installed.
 */
function publishSnapInstalled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapInstalled', snap, 'origin', false);
}

/**
 * Publishes a `SnapController:snapEnabled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was enabled.
 */
function publishSnapEnabled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapEnabled', snap);
}

/**
 * Publishes a `SnapController:snapDisabled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was disabled.
 */
function publishSnapDisabled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapDisabled', snap);
}

/**
 * Publishes a `SnapController:snapBlocked` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snapId - The ID of the Snap that was blocked.
 */
function publishSnapBlocked(
  rootMessenger: RootMessenger,
  snapId: string,
): void {
  rootMessenger.publish('SnapController:snapBlocked', snapId);
}

/**
 * Publishes a `SnapController:snapUnblocked` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snapId - The ID of the Snap that was unblocked.
 */
function publishSnapUnblocked(
  rootMessenger: RootMessenger,
  snapId: string,
): void {
  rootMessenger.publish('SnapController:snapUnblocked', snapId);
}

/**
 * Publishes a `SnapController:snapUninstalled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was uninstalled.
 */
function publishSnapUninstalled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapUninstalled', snap);
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
      getSnap: jest.fn().mockReturnValue(null),
      getRunnableSnaps: jest.fn().mockReturnValue(runnableSnaps),
    },
    KeyringController: {
      getState: jest.fn().mockReturnValue({ keyrings }),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );
  rootMessenger.registerActionHandler(
    'SnapController:getSnap',
    mocks.SnapController.getSnap as never,
  );
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    mocks.SnapController.getRunnableSnaps,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  const service = new SnapAccountService({ messenger, config });

  return { service, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = setup();

      expect(await service.init()).toBeUndefined();
    });

    it('seeds tracked Snaps from getRunnableSnaps, filtering out non-keyring Snaps', async () => {
      const { service } = setup({
        runnableSnaps: [
          buildSnap(MOCK_SNAP_ID, true),
          buildSnap(MOCK_OTHER_SNAP_ID, false),
        ],
      });

      await service.init();

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });
  });

  describe('getSnaps', () => {
    it('returns an empty array before init', () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      expect(service.getSnaps()).toStrictEqual([]);
    });
  });

  describe('lifecycle events', () => {
    it('ignores add events received before init', async () => {
      const { service, rootMessenger } = setup();

      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      await service.init();

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('ignores remove events received before init', async () => {
      const { service, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      // Publish a removal event *before* init: it must be ignored, so once
      // init seeds from `getRunnableSnaps` the Snap is still tracked.
      publishSnapUninstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      await service.init();

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('adds a Snap on snapInstalled when it has the keyring endowment', async () => {
      const { service, rootMessenger } = setup();

      await service.init();
      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('does not add a Snap on snapInstalled when it lacks the keyring endowment', async () => {
      const { service, rootMessenger } = setup();

      await service.init();
      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, false));

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('adds a Snap on snapEnabled when it has the keyring endowment', async () => {
      const { service, rootMessenger } = setup();

      await service.init();
      publishSnapEnabled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('removes a Snap on snapDisabled', async () => {
      const { service, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();
      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);

      publishSnapDisabled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('removes a Snap on snapBlocked', async () => {
      const { service, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();
      publishSnapBlocked(rootMessenger, MOCK_SNAP_ID);

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('ignores snapUnblocked received before init', async () => {
      const { service, rootMessenger, mocks } = setup();

      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);
      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      await service.init();

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('re-adds a Snap on snapUnblocked when it is enabled and has the keyring endowment', async () => {
      const { service, rootMessenger, mocks } = setup();

      await service.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('does not re-add a Snap on snapUnblocked when it is disabled', async () => {
      const { service, rootMessenger, mocks } = setup();

      await service.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: false,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('does not re-add a Snap on snapUnblocked when it lacks the keyring endowment', async () => {
      const { service, rootMessenger, mocks } = setup();

      await service.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, false),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('does not re-add a Snap on snapUnblocked when getSnap returns null', async () => {
      const { service, rootMessenger } = setup();

      await service.init();
      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(service.getSnaps()).toStrictEqual([]);
    });

    it('removes a Snap on snapUninstalled', async () => {
      const { service, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();
      publishSnapUninstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(service.getSnaps()).toStrictEqual([]);
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
});
