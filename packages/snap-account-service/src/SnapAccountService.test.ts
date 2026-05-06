import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapControllerState } from '@metamask/snaps-controllers';

import type { SnapAccountServiceMessenger } from './SnapAccountService';
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
    actions: ['SnapController:getState'],
    events: ['SnapController:stateChange'],
  });
  return messenger;
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes.
 * @returns The new service, root messenger, service messenger, and mocks.
 */
function setup({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof SnapAccountService>[0]>;
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
        .mockReturnValue({ isReady: true } as SnapControllerState),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );

  const service = new SnapAccountService({ messenger, ...options });

  return { service, rootMessenger, messenger, mocks };
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
      const rootMessenger = getRootMessenger();
      const messenger = getMessenger(rootMessenger);
      rootMessenger.registerActionHandler(
        'SnapController:getState',
        () => ({ isReady: false }) as SnapControllerState,
      );

      const service = new SnapAccountService({ messenger });

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
  });
});
