import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { MoneyAccount, MoneyAccountControllerMessenger } from '.';
import {
  MoneyAccountController,
  getDefaultMoneyAccountControllerState,
} from '.';

const MOCK_ENTROPY_SOURCE_ID = 'entropy-source-1';
const MOCK_OTHER_ENTROPY_SOURCE_ID = 'entropy-source-2';
const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';

const MOCK_HD_KEYRING = {
  type: 'HD Key Tree',
  accounts: [MOCK_ADDRESS],
  metadata: { id: MOCK_ENTROPY_SOURCE_ID, name: 'HD Key Tree' },
};

const MOCK_MONEY_ACCOUNT: MoneyAccount = {
  id: 'e9b8f87e-f08d-4e98-a3e4-3c2d3a4e5b6f',
  type: 'eip155:eoa',
  address: MOCK_ADDRESS,
  scopes: ['eip155:0'],
  options: {
    entropy: {
      type: 'mnemonic',
      id: MOCK_ENTROPY_SOURCE_ID,
      groupIndex: 0,
      derivationPath: "m/44'/4392018'/0'/0",
    },
    exportable: false,
  },
  methods: [
    'eth_signTransaction',
    'personal_sign',
    'eth_signTypedData_v1',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
};

const MOCK_MONEY_ACCOUNT_2: MoneyAccount = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  type: 'eip155:eoa',
  address: '0x1111111111111111111111111111111111111111',
  scopes: ['eip155:0'],
  options: {
    entropy: {
      type: 'mnemonic',
      id: MOCK_OTHER_ENTROPY_SOURCE_ID,
      groupIndex: 0,
      derivationPath: "m/44'/4392018'/0'/0",
    },
    exportable: false,
  },
  methods: [
    'eth_signTransaction',
    'personal_sign',
    'eth_signTypedData_v1',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountControllerMessenger>,
  MessengerEvents<MoneyAccountControllerMessenger>
>;

// `withKeyring`'s callback requires an `EthKeyring`, but our mock keyrings
// only implement the subset of methods the controller actually calls.
function asKeyring(keyring: object): EthKeyring {
  return keyring as unknown as EthKeyring;
}

class MockMoneyKeyring {
  readonly type = 'Money Keyring';

  readonly entropySource: string;

  readonly #accounts: string[];

  constructor({
    accounts = [MOCK_ADDRESS],
    entropySource = MOCK_ENTROPY_SOURCE_ID,
  }: { accounts?: string[]; entropySource?: string } = {}) {
    this.entropySource = entropySource;
    this.#accounts = [...accounts];
  }

  async getAccounts(): Promise<string[]> {
    return [...this.#accounts];
  }

  async addAccounts(_n: number): Promise<string[]> {
    this.#accounts.push(MOCK_ADDRESS);
    return [MOCK_ADDRESS];
  }
}

type SetupOptions = {
  accounts?: MoneyAccount[];
  isUnlocked?: boolean;
  keyrings?: {
    type: string;
    accounts: string[];
    metadata: { id: string; name: string };
  }[];
};

type AllMoneyAccountControllerActions =
  MessengerActions<MoneyAccountControllerMessenger>;

type AllMoneyAccountControllerEvents =
  MessengerEvents<MoneyAccountControllerMessenger>;

function setup({
  accounts = [],
  isUnlocked = true,
  keyrings = [MOCK_HD_KEYRING],
}: SetupOptions = {}): {
  controller: MoneyAccountController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountControllerMessenger;
  mocks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    KeyringController: {
      withKeyring: jest.Mock;
      addNewKeyring: jest.Mock;
    };
  };
} {
  const mocks = {
    KeyringController: {
      withKeyring: jest.fn(),
      addNewKeyring: jest.fn(),
    },
  };

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllMoneyAccountControllerActions,
    AllMoneyAccountControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    () =>
      ({
        keyrings,
        isUnlocked,
        vault: '',
      }) as never,
  );

  mocks.KeyringController.addNewKeyring.mockResolvedValue({
    id: 'mock-keyring-id',
    name: 'Money Keyring',
  });

  mocks.KeyringController.withKeyring
    // First call: no MoneyKeyring exists yet — controller will call addNewKeyring.
    .mockRejectedValueOnce(
      new KeyringControllerError(KeyringControllerErrorMessage.KeyringNotFound),
    )
    // Subsequent calls: keyring exists (e.g. just created).
    .mockImplementation(async (_selector, callback) => {
      return callback({
        keyring: asKeyring(new MockMoneyKeyring()),
        metadata: MOCK_HD_KEYRING.metadata,
      });
    });

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyring',
    mocks.KeyringController.withKeyring,
  );

  rootMessenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.KeyringController.addNewKeyring,
  );

  const messenger: MoneyAccountControllerMessenger = new Messenger({
    namespace: 'MoneyAccountController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'KeyringController:getState',
      'KeyringController:withKeyring',
      'KeyringController:addNewKeyring',
    ],
    events: [],
    messenger,
  });

  const moneyAccounts = Object.fromEntries(
    accounts.map((account) => [account.id, account]),
  );

  const controller = new MoneyAccountController({
    messenger,
    state: { moneyAccounts },
  });

  return {
    controller,
    rootMessenger,
    messenger,
    mocks,
  };
}

