import { KeyringTypes } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapControllerState } from '@metamask/snaps-controllers';

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

/**
 * Mock objects for all external dependencies of {@link SnapAccountService}.
 */
type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SnapController: {
    getState: jest.MockedFunction<() => SnapControllerState>;
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
    actions: ['SnapController:getState', 'KeyringController:getState'],
    events: ['SnapController:stateChange', 'KeyringController:stateChange'],
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { keyrings } as any,
    [],
  );
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.snapIsReady - Initial value of `SnapController.isReady`.
 * @param args.keyrings - Initial keyrings returned by `KeyringController:getState`.
 * @param args.config - Optional service config.
 * @returns The new service, root messenger, service messenger, and mocks.
 */
function setup({
  snapIsReady = true,
  keyrings = [{ type: KeyringTypes.snap }],
  config,
}: {
  snapIsReady?: boolean;
  keyrings?: { type: string }[];
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
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  const service = new SnapAccountService({ messenger, config });

  return { service, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as const;

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = setup();

      expect(await service.init()).toBeUndefined();
    });
  });

  describe('ensureReady', () => {
    it('resolves when platform is already ready', async () => {
      const { service } = setup();

      expect(await service.ensureReady(MOCK_SNAP_ID)).toBeUndefined();
    });

    it('waits for the Snap platform to become ready', async () => {
      const { service, rootMessenger } = setup({ snapIsReady: false });

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
      const { service, rootMessenger } = setup({ keyrings: [] });

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
        config: {
          snapPlatformWatcher: { snapKeyringWaitTimeoutMs: 1_000 },
        },
      });

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
        config: { snapPlatformWatcher: { ensureOnboardingComplete } },
      });

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
