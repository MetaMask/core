import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RestrictedController } from '@metamask/keyring-controller';

import { WatchOnlyAccountDisabledError } from './errors.js';
import type { WatchOnlyAccountServiceMessenger } from './WatchOnlyAccountService.js';
import { WatchOnlyAccountService } from './WatchOnlyAccountService.js';

const WATCH_ONLY_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const OTHER_ADDRESS = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<WatchOnlyAccountServiceMessenger>,
  MessengerEvents<WatchOnlyAccountServiceMessenger>
>;

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  KeyringController: {
    withController: jest.Mock;
    withKeyringV2: jest.Mock;
  };
};

type SetupOptions = {
  enabled?: boolean;
  keyringEntries?: { keyring: { type: string } }[];
  createdAccounts?: KeyringAccount[];
};

/**
 * Builds a minimal `KeyringAccount` for tests.
 *
 * @param address - The account address.
 * @returns A minimal keyring account.
 */
function buildKeyringAccount(address: string): KeyringAccount {
  return {
    id: `id-${address}`,
    type: 'eip155:eoa',
    address,
    scopes: ['eip155:0'],
    methods: [],
    options: {},
  };
}

/**
 * Builds a fake {@link KeyringEntry} with the given type.
 *
 * @param type - The keyring type.
 * @returns A minimal keyring entry for tests.
 */
function buildKeyringEntry(type: string): {
  keyring: { type: string };
  metadata: { id: string; name: string };
} {
  return {
    keyring: { type },
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
  initialEntries: { keyring: { type: string } }[] = [],
): {
  addNewKeyring: jest.MockedFunction<RestrictedController['addNewKeyring']>;
} {
  const entries = [...initialEntries];
  const addNewKeyring = jest.fn(async (type: string) => {
    const entry = buildKeyringEntry(type);
    entries.push(entry);
    return entry;
  });
  mocks.KeyringController.withController.mockImplementation(
    async (operation: (controller: RestrictedController) => unknown) =>
      await operation({
        get keyrings() {
          return Object.freeze([...entries]);
        },
        addNewKeyring,
        removeKeyring: jest.fn(),
      } as RestrictedController),
  );
  return { addNewKeyring };
}

/**
 * Configures `mocks.KeyringController.withKeyringV2` so that the operation
 * receives a mock v2 keyring.
 *
 * @param mocks - The mocks object from {@link setup}.
 * @param createAccounts - The mock `createAccounts` implementation for the
 * v2 keyring.
 */
function mockWithKeyringV2(mocks: Mocks, createAccounts: jest.Mock): void {
  mocks.KeyringController.withKeyringV2.mockImplementation(
    async (
      _selector: unknown,
      operation: ({ keyring }: { keyring: unknown }) => unknown,
    ) =>
      await operation({
        keyring: { type: 'watch-only', createAccounts },
        metadata: { id: 'watch-only-keyring-id', name: 'Watch-only Keyring' },
      }),
  );
}

/**
 * Constructs the service under test with its messenger and mocks.
 *
 * @param args - The arguments.
 * @param args.enabled - Whether the watch-only support is enabled.
 * @param args.keyringEntries - Initial keyring entries.
 * @param args.createdAccounts - The keyring accounts returned by the v2
 * keyring's `createAccounts`.
 * @returns The service, root messenger, mocks, and key jest fns.
 */
function setup({
  enabled = undefined,
  keyringEntries = [],
  createdAccounts = [],
}: SetupOptions = {}): {
  service: WatchOnlyAccountService;
  rootMessenger: RootMessenger;
  mocks: Mocks;
  addNewKeyring: jest.MockedFunction<RestrictedController['addNewKeyring']>;
  createAccounts: jest.Mock;
} {
  const rootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  }) as RootMessenger;

  const messenger = rootMessenger.buildChild({
    namespace: 'WatchOnlyAccountService',
    actions: [
      'KeyringController:withController',
      'KeyringController:withKeyringV2',
    ],
  });

  const mocks: Mocks = {
    KeyringController: {
      withController: jest.fn(),
      withKeyringV2: jest.fn(),
    },
  };

  rootMessenger.registerActionHandler(
    'KeyringController:withController',
    mocks.KeyringController.withController,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:withKeyringV2',
    mocks.KeyringController.withKeyringV2,
  );

  const { addNewKeyring } = mockWithController(mocks, keyringEntries);
  const createAccounts = jest.fn().mockResolvedValue(createdAccounts);
  mockWithKeyringV2(mocks, createAccounts);

  const service = new WatchOnlyAccountService({
    messenger,
    // Omit the key entirely when unset, so both the default and the
    // explicitly-provided branches are exercised.
    ...(enabled === undefined ? {} : { enabled }),
  });

  return { service, rootMessenger, mocks, addNewKeyring, createAccounts };
}

