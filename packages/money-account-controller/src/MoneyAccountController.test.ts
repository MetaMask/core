import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { MoneyAccount, MoneyAccountControllerMessenger } from './index.js';
import {
  MPC_ENTROPY_SOURCE_ID,
  MoneyAccountController,
  getDefaultMoneyAccountControllerState,
} from './index.js';

const MOCK_ENTROPY_SOURCE_ID = 'entropy-source-1';
const MOCK_OTHER_ENTROPY_SOURCE_ID = 'entropy-source-2';
const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
const MOCK_MPC_ADDRESS = '0x2222222222222222222222222222222222222222';

const MOCK_HD_KEYRING = {
  type: 'HD Key Tree',
  accounts: [MOCK_ADDRESS],
  metadata: { id: MOCK_ENTROPY_SOURCE_ID, name: 'HD Key Tree' },
};

const MONEY_ACCOUNT_METHODS = [
  'personal_sign',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
];

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
  methods: [...MONEY_ACCOUNT_METHODS],
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
  methods: [...MONEY_ACCOUNT_METHODS],
};

const MOCK_MPC_ACCOUNT: MoneyAccount = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  type: 'eip155:eoa',
  address: MOCK_MPC_ADDRESS,
  scopes: ['eip155:0'],
  options: {
    entropy: {
      type: 'mpc',
      id: MPC_ENTROPY_SOURCE_ID,
    },
    exportable: false,
  },
  methods: [...MONEY_ACCOUNT_METHODS],
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
  readonly type = KeyringTypes.money;

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

class MockMpcKeyring {
  readonly type = KeyringTypes.mpc;

  readonly #accounts: string[];

  initCalls = 0;

  constructor({ accounts = [MOCK_MPC_ADDRESS] }: { accounts?: string[] } = {}) {
    this.#accounts = [...accounts];
  }

  async init(): Promise<void> {
    this.initCalls += 1;
  }

