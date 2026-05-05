import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

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
 * Constructs the root messenger for the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SnapAccountServiceMessenger {
  return new Messenger({
    namespace: 'SnapAccountService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes.
 * @returns The new service, root messenger, and service messenger.
 */
function setup({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof SnapAccountService>[0]>;
} = {}): {
  service: SnapAccountService;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new SnapAccountService({ messenger, ...options });

  return { service, rootMessenger, messenger };
}

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = setup();

      expect(await service.init()).toBeUndefined();
    });
  });
});