describe('WatchOnlyAccountService', () => {
  describe('constructor', () => {
    it('registers the exposed methods as action handlers', () => {
      const { rootMessenger } = setup({ enabled: true });

      expect(rootMessenger.call('WatchOnlyAccountService:isEnabled')).toBe(
        true,
      );
    });
  });

  describe('isEnabled', () => {
    it('returns false by default', () => {
      const { rootMessenger } = setup();

      expect(rootMessenger.call('WatchOnlyAccountService:isEnabled')).toBe(
        false,
      );
    });

    it('returns the value passed at construction time', () => {
      const { rootMessenger } = setup({ enabled: true });

      expect(rootMessenger.call('WatchOnlyAccountService:isEnabled')).toBe(
        true,
      );
    });
  });

  describe('createAccount', () => {
    it('throws a WatchOnlyAccountDisabledError when disabled', async () => {
      const { service, addNewKeyring, createAccounts } = setup({
        enabled: false,
      });

      await expect(service.createAccount(WATCH_ONLY_ADDRESS)).rejects.toThrow(
        WatchOnlyAccountDisabledError,
      );

      expect(addNewKeyring).not.toHaveBeenCalled();
      expect(createAccounts).not.toHaveBeenCalled();
    });

    it('creates the watch-only keyring if it does not exist yet', async () => {
      const { service, addNewKeyring } = setup({
        enabled: true,
        createdAccounts: [buildKeyringAccount(WATCH_ONLY_ADDRESS)],
      });

      await service.createAccount(WATCH_ONLY_ADDRESS);

      expect(addNewKeyring).toHaveBeenCalledTimes(1);
      expect(addNewKeyring).toHaveBeenCalledWith('watch-only');
    });

    it('reuses the existing watch-only keyring if present', async () => {
      const { service, addNewKeyring } = setup({
        enabled: true,
        keyringEntries: [buildKeyringEntry('watch-only')],
        createdAccounts: [buildKeyringAccount(WATCH_ONLY_ADDRESS)],
      });

      await service.createAccount(WATCH_ONLY_ADDRESS);

      expect(addNewKeyring).not.toHaveBeenCalled();
    });

    it('imports the account by address and returns it', async () => {
      const account = buildKeyringAccount(WATCH_ONLY_ADDRESS);
      const { service, createAccounts } = setup({
        enabled: true,
        createdAccounts: [account],
      });

      const result = await service.createAccount(WATCH_ONLY_ADDRESS);

      expect(createAccounts).toHaveBeenCalledWith({
        type: 'address:import',
        address: WATCH_ONLY_ADDRESS,
      });
      expect(result).toBe(account);
    });

    it('throws if no account was created by the keyring', async () => {
      const { service } = setup({ enabled: true });

      await expect(service.createAccount(WATCH_ONLY_ADDRESS)).rejects.toThrow(
        'No watch-only account was created.',
      );
    });

    it('propagates errors thrown by the keyring', async () => {
      const { service, createAccounts } = setup({
        enabled: true,
        createdAccounts: [buildKeyringAccount(WATCH_ONLY_ADDRESS)],
      });
      createAccounts.mockRejectedValue(new Error('Invalid address'));

      await expect(service.createAccount(WATCH_ONLY_ADDRESS)).rejects.toThrow(
        'Invalid address',
      );
    });

    it('propagates errors thrown while creating the keyring', async () => {
      const { service, mocks } = setup({ enabled: true });
      mocks.KeyringController.withController.mockRejectedValue(
        new Error('Keyring creation failed'),
      );

      await expect(service.createAccount(OTHER_ADDRESS)).rejects.toThrow(
        'Keyring creation failed',
      );
    });
  });
});
