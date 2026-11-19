import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import { KeyringAccountEntropyTypeOption } from '@metamask/keyring-api';
import type {
  CreateAccountOptions,
  KeyringAccount,
  KeyringAccountEntropyOptions,
} from '@metamask/keyring-api';
import type { Keyring as KeyringV2 } from '@metamask/keyring-api/v2';
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
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { MoneyAccount, MoneyAccountControllerMessenger } from './index.js';
import {
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

// `withKeyringV2`'s callback requires a V2 `Keyring`, but our mock keyrings
// only implement the subset of methods the controller actually calls.
function asKeyring(keyring: object): EthKeyring {
  return keyring as unknown as EthKeyring;
}

function asV2Keyring(keyring: object): KeyringV2 {
  return keyring as unknown as KeyringV2;
}

function toV2Account(
  address: string,
  entropy: KeyringAccountEntropyOptions,
): KeyringAccount {
  return {
    id: `mock-v2-account-${address}`,
    type: 'eip155:eoa',
    address,
    scopes: ['eip155:0'],
    methods: [...MONEY_ACCOUNT_METHODS],
    options: { entropy, exportable: false },
  };
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

/** Mirrors the V2 `MoneyKeyring` wrapper from `@metamask/eth-money-keyring/v2`. */
class MockMoneyKeyringV2 {
  readonly #inner: MockMoneyKeyring;

  constructor(inner: MockMoneyKeyring) {
    this.#inner = inner;
  }

  #toAccount(address: string): KeyringAccount {
    // Mirrors the real wrapper: the derivation path includes the address
    // index (`/${addressIndex}`).
    return toV2Account(address, {
      type: 'mnemonic',
      id: this.#inner.entropySource,
      groupIndex: 0,
      derivationPath: "m/44'/4392018'/0'/0/0",
    });
  }

  async getAccounts(): Promise<KeyringAccount[]> {
    return (await this.#inner.getAccounts()).map((address) =>
      this.#toAccount(address),
    );
  }

  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<KeyringAccount[]> {
    if (options.type !== 'bip44:derive-index') {
      throw new Error(
        `MoneyKeyring: unsupported account creation type: ${options.type}`,
      );
    }

    if (options.entropySource !== this.#inner.entropySource) {
      throw new Error(
        `MoneyKeyring: entropy source mismatch: expected '${this.#inner.entropySource}', got '${options.entropySource}'`,
      );
    }

    if (options.groupIndex !== 0) {
      throw new Error(
        'MoneyKeyring: supports only creating the first account, groupIndex must be 0',
      );
    }

    const accounts = await this.#inner.getAccounts();
    if (accounts.length > 0) {
      return accounts.map((address) => this.#toAccount(address));
    }

    const [address] = await this.#inner.addAccounts(1);
    return [this.#toAccount(address)];
  }
}

class MockMpcKeyring {
  readonly type = KeyringTypes.mpcMoney;

  readonly #accounts: string[];

  setupCalls = 0;

  constructor({ accounts = [MOCK_MPC_ADDRESS] }: { accounts?: string[] } = {}) {
    this.#accounts = [...accounts];
  }

  async setup(): Promise<void> {
    this.setupCalls += 1;
    // Simulates the MPC setup (key generation or import) creating the
    // account.
    if (this.#accounts.length === 0) {
      this.#accounts.push(MOCK_MPC_ADDRESS);
    }
  }

  async getAccounts(): Promise<string[]> {
    return [...this.#accounts];
  }
}

/** Mirrors the V2 `MpcMoneyKeyring` wrapper from `@metamask/eth-money-mpc-keyring/v2`. */
class MockMpcKeyringV2 {
  readonly #inner: MockMpcKeyring;

  constructor(inner: MockMpcKeyring) {
    this.#inner = inner;
  }

  async getAccounts(): Promise<KeyringAccount[]> {
    return (await this.#inner.getAccounts()).map((address) =>
      toV2Account(address, { type: 'mpc' }),
    );
  }

  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<KeyringAccount[]> {
    if (options.type !== 'custom') {
      throw new Error(
        `MpcMoneyKeyring: unsupported account creation type: ${options.type}`,
      );
    }

    const accounts = await this.getAccounts();
    if (accounts.length > 0) {
      return accounts;
    }

    // The mode is inferred from the backend by the inner keyring.
    await this.#inner.setup();

    const [createdAccount] = await this.getAccounts();
    if (!createdAccount) {
      throw new Error('MpcMoneyKeyring: account creation failed');
    }

    return [createdAccount];
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
  keyringV2?: KeyringV2;
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

function buildMockKeyrings(
  type: string,
  accounts: string[],
  entropySource?: string,
): { keyring: object; keyringV2: object | undefined } {
  if (type === KeyringTypes.money) {
    const inner = new MockMoneyKeyring({ accounts, entropySource });
    return { keyring: inner, keyringV2: new MockMoneyKeyringV2(inner) };
  }

  if (type === KeyringTypes.mpcMoney) {
    const inner = new MockMpcKeyring({ accounts });
    return { keyring: inner, keyringV2: new MockMpcKeyringV2(inner) };
  }

  // No V2 builder is registered for other keyring types.
  return { keyring: { type, accounts }, keyringV2: undefined };
}

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
      withController: Mock;
      withKeyringV2: Mock;
      addNewKeyring: Mock;
    };
  };
} {
  const mocks = {
    KeyringController: {
      withController: vi.fn(),
      withKeyringV2: vi.fn(),
      addNewKeyring: vi.fn(),
    },
  };

  const keyringEntries: MockKeyringEntry[] = keyrings.map((spec) => {
    const { keyring, keyringV2 } = buildMockKeyrings(
      spec.type,
      spec.accounts,
      spec.entropySource,
    );
    return {
      keyring: asKeyring(keyring),
      keyringV2: keyringV2 === undefined ? undefined : asV2Keyring(keyringV2),
      metadata: spec.metadata,
    };
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

  // Simulates `KeyringController:withKeyringV2`, resolving the selector
  // against the current keyring entries.
  mocks.KeyringController.withKeyringV2.mockImplementation(
    async (
      selector: { id: string },
      callback: (entry: {
        keyring: KeyringV2;
        metadata: { id: string; name: string };
      }) => Promise<unknown>,
    ) => {
      const entry = keyringEntries.find(
        (candidate) => candidate.metadata.id === selector.id,
      );

      if (!entry) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
      }

      if (!entry.keyringV2) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringV2NotSupported,
        );
      }

      return callback({ keyring: entry.keyringV2, metadata: entry.metadata });
    },
  );

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyringV2',
    mocks.KeyringController.withKeyringV2,
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

      const { keyring, keyringV2 } = buildMockKeyrings(
        type,
        [],
        (opts as { entropySource?: string } | undefined)?.entropySource,
      );

      const entry: MockKeyringEntry = {
        keyring: asKeyring(keyring),
        keyringV2: keyringV2 === undefined ? undefined : asV2Keyring(keyringV2),
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
      'KeyringController:withKeyringV2',
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

    it('sets the existing primary entropy account as the default when no default is set (upgrade safety net)', async () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        defaultMoneyAccountId: null,
      });
      await controller.init();

      expect(controller.state.defaultMoneyAccountId).toBe(
        MOCK_MONEY_ACCOUNT.id,
      );
      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('does not set a default when no primary HD keyring exists, even if other accounts do', async () => {
      const { controller } = setup({
        accounts: [MOCK_MPC_ACCOUNT],
        defaultMoneyAccountId: null,
        keyrings: [],
      });
      await controller.init();

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
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });
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
            exportable: false,
          },
          methods: [...MONEY_ACCOUNT_METHODS],
        });
        // The account object is constructed by the controller, with the
        // deterministic ID generation logic of EVM accounts.
        expect(account.id).toBe(
          getUUIDFromAddressOfNormalAccount(MOCK_ADDRESS),
        );
      });

      it('defaults to the primary entropy source when none is provided', async () => {
        const { controller } = setup();
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
        });
        expect(account).toMatchObject({
          address: MOCK_ADDRESS,
          options: {
            entropy: { type: 'mnemonic', id: MOCK_ENTROPY_SOURCE_ID },
          },
        });
      });

      it('throws when no entropy source is provided and no primary HD keyring exists', async () => {
        const { controller } = setup({ keyrings: [] });

        await expect(
          controller.createMoneyAccount({ type: 'mnemonic' }),
        ).rejects.toThrow(
          'No entropy source provided, and no primary HD keyring found',
        );
      });

      it('persists the created account to state and sets it as the default', async () => {
        const { controller } = setup();
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
      });

      it('does not override an existing default when creating another account', async () => {
        const { controller } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
        });
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
        });
        expect(account.id).not.toBe(MOCK_MONEY_ACCOUNT.id);
        expect(controller.state.defaultMoneyAccountId).toBe(
          MOCK_MONEY_ACCOUNT.id,
        );
      });

      it('returns the existing account without touching the keyring controller (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
        });
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });
        expect(account).toStrictEqual(MOCK_MONEY_ACCOUNT);
        expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
        expect(mocks.KeyringController.withKeyringV2).not.toHaveBeenCalled();
      });

      it('creates the money keyring if it does not exist yet', async () => {
        const { controller, mocks } = setup();
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });

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
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });

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

        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });
        expect(account.address).toBe(MOCK_ADDRESS);
        expect(account.options.entropy).toStrictEqual({
          type: 'mnemonic',
          id: MOCK_ENTROPY_SOURCE_ID,
          groupIndex: 0,
          derivationPath: "m/44'/4392018'/0'/0",
        });
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
        const account = await controller.createMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        });
        expect(account.address).toBe(MOCK_ADDRESS);
      });

      it('does not create duplicate keyrings when called concurrently for the same entropy source', async () => {
        const { controller, mocks } = setup();

        await Promise.all([
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
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
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
        ).rejects.toThrow('Unexpected keyring error');
      });

      it('rethrows unexpected errors from withKeyringV2', async () => {
        const { controller, mocks } = setup();

        const unexpectedError = new Error('Unexpected V2 keyring error');
        mocks.KeyringController.withKeyringV2.mockRejectedValue(
          unexpectedError,
        );

        await expect(
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
        ).rejects.toThrow('Unexpected V2 keyring error');
      });

      it('throws when account creation returns no account', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.money,
              accounts: [MOCK_ADDRESS],
              metadata: { id: 'money-keyring-1', name: 'Money Keyring' },
              entropySource: MOCK_ENTROPY_SOURCE_ID,
            },
          ],
        });
        const keyringV2 = keyringEntries[1]
          .keyringV2 as unknown as MockMoneyKeyringV2;
        vi.spyOn(keyringV2, 'createAccounts').mockResolvedValue([]);

        await expect(
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
        ).rejects.toThrow('Money Keyring account creation failed');
      });

      it('throws when no V2 wrapper is registered for the keyring type', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.money,
              accounts: [MOCK_ADDRESS],
              metadata: { id: 'money-keyring-1', name: 'Money Keyring' },
              entropySource: MOCK_ENTROPY_SOURCE_ID,
            },
          ],
        });
        keyringEntries[1].keyringV2 = undefined;

        await expect(
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
        ).rejects.toThrow(
          'KeyringController - The selected keyring does not support the KeyringV2 API.',
        );
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({ isUnlocked: false });

        await expect(
          controller.createMoneyAccount({
            type: 'mnemonic',
            entropySource: MOCK_ENTROPY_SOURCE_ID,
          }),
        ).rejects.toThrow(
          'Cannot create a money account while the keyring is locked',
        );
      });

      it('is callable via the messenger', async () => {
        const { rootMessenger } = setup();

        const account = await rootMessenger.call(
          'MoneyAccountController:createMoneyAccount',
          { type: 'mnemonic', entropySource: MOCK_ENTROPY_SOURCE_ID },
        );
        expect(account).toMatchObject({
          address: MOCK_ADDRESS,
          options: { entropy: { id: MOCK_ENTROPY_SOURCE_ID } },
        });
      });
    });

    describe('MPC Money Keyring (MFA)', () => {
      it('creates a new money account backed by an existing MPC Money keyring', async () => {
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        const account = await controller.createMoneyAccount({
          type: 'mpc',
        });

        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          type: 'eip155:eoa',
          scopes: ['eip155:0'],
          options: {
            entropy: {
              type: 'mpc',
            },
            exportable: false,
          },
          methods: [...MONEY_ACCOUNT_METHODS],
        });
        // The account identity is reused from the keyring's account.
        expect(account.id).toBe(`mock-v2-account-${MOCK_MPC_ADDRESS}`);
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
        // The existing keyring is reused, not re-registered.
        expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
      });

      it('accepts the enum value for the type', async () => {
        const { controller } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        const account = await controller.createMoneyAccount({
          type: KeyringAccountEntropyTypeOption.Mpc,
        });
        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          options: { entropy: { type: 'mpc' } },
        });

        expect(
          controller.getMoneyAccount({
            type: KeyringAccountEntropyTypeOption.Mpc,
          }),
        ).toStrictEqual(account);
      });

      it('does not run the MPC setup when the account already exists', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        await controller.createMoneyAccount({ type: 'mpc' });

        const mpcKeyring = keyringEntries[1]
          .keyring as unknown as MockMpcKeyring;
        expect(mpcKeyring.setupCalls).toBe(0);
      });

      it('triggers the MPC setup when the keyring has no account', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        const account = await controller.createMoneyAccount({ type: 'mpc' });

        expect(account.address).toBe(MOCK_MPC_ADDRESS);
        const mpcKeyring = keyringEntries[1]
          .keyring as unknown as MockMpcKeyring;
        expect(mpcKeyring.setupCalls).toBe(1);
      });

      it('propagates errors from the MPC setup', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });
        const mpcKeyring = keyringEntries[1]
          .keyring as unknown as MockMpcKeyring;
        vi.spyOn(mpcKeyring, 'setup').mockRejectedValue(
          new Error('MPC setup failure'),
        );

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow('MPC setup failure');
      });

      it('throws when account creation returns no account', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });
        const keyringV2 = keyringEntries[1]
          .keyringV2 as unknown as MockMpcKeyringV2;
        vi.spyOn(keyringV2, 'createAccounts').mockResolvedValue([]);

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow('MPC Money keyring account creation failed');
      });

      it('throws when the MPC keyring account reports unexpected options', async () => {
        const { controller, keyringEntries } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });
        const keyringV2 = keyringEntries[1]
          .keyringV2 as unknown as MockMpcKeyringV2;
        const [account] = await keyringV2.createAccounts({
          type: 'custom',
        });
        vi.spyOn(keyringV2, 'createAccounts').mockResolvedValue([
          { ...account, options: {} },
        ]);

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow('MPC Money keyring account has unexpected options');
      });

      it('returns the existing account without touching the keyring controller (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MPC_ACCOUNT],
        });

        const account = await controller.createMoneyAccount({
          type: 'mpc',
        });

        expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
        expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
        expect(mocks.KeyringController.withKeyringV2).not.toHaveBeenCalled();
      });

      it('registers the MPC Money keyring when missing and triggers its setup', async () => {
        const { controller, mocks } = setup();

        const account = await controller.createMoneyAccount({ type: 'mpc' });

        expect(account.address).toBe(MOCK_MPC_ADDRESS);
        expect(mocks.KeyringController.addNewKeyring).toHaveBeenCalledWith(
          KeyringTypes.mpcMoney,
        );
      });

      it('throws when multiple MPC Money keyrings exist', async () => {
        const { controller } = setup({
          keyrings: [
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
            {
              type: KeyringTypes.mpcMoney,
              accounts: ['0x3333333333333333333333333333333333333333'],
              metadata: {
                id: 'mpc-money-keyring-2',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow('Multiple MPC Money keyrings found');
      });

      it('rethrows unexpected errors from withKeyringV2', async () => {
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });
        mocks.KeyringController.withKeyringV2.mockRejectedValue(
          new Error('Unexpected V2 keyring error'),
        );

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow('Unexpected V2 keyring error');
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({ isUnlocked: false });

        await expect(
          controller.createMoneyAccount({ type: 'mpc' }),
        ).rejects.toThrow(
          'Cannot create a money account while the keyring is locked',
        );
      });

      it('is callable via the messenger', async () => {
        const { rootMessenger } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: KeyringTypes.mpcMoney,
              accounts: [MOCK_MPC_ADDRESS],
              metadata: {
                id: 'mpc-money-keyring-1',
                name: 'MPC Money Keyring',
              },
            },
          ],
        });

        const account = await rootMessenger.call(
          'MoneyAccountController:createMoneyAccount',
          { type: 'mpc' },
        );
        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          options: { entropy: { type: 'mpc' } },
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
        controller.getMoneyAccount({
          type: 'mnemonic',
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('defaults to the primary entropy source for mnemonic selectors', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });

      expect(controller.getMoneyAccount({ type: 'mnemonic' })).toStrictEqual(
        MOCK_MONEY_ACCOUNT,
      );
    });

    it('returns undefined for a mnemonic selector when no primary HD keyring exists', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        keyrings: [],
      });

      expect(controller.getMoneyAccount({ type: 'mnemonic' })).toBeUndefined();
    });

    it("returns the MPC account for a `{ type: 'mpc' }` selector", () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(controller.getMoneyAccount({ type: 'mpc' })).toStrictEqual(
        MOCK_MPC_ACCOUNT,
      );
    });

    it('returns undefined when no MPC account exists', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
      });

      expect(controller.getMoneyAccount({ type: 'mpc' })).toBeUndefined();
    });

    it('returns the account for the given id', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(
        controller.getMoneyAccount({ id: MOCK_MPC_ACCOUNT.id }),
      ).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

    it('returns undefined for an unknown id', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      expect(controller.getMoneyAccount({ id: 'unknown-id' })).toBeUndefined();
    });

    it('returns undefined for an unknown entropy source', () => {
      const { controller } = setup();

      expect(
        controller.getMoneyAccount({
          type: 'mnemonic',
          entropySource: 'unknown-entropy-source',
        }),
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
          type: 'mnemonic',
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