  async getAccounts(): Promise<string[]> {
    return [...this.#accounts];
  }

  async addAccounts(_n: number): Promise<string[]> {
    this.#accounts.push(MOCK_MPC_ADDRESS);
    return [MOCK_MPC_ADDRESS];
  }
}

type MockKeyringSpec = {
  type: string;
  accounts: string[];
  metadata: { id: string; name: string };
  entropySource?: string;
};

type MockKeyringEntry = {
  keyring: EthKeyring;
  metadata: { id: string; name: string };
};

type SetupOptions = {
  accounts?: MoneyAccount[];
  defaultMoneyAccountId?: string | null;
  isUnlocked?: boolean;
  keyrings?: MockKeyringSpec[];
};

type AllMoneyAccountControllerActions =
  MessengerActions<MoneyAccountControllerMessenger>;

type AllMoneyAccountControllerEvents =
  MessengerEvents<MoneyAccountControllerMessenger>;

function setup({
  accounts = [],
  defaultMoneyAccountId,
  isUnlocked = true,
  keyrings = [MOCK_HD_KEYRING],
}: SetupOptions = {}): {
  controller: MoneyAccountController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountControllerMessenger;
  keyringEntries: MockKeyringEntry[];
  mocks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    KeyringController: {
      withKeyring: jest.Mock;
      withController: jest.Mock;
      addNewKeyring: jest.Mock;
    };
  };
} {
  const mocks = {
    KeyringController: {
      withKeyring: jest.fn(),
      withController: jest.fn(),
      addNewKeyring: jest.fn(),
    },
  };

  const keyringEntries: MockKeyringEntry[] = keyrings.map((spec) => {
    let keyring: object;
    if (spec.type === KeyringTypes.money) {
      keyring = new MockMoneyKeyring({
        accounts: spec.accounts,
        entropySource: spec.entropySource,
      });
    } else if (spec.type === KeyringTypes.mpc) {
      keyring = new MockMpcKeyring({ accounts: spec.accounts });
    } else {
      keyring = { type: spec.type, accounts: spec.accounts };
    }
    return { keyring: asKeyring(keyring), metadata: spec.metadata };
  });

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllMoneyAccountControllerActions,
    AllMoneyAccountControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler('KeyringController:getState', () => ({
    keyrings: keyrings.map((spec) => ({
      type: spec.type,
      accounts: spec.accounts,
      metadata: spec.metadata,
    })),
    isUnlocked,
    vault: '',
  }));

  // Simulates `KeyringController:withKeyring`, resolving the selector against
  // the current keyring entries.
  mocks.KeyringController.withKeyring.mockImplementation(
    async (
      selector: { id: string } | { filter: (keyring: EthKeyring) => boolean },
      callback: (entry: {
        keyring: EthKeyring;
        metadata: { id: string; name: string };
      }) => Promise<unknown>,
    ) => {
      const entry =
        'id' in selector
          ? keyringEntries.find(
              (candidate) => candidate.metadata.id === selector.id,
            )
          : keyringEntries.find((candidate) =>
              selector.filter(candidate.keyring),
            );

      if (!entry) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
      }

      return callback({ keyring: entry.keyring, metadata: entry.metadata });
    },
  );

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyring',
    mocks.KeyringController.withKeyring,
  );

  // Simulates `KeyringController:withController`: mutually exclusive execution
  // of the operation against a restricted view of the keyrings, with staged
  // `addNewKeyring` / `removeKeyring` mutations.
  let controllerQueue = Promise.resolve();
  mocks.KeyringController.addNewKeyring.mockImplementation(
    async (type: string, opts?: unknown) => {
      // Yield to the event loop so concurrent calls could interleave
      // at this point if the controller were not mutually exclusive.
      await Promise.resolve();

      let keyring: object;
      if (type === KeyringTypes.money) {
        keyring = new MockMoneyKeyring({
          accounts: [],
          entropySource: (opts as { entropySource?: string })?.entropySource,
        });
      } else if (type === KeyringTypes.mpc) {
        keyring = new MockMpcKeyring({ accounts: [] });
      } else {
        keyring = { type, accounts: [] };
      }

      const entry: MockKeyringEntry = {
        keyring: asKeyring(keyring),
        metadata: {
          id: `created-keyring-${keyringEntries.length}`,
          name: type,
        },
      };
      keyringEntries.push(entry);
      return entry;
    },
  );
  mocks.KeyringController.withController.mockImplementation(
    async (operation: (restrictedController: unknown) => Promise<unknown>) => {
      const result = controllerQueue.then(() =>
        operation({
          keyrings: Object.freeze([...keyringEntries]),

          addNewKeyring: mocks.KeyringController.addNewKeyring,

          removeKeyring: async () => {
            throw new Error('removeKeyring is not supported in this mock');
          },
        }),
      );
      controllerQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );

  rootMessenger.registerActionHandler(
    'KeyringController:withController',
    mocks.KeyringController.withController,
  );

  const messenger: MoneyAccountControllerMessenger = new Messenger({
    namespace: 'MoneyAccountController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'KeyringController:getState',
      'KeyringController:withKeyring',
      'KeyringController:withController',
    ],
    events: [],
    messenger,
  });

  const moneyAccounts = Object.fromEntries(
    accounts.map((account) => [account.id, account]),
  );

  const controller = new MoneyAccountController({
    messenger,
    state: {
      moneyAccounts,
      defaultMoneyAccountId:
        defaultMoneyAccountId === undefined
          ? (accounts[0]?.id ?? null)
          : defaultMoneyAccountId,
    },
  });

  return {
    controller,
    rootMessenger,
    messenger,
    keyringEntries,
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
      expect(controller.state.defaultMoneyAccountId).toBe(
        MOCK_MONEY_ACCOUNT.id,
      );
    });
  });

  describe('init', () => {
    it('creates a money account for the primary entropy source and sets it as the default', async () => {
      const { controller } = setup();
      await controller.init();

      const account = controller.getMoneyAccount();
      expect(account).toMatchObject({
        address: MOCK_ADDRESS,
        options: { entropy: { id: MOCK_ENTROPY_SOURCE_ID } },
      });
      expect(controller.state.defaultMoneyAccountId).toBe(account?.id);
    });

    it('does nothing when no HD keyring exists', async () => {
      const { controller } = setup({ keyrings: [] });
      await controller.init();

      expect(controller.state.moneyAccounts).toStrictEqual({});
      expect(controller.state.defaultMoneyAccountId).toBeNull();
    });

    it('is idempotent — calling init twice does not create duplicate accounts', async () => {
      const { controller } = setup();
      await controller.init();
      await controller.init();
      expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(1);
    });

    it('does not override an existing default account', async () => {
      const { controller } = setup({
        accounts: [MOCK_MPC_ACCOUNT],
        defaultMoneyAccountId: MOCK_MPC_ACCOUNT.id,
      });
      await controller.init();

      expect(controller.state.defaultMoneyAccountId).toBe(MOCK_MPC_ACCOUNT.id);
      expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(2);
    });

    it('throws when the keyring is locked', async () => {
      const { controller } = setup({ isUnlocked: false });
      await expect(controller.init()).rejects.toThrow(
        'Cannot create a money account while the keyring is locked',
      );
    });
  });

  describe('createMoneyAccount', () => {
    describe('Money Keyring (SFA)', () => {
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
          methods: [...MONEY_ACCOUNT_METHODS],
        });
        expect(typeof account.id).toBe('string');
      });

      it('persists the created account to state and sets it as the default', async () => {
        const { controller } = setup();
        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
      });

      it('does not override an existing default when creating another account', async () => {
        const { controller } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
        });
        const account = await controller.createMoneyAccount(
          MOCK_OTHER_ENTROPY_SOURCE_ID,
        );
        expect(account.id).not.toBe(MOCK_MONEY_ACCOUNT.id);
        expect(controller.state.defaultMoneyAccountId).toBe(
          MOCK_MONEY_ACCOUNT.id,
        );
      });

      it('returns the existing account without touching the keyring controller (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
        });
        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );
        expect(account).toStrictEqual(MOCK_MONEY_ACCOUNT);
        expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
        expect(mocks.KeyringController.withKeyring).not.toHaveBeenCalled();
      });

      it('creates the money keyring if it does not exist yet', async () => {
        const { controller, mocks } = setup();
        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );

        expect(account.address).toBe(MOCK_ADDRESS);
        expect(mocks.KeyringController.addNewKeyring).toHaveBeenCalledWith(
          KeyringTypes.money,
          { entropySource: MOCK_ENTROPY_SOURCE_ID },
        );
      });

      it('reuses the existing money keyring', async () => {
        const EXISTING_ADDRESS = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.money,
              accounts: [EXISTING_ADDRESS],
              metadata: { id: 'money-keyring-1', name: 'Money Keyring' },
              entropySource: MOCK_ENTROPY_SOURCE_ID,
            },
          ],
        });
        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );

        expect(account.address).toBe(EXISTING_ADDRESS);
        expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
      });

      it('targets the money keyring matching the given entropy source', async () => {
        const OTHER_ADDRESS = '0x3333333333333333333333333333333333333333';
        const { controller } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.money,
              accounts: [OTHER_ADDRESS],
              metadata: { id: 'money-keyring-2', name: 'Money Keyring' },
              entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
            },
          ],
        });

        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );
        expect(account.address).toBe(MOCK_ADDRESS);
        expect(account.options.entropy.id).toBe(MOCK_ENTROPY_SOURCE_ID);
      });

      it('adds an account when the money keyring exists but has no accounts', async () => {
        const { controller } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.money,
              accounts: [],
              metadata: { id: 'money-keyring-1', name: 'Money Keyring' },
              entropySource: MOCK_ENTROPY_SOURCE_ID,
            },
          ],
        });
        const account = await controller.createMoneyAccount(
          MOCK_ENTROPY_SOURCE_ID,
        );
        expect(account.address).toBe(MOCK_ADDRESS);
      });

      it('does not create duplicate keyrings when called concurrently for the same entropy source', async () => {
        const { controller, mocks } = setup();

        await Promise.all([
          controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
          controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
        ]);

        // The `withController` transaction is mutually exclusive, so only the
        // first call creates the keyring; the second finds it already created.
        expect(mocks.KeyringController.addNewKeyring).toHaveBeenCalledTimes(1);
        expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(1);
      });

      it('rethrows unexpected errors from withController', async () => {
        const { controller, mocks } = setup();

        const unexpectedError = new Error('Unexpected keyring error');
        mocks.KeyringController.withController.mockRejectedValue(
          unexpectedError,
        );

        await expect(
          controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('Unexpected keyring error');
      });

      it('throws when the created keyring is not a Money Keyring', async () => {
        const { controller, mocks, keyringEntries } = setup();
        mocks.KeyringController.addNewKeyring.mockImplementation(async () => {
          const entry = {
            keyring: asKeyring(new MockMpcKeyring()),
            metadata: { id: 'money-keyring-wrong', name: 'Money Keyring' },
          };
          keyringEntries.push(entry);
          return entry;
        });

        await expect(
          controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('Keyring money-keyring-wrong has an unexpected type');
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({ isUnlocked: false });

        await expect(
          controller.createMoneyAccount(MOCK_ENTROPY_SOURCE_ID),
        ).rejects.toThrow(
          'Cannot create a money account while the keyring is locked',
        );
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

    describe('MPC Keyring (MFA)', () => {
      it('creates a new money account backed by an MPC keyring', async () => {
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpc,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: { id: 'mpc-keyring-1', name: 'MPC Keyring' },
            },
          ],
        });

        const account = await controller.createMoneyAccount(
          MPC_ENTROPY_SOURCE_ID,
        );

        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          type: 'eip155:eoa',
          scopes: ['eip155:0'],
          options: {
            entropy: {
              type: 'mpc',
              id: MPC_ENTROPY_SOURCE_ID,
            },
          },
          methods: [...MONEY_ACCOUNT_METHODS],
        });
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
        // The existing keyring is reused, not re-created.
        expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
      });

      it('initializes the MPC keyring before reading its accounts', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpc,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: { id: 'mpc-keyring-1', name: 'MPC Keyring' },
            },
          ],
        });

        await controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID);

        const mpcKeyring = keyringEntries[1]
          .keyring as unknown as MockMpcKeyring;
        expect(mpcKeyring.initCalls).toBe(1);
      });

      it('creates the MPC keyring if it does not exist yet', async () => {
        const { controller, mocks } = setup();

        const account = await controller.createMoneyAccount(
          MPC_ENTROPY_SOURCE_ID,
        );

        expect(account.address).toBe(MOCK_MPC_ADDRESS);
        expect(mocks.KeyringController.addNewKeyring).toHaveBeenCalledWith(
          KeyringTypes.mpc,
        );
      });

      it('returns the existing account without touching the keyring controller (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MPC_ACCOUNT],
        });

        const account = await controller.createMoneyAccount(
          MPC_ENTROPY_SOURCE_ID,
        );

        expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
        expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
        expect(mocks.KeyringController.withKeyring).not.toHaveBeenCalled();
      });

      it('throws when multiple MPC keyrings exist', async () => {
        const { controller } = setup({
          keyrings: [
            {
              type: KeyringTypes.mpc,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: { id: 'mpc-keyring-1', name: 'MPC Keyring' },
            },
            {
              type: KeyringTypes.mpc,
              accounts: ['0x3333333333333333333333333333333333333333'],
              metadata: { id: 'mpc-keyring-2', name: 'MPC Keyring' },
            },
          ],
        });

        await expect(
          controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('Multiple MPC keyrings found');
      });

      it('propagates errors when the MPC keyring cannot be created', async () => {
        const { controller, mocks } = setup();
        mocks.KeyringController.addNewKeyring.mockRejectedValue(
          new Error('No keyring builder for type: MPC Keyring'),
        );

        await expect(
          controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('No keyring builder for type: MPC Keyring');
      });

      it('propagates errors from the MPC keyring initialization', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpc,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: { id: 'mpc-keyring-1', name: 'MPC Keyring' },
            },
          ],
        });
        const mpcKeyring = keyringEntries[1]
          .keyring as unknown as MockMpcKeyring;
        jest
          .spyOn(mpcKeyring, 'init')
          .mockRejectedValue(new Error('MPC failure'));

        await expect(
          controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('MPC failure');
      });

      it('throws when the created keyring is not an MPC keyring', async () => {
        const { controller, mocks, keyringEntries } = setup();
        mocks.KeyringController.addNewKeyring.mockImplementation(async () => {
          const entry = {
            keyring: asKeyring(new MockMoneyKeyring()),
            metadata: { id: 'mpc-keyring-wrong', name: 'MPC Keyring' },
          };
          keyringEntries.push(entry);
          return entry;
        });

        await expect(
          controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID),
        ).rejects.toThrow('Keyring mpc-keyring-wrong has an unexpected type');
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({ isUnlocked: false });

        await expect(
          controller.createMoneyAccount(MPC_ENTROPY_SOURCE_ID),
        ).rejects.toThrow(
          'Cannot create a money account while the keyring is locked',
        );
      });

      it('is callable via the messenger', async () => {
        const { rootMessenger } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpc,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: { id: 'mpc-keyring-1', name: 'MPC Keyring' },
            },
          ],
        });

        const account = await rootMessenger.call(
          'MoneyAccountController:createMoneyAccount',
          MPC_ENTROPY_SOURCE_ID,
        );
        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          options: { entropy: { type: 'mpc', id: MPC_ENTROPY_SOURCE_ID } },
        });
      });
    });
  });

  describe('setDefaultMoneyAccount', () => {
    it('sets the default account', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      controller.setDefaultMoneyAccount(MOCK_MPC_ACCOUNT.id);

      expect(controller.state.defaultMoneyAccountId).toBe(MOCK_MPC_ACCOUNT.id);
      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

    it('throws for an unknown account id', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      expect(() => controller.setDefaultMoneyAccount('unknown-id')).toThrow(
        'Unknown money account: unknown-id',
      );
    });

    it('is callable via the messenger', () => {
      const { controller, rootMessenger } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      rootMessenger.call(
        'MoneyAccountController:setDefaultMoneyAccount',
        MOCK_MPC_ACCOUNT.id,
      );

      expect(controller.state.defaultMoneyAccountId).toBe(MOCK_MPC_ACCOUNT.id);
    });
  });

  describe('getMoneyAccount', () => {
    it('returns the account for the given entropy source (mnemonic)', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(
        controller.getMoneyAccount({ entropySource: MOCK_ENTROPY_SOURCE_ID }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns the account for the given entropy source (mpc)', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(
        controller.getMoneyAccount({ entropySource: MPC_ENTROPY_SOURCE_ID }),
      ).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

    it('returns the account for the given id', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(
        controller.getMoneyAccount({ id: MOCK_MPC_ACCOUNT.id }),
      ).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

    it('prefers id over entropySource when both are provided', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });

      expect(
        controller.getMoneyAccount({
          id: MOCK_MONEY_ACCOUNT_2.id,
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT_2);
    });

    it('returns undefined for an unknown entropy source', () => {
      const { controller } = setup();

      expect(
        controller.getMoneyAccount({ entropySource: 'unknown-entropy-source' }),
      ).toBeUndefined();
    });

    it('returns the default account when no selector is provided', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
        defaultMoneyAccountId: MOCK_MPC_ACCOUNT.id,
      });

      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

    it('returns undefined when no default is set', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        defaultMoneyAccountId: null,
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
    it('resets moneyAccounts and the default account', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });

      expect(Object.keys(controller.state.moneyAccounts)).toHaveLength(2);

      controller.clearState();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountControllerState(),
      );
    });

    it('is a no-op when state is already empty', () => {
      const { controller } = setup();

      controller.clearState();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountControllerState(),
      );
    });

    it('is callable via the messenger', () => {
      const { controller, rootMessenger } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
      });

      rootMessenger.call('MoneyAccountController:clearState');

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountControllerState(),
      );
    });
  });
});