describe('MoneyAccountController', () => {
  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const { controller } = setup();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountControllerState(),
      );
    });

    it('accepts initial state', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      expect(controller.state.moneyAccounts).toStrictEqual({
        [MOCK_MONEY_ACCOUNT.id]: MOCK_MONEY_ACCOUNT,
      });
    });
  });

  describe('init', () => {
    it('creates a money account for the primary entropy source', async () => {
      const { controller } = setup();
      await controller.init();

      const account = controller.getMoneyAccount();
      expect(account).toMatchObject({
        address: MOCK_ADDRESS,
        options: { entropy: { id: MOCK_ENTROPY_SOURCE_ID } },
      });
    });

    it('does nothing when no HD keyring exists', async () => {
      const { controller } = setup({ keyrings: [] });
      await controller.init();

      expect(controller.state.moneyAccounts).toStrictEqual({});
    });

    it('is idempotent — calling init twice does not create duplicate accounts', async () => {
      const { controller } = setup();
      await controller.init();
      await controller.init();
      expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(1);
    });

    it('throws when the keyring is locked', async () => {
      const { controller } = setup({ isUnlocked: false });
      await expect(controller.init()).rejects.toThrow(
        'Cannot create a money account while the keyring is locked',
      );
    });
  });

  describe('createMoneyAccount', () => {
    it('creates a new money account with the correct shape', async () => {
      const { controller } = setup();
      const account = await controller.createMoneyAccount(
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(account).toMatchObject({
        address: MOCK_ADDRESS,
        type: 'eip155:eoa',
        scopes: ['eip155:0'],
        options: {
          entropy: {
            type: 'mnemonic',
            id: MOCK_ENTROPY_SOURCE_ID,
            groupIndex: 0,
            derivationPath: "m/44'/4392018'/0'/0",
          },
        },
        methods: expect.arrayContaining([
          'personal_sign',
          'eth_signTransaction',
        ]),
      });
      expect(typeof account.id).toBe('string');
    });

    it('persists the created account to state', async () => {
      const { controller } = setup();
      const account = await controller.createMoneyAccount(
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(controller.state.moneyAccounts[account.id]).toStrictEqual(account);
    });

    it('returns the existing account without calling withKeyring (idempotent)', async () => {
      const { controller, mocks } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
      });
      const account = await controller.createMoneyAccount(
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(account).toStrictEqual(MOCK_MONEY_ACCOUNT);
      expect(mocks.KeyringController.withKeyring).not.toHaveBeenCalled();
    });

    it('reuses the keyring address when keyring has an account but state does not', async () => {
      const EXISTING_ADDRESS = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const { controller, mocks } = setup();
      mocks.KeyringController.withKeyring.mockImplementation(
        async (_selector, callback) => {
          return callback({
            keyring: asKeyring(
              new MockMoneyKeyring({ accounts: [EXISTING_ADDRESS] }),
            ),
            metadata: MOCK_HD_KEYRING.metadata,
          });
        },
      );
      const account = await controller.createMoneyAccount(
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(account.address).toBe(EXISTING_ADDRESS);
    });

    it('adds an account when the money keyring exists but has no accounts', async () => {
      const { controller, mocks } = setup();
      const mockKeyring = new MockMoneyKeyring({ accounts: [] });
      mocks.KeyringController.withKeyring.mockImplementation(
        async (_selector, callback) => {
          return callback({
            keyring: asKeyring(mockKeyring),
            metadata: MOCK_HD_KEYRING.metadata,
          });
        },
      );
      const account = await controller.createMoneyAccount(
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(account.address).toBe(MOCK_ADDRESS);
    });

    it('does not create duplicate keyrings when called concurrently for the same entropy source', async () => {
      const { controller, mocks } = setup();

      let keyringCreated = false;

      mocks.KeyringController.withKeyring.mockReset();
      mocks.KeyringController.withKeyring.mockImplementation(
        async (_selector, callback) => {
          // Yield to the event loop so concurrent calls can interleave at this
          // point — simulating real async I/O latency.
          await Promise.resolve();
          if (!keyringCreated) {
            throw new KeyringControllerError(
              KeyringControllerErrorMessage.KeyringNotFound,
            );
          }
          return callback({
            keyring: asKeyring(new MockMoneyKeyring()),
            metadata: MOCK_HD_KEYRING.metadata,
          });
        },
      );

      mocks.KeyringController.addNewKeyring.mockReset();
      mocks.KeyringController.addNewKeyring.mockImplementation(async () => {
        keyringCreated = true;
        return { id: 'mock-keyring-id', name: 'Money Keyring' };
      });

      await Promise.all([
        controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
        controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
      ]);

      // The mutex in #withKeyring serializes the two calls, so only the first
      // one creates the keyring; the second finds it already created.
      expect(mocks.KeyringController.addNewKeyring).toHaveBeenCalledTimes(1);
    });

    it('rethrows unexpected errors from withKeyring', async () => {
      const { controller, mocks } = setup();

      const unexpectedError = new Error('Unexpected keyring error');
      mocks.KeyringController.withKeyring.mockReset();
      mocks.KeyringController.withKeyring.mockRejectedValueOnce(
        unexpectedError,
      );

      await expect(
        controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
      ).rejects.toThrow('Unexpected keyring error');
    });

    it('throws when the keyring is locked', async () => {
      const { controller } = setup({ isUnlocked: false });

      await expect(
        controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
      ).rejects.toThrow(
        'Cannot create a money account while the keyring is locked',
      );
    });

    it('passes only the matching MoneyKeyring to the withKeyring callback', async () => {
      const { controller, mocks } = setup();
      // Reset clears the "once" reject queue from setup() so the first (and only)
      // call goes through this implementation directly (no create-keyring retry).
      mocks.KeyringController.withKeyring.mockReset();
      mocks.KeyringController.withKeyring.mockImplementation(
        async (
          selector: { filter: (k: EthKeyring) => boolean },
          callback: Parameters<typeof mocks.KeyringController.withKeyring>[1],
        ) => {
          const { filter } = selector;
          // Non-MoneyKeyring keyrings should not match.
          expect(filter(asKeyring({ type: 'HD Key Tree' }))).toBe(false);
          // A MoneyKeyring for a different entropy source should not match.
          expect(
            filter(
              asKeyring(
                new MockMoneyKeyring({
                  entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
                }),
              ),
            ),
          ).toBe(false);
          // A MoneyKeyring for the correct entropy source should match.
          const mockKeyring = new MockMoneyKeyring();
          expect(filter(asKeyring(mockKeyring))).toBe(true);
          return callback({
            keyring: asKeyring(mockKeyring),
            metadata: MOCK_HD_KEYRING.metadata,
          });
        },
      );
      await controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID);
    });

    it('uses the explicitly provided entropy source', async () => {
      const { controller, mocks } = setup({
        keyrings: [
          MOCK_HD_KEYRING,
          {
            type: 'HD Key Tree',
            accounts: ['0x2222222222222222222222222222222222222222'],
            metadata: { id: MOCK_OTHER_ENTROPY_SOURCE_ID, name: 'HD Key Tree' },
          },
        ],
      });
      mocks.KeyringController.withKeyring.mockImplementation(
        async (_selector, callback) => {
          return callback({
            keyring: asKeyring(
              new MockMoneyKeyring({
                entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
              }),
            ),
            metadata: MOCK_HD_KEYRING.metadata,
          });
        },
      );

      const account = await controller.createMoneyAccount(
        MOCK_OTHER_ENTROPY_SOURCE_ID,
      );
      expect(account.options.entropy.id).toBe(MOCK_OTHER_ENTROPY_SOURCE_ID);
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      const account = await rootMessenger.call(
        'MoneyAccountController:createMoneyAccount',
        MOCK_ENTROPY_SOURCE_ID,
      );
      expect(account).toMatchObject({
        address: MOCK_ADDRESS,
        options: { entropy: { id: MOCK_ENTROPY_SOURCE_ID } },
      });
    });
  });

  describe('getMoneyAccount', () => {
    it('returns the account for the given entropy source', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });

      expect(
        controller.getMoneyAccount({ entropySource: MOCK_ENTROPY_SOURCE_ID }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns undefined for an unknown entropy source', () => {
      const { controller } = setup();

      expect(
        controller.getMoneyAccount({ entropySource: 'unknown-entropy-source' }),
      ).toBeUndefined();
    });

    it('falls back to the primary entropy source when none is provided', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns undefined when no entropy source is provided and no HD keyring exists', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        keyrings: [],
      });

      expect(controller.getMoneyAccount()).toBeUndefined();
    });

    it('is callable via the messenger', () => {
      const { rootMessenger } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      expect(
        rootMessenger.call('MoneyAccountController:getMoneyAccount', {
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });
  });

  describe('clearState', () => {
    it('resets moneyAccounts to an empty object', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });

      expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(2);

      controller.clearState();

      expect(controller.state.moneyAccounts).toStrictEqual({});
    });

    it('is a no-op when state is already empty', () => {
      const { controller } = setup();

      controller.clearState();

      expect(controller.state.moneyAccounts).toStrictEqual({});
    });

    it('is callable via the messenger', () => {
      const { controller, rootMessenger } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
      });

      rootMessenger.call('MoneyAccountController:clearState');

      expect(controller.state.moneyAccounts).toStrictEqual({});
    });
  });
});
