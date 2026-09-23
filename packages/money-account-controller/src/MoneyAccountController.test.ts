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
  MoneyAccountController,
  getDefaultMoneyAccountControllerState,
  MPC_KEYRING_TYPE,
} from './index.js';

const MOCK_ENTROPY_SOURCE_ID = 'entropy-source-1';
const MOCK_OTHER_ENTROPY_SOURCE_ID = 'entropy-source-2';
const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
const MOCK_MPC_ADDRESS = '0x2222222222222222222222222222222222222222';
const MOCK_MPC_KEYRING_ID = 'mpc-keyring-1';
const MOCK_MPC_KEYRING_ID_2 = 'mpc-keyring-2';

const CREATE_MONEY_PARAMS = {
  keyringType: KeyringTypes.money,
  entropySource: MOCK_ENTROPY_SOURCE_ID,
} as const;

const MOCK_HD_KEYRING = {
  type: 'HD Key Tree',
  accounts: [MOCK_ADDRESS],
  metadata: { id: MOCK_ENTROPY_SOURCE_ID, name: 'HD Key Tree' },
};

const MOCK_MPC_KEYRING_STATE = {
  type: MPC_KEYRING_TYPE,
  accounts: [MOCK_MPC_ADDRESS],
  metadata: { id: MOCK_MPC_KEYRING_ID, name: 'MPC Keyring' },
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
    'personal_sign',
    'eth_signTypedData_v1',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
};

const MOCK_MPC_ACCOUNT: MoneyAccount = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  type: 'eip155:eoa',
  address: MOCK_MPC_ADDRESS,
  scopes: ['eip155:0'],
  options: {
    entropy: {
      type: 'custom',
    },
    exportable: false,
    keyringId: MOCK_MPC_KEYRING_ID,
  },
  methods: [
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

class MockMpcKeyring {
  readonly type = MPC_KEYRING_TYPE;

  readonly #accounts: string[];

  constructor({ accounts = [MOCK_MPC_ADDRESS] }: { accounts?: string[] } = {}) {
    this.#accounts = [...accounts];
  }

  async getAccounts(): Promise<string[]> {
    return [...this.#accounts];
  }

  async addAccounts(_n: number): Promise<string[]> {
    this.#accounts.push(MOCK_MPC_ADDRESS);
    return [MOCK_MPC_ADDRESS];
  }
}

type SetupOptions = {
  accounts?: MoneyAccount[];
  defaultMoneyAccountId?: string | null;
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
  defaultMoneyAccountId,
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

  const resolvedDefaultMoneyAccountId =
    defaultMoneyAccountId === undefined
      ? (accounts[0]?.id ?? null)
      : defaultMoneyAccountId;

  const controller = new MoneyAccountController({
    messenger,
    state: {
      moneyAccounts,
      defaultMoneyAccountId: resolvedDefaultMoneyAccountId,
    },
  });

  return {
    controller,
    rootMessenger,
    messenger,
    mocks,
  };
}

function mockMpcWithKeyring(
  mocks: ReturnType<typeof setup>['mocks'],
  keyring: MockMpcKeyring = new MockMpcKeyring(),
  metadata: { id: string; name: string } = MOCK_MPC_KEYRING_STATE.metadata,
): void {
  mocks.KeyringController.withKeyring.mockReset();
  mocks.KeyringController.withKeyring.mockImplementation(
    async (_selector, callback) => {
      return callback({
        keyring: asKeyring(keyring),
        metadata,
      });
    },
  );
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
    it('creates a money account for the primary entropy source', async () => {
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
    describe('Money Keyring', () => {
      it('creates a new money account with the correct shape', async () => {
        const { controller } = setup();
        const account =
          await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
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
          methods: expect.arrayContaining(['personal_sign']),
        });
        expect(typeof account.id).toBe('string');
      });

      it('persists the created account to state and sets it as the default', async () => {
        const { controller } = setup();
        const account =
          await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
      });

      it('does not override an existing default when creating another account', async () => {
        const { controller } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
          defaultMoneyAccountId: MOCK_MONEY_ACCOUNT.id,
        });
        const account = await controller.createMoneyAccount({
          keyringType: KeyringTypes.money,
          entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
        });
        expect(account.id).not.toBe(MOCK_MONEY_ACCOUNT.id);
        expect(controller.state.defaultMoneyAccountId).toBe(
          MOCK_MONEY_ACCOUNT.id,
        );
      });

      it('returns the existing account without calling withKeyring (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MONEY_ACCOUNT],
        });
        const account =
          await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
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
        const account =
          await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
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
        const account =
          await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
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
          controller.createMoneyAccount(CREATE_MONEY_PARAMS),
          controller.createMoneyAccount(CREATE_MONEY_PARAMS),
        ]);

        // The mutex in #withMoneyKeyring serializes the two calls, so only the first
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
          controller.createMoneyAccount(CREATE_MONEY_PARAMS),
        ).rejects.toThrow('Unexpected keyring error');
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({ isUnlocked: false });

        await expect(
          controller.createMoneyAccount(CREATE_MONEY_PARAMS),
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
        await controller.createMoneyAccount(CREATE_MONEY_PARAMS);
      });

      it('uses the explicitly provided entropy source', async () => {
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_HD_KEYRING,
            {
              type: 'HD Key Tree',
              accounts: ['0x2222222222222222222222222222222222222222'],
              metadata: {
                id: MOCK_OTHER_ENTROPY_SOURCE_ID,
                name: 'HD Key Tree',
              },
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

        const account = await controller.createMoneyAccount({
          keyringType: KeyringTypes.money,
          entropySource: MOCK_OTHER_ENTROPY_SOURCE_ID,
        });
        expect(
          account.options.entropy?.type === 'mnemonic' &&
            account.options.entropy.id,
        ).toBe(MOCK_OTHER_ENTROPY_SOURCE_ID);
      });

      it('is callable via the messenger', async () => {
        const { rootMessenger } = setup();

        const account = await rootMessenger.call(
          'MoneyAccountController:createMoneyAccount',
          CREATE_MONEY_PARAMS,
        );
        expect(account).toMatchObject({
          address: MOCK_ADDRESS,
          options: { entropy: { id: MOCK_ENTROPY_SOURCE_ID } },
        });
      });
    });

    describe('MPC Keyring', () => {
      const createMpcParams = {
        keyringType: MPC_KEYRING_TYPE,
      } as const;

      it('creates an account from an existing MPC keyring', async () => {
        const { controller, mocks } = setup({
          keyrings: [MOCK_HD_KEYRING, MOCK_MPC_KEYRING_STATE],
        });
        mockMpcWithKeyring(mocks);

        const account = await controller.createMoneyAccount(createMpcParams);

        expect(account).toMatchObject({
          address: MOCK_MPC_ADDRESS,
          type: 'eip155:eoa',
          options: {
            entropy: { type: 'custom' },
            exportable: false,
            keyringId: MOCK_MPC_KEYRING_ID,
          },
        });
        expect(controller.state.moneyAccounts[account.id]).toStrictEqual(
          account,
        );
        expect(controller.state.defaultMoneyAccountId).toBe(account.id);
      });

      it('adds an account when the MPC keyring has none', async () => {
        const { controller, mocks } = setup({
          keyrings: [MOCK_HD_KEYRING, MOCK_MPC_KEYRING_STATE],
        });
        const mockKeyring = new MockMpcKeyring({ accounts: [] });
        mockMpcWithKeyring(mocks, mockKeyring);

        const account = await controller.createMoneyAccount(createMpcParams);

        expect(account.address).toBe(MOCK_MPC_ADDRESS);
      });

      it('returns the existing account without calling withKeyring (idempotent)', async () => {
        const { controller, mocks } = setup({
          accounts: [MOCK_MPC_ACCOUNT],
          keyrings: [MOCK_HD_KEYRING, MOCK_MPC_KEYRING_STATE],
        });

        const account = await controller.createMoneyAccount({
          keyringType: MPC_KEYRING_TYPE,
          keyringId: MOCK_MPC_KEYRING_ID,
        });

        expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
        expect(mocks.KeyringController.withKeyring).not.toHaveBeenCalled();
      });

      it('throws when no MPC keyring exists', async () => {
        const { controller, mocks } = setup();
        mocks.KeyringController.withKeyring.mockReset();
        mocks.KeyringController.withKeyring.mockRejectedValue(
          new KeyringControllerError(
            KeyringControllerErrorMessage.KeyringNotFound,
          ),
        );

        await expect(
          controller.createMoneyAccount(createMpcParams),
        ).rejects.toThrow('No MPC keyring found');
        expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
      });

      it('throws when the given MPC keyring id is not found', async () => {
        const { controller, mocks } = setup();
        mocks.KeyringController.withKeyring.mockReset();
        mocks.KeyringController.withKeyring.mockRejectedValue(
          new KeyringControllerError(
            KeyringControllerErrorMessage.KeyringNotFound,
          ),
        );

        await expect(
          controller.createMoneyAccount({
            keyringType: MPC_KEYRING_TYPE,
            keyringId: 'missing-mpc',
          }),
        ).rejects.toThrow('No MPC keyring found');
      });

      it('rethrows unexpected errors from withKeyring', async () => {
        const { controller, mocks } = setup();
        mocks.KeyringController.withKeyring.mockReset();
        mocks.KeyringController.withKeyring.mockRejectedValue(
          new Error('Unexpected MPC keyring error'),
        );

        await expect(
          controller.createMoneyAccount({
            keyringType: MPC_KEYRING_TYPE,
            keyringId: MOCK_MPC_KEYRING_ID,
          }),
        ).rejects.toThrow('Unexpected MPC keyring error');
      });

      it('throws when multiple MPC keyrings exist and keyringId is omitted', async () => {
        const { controller } = setup({
          keyrings: [
            MOCK_MPC_KEYRING_STATE,
            {
              type: MPC_KEYRING_TYPE,
              accounts: ['0x3333333333333333333333333333333333333333'],
              metadata: { id: MOCK_MPC_KEYRING_ID_2, name: 'MPC Keyring' },
            },
          ],
        });

        await expect(
          controller.createMoneyAccount(createMpcParams),
        ).rejects.toThrow('Multiple MPC keyrings found; provide keyringId');
      });

      it('uses the provided keyringId when multiple MPC keyrings exist', async () => {
        const { controller, mocks } = setup({
          keyrings: [
            MOCK_MPC_KEYRING_STATE,
            {
              type: MPC_KEYRING_TYPE,
              accounts: ['0x3333333333333333333333333333333333333333'],
              metadata: { id: MOCK_MPC_KEYRING_ID_2, name: 'MPC Keyring' },
            },
          ],
        });
        mockMpcWithKeyring(mocks, new MockMpcKeyring(), {
          id: MOCK_MPC_KEYRING_ID_2,
          name: 'MPC Keyring',
        });

        const account = await controller.createMoneyAccount({
          keyringType: MPC_KEYRING_TYPE,
          keyringId: MOCK_MPC_KEYRING_ID_2,
        });

        expect(account.options.keyringId).toBe(MOCK_MPC_KEYRING_ID_2);
        expect(mocks.KeyringController.withKeyring).toHaveBeenCalledWith(
          { id: MOCK_MPC_KEYRING_ID_2 },
          expect.any(Function),
        );
      });

      it('throws when the selected keyring is not an MPC keyring', async () => {
        const { controller, mocks } = setup();
        mocks.KeyringController.withKeyring.mockReset();
        mocks.KeyringController.withKeyring.mockImplementation(
          async (_selector, callback) => {
            return callback({
              keyring: asKeyring(new MockMoneyKeyring()),
              metadata: { id: 'not-mpc', name: 'Money Keyring' },
            });
          },
        );

        await expect(
          controller.createMoneyAccount({
            keyringType: MPC_KEYRING_TYPE,
            keyringId: 'not-mpc',
          }),
        ).rejects.toThrow('Keyring not-mpc is not an MPC Keyring');
      });

      it('throws when the keyring is locked', async () => {
        const { controller } = setup({
          isUnlocked: false,
          keyrings: [MOCK_MPC_KEYRING_STATE],
        });

        await expect(
          controller.createMoneyAccount(createMpcParams),
        ).rejects.toThrow(
          'Cannot create a money account while the keyring is locked',
        );
      });
    });
  });

  describe('addMoneyAccount', () => {
    it('registers an arbitrary account and sets it as the default', () => {
      const { controller } = setup();

      const account = controller.addMoneyAccount(MOCK_MPC_ACCOUNT);

      expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
      expect(controller.state.moneyAccounts[MOCK_MPC_ACCOUNT.id]).toStrictEqual(
        MOCK_MPC_ACCOUNT,
      );
      expect(controller.state.defaultMoneyAccountId).toBe(MOCK_MPC_ACCOUNT.id);
    });

    it('returns the existing account without replacing it (idempotent)', () => {
      const { controller } = setup({ accounts: [MOCK_MPC_ACCOUNT] });
      const mutated: MoneyAccount = {
        ...MOCK_MPC_ACCOUNT,
        address: '0x9999999999999999999999999999999999999999',
      };

      const account = controller.addMoneyAccount(mutated);

      expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
      expect(controller.state.moneyAccounts[MOCK_MPC_ACCOUNT.id]).toStrictEqual(
        MOCK_MPC_ACCOUNT,
      );
    });

    it('does not override an existing default', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });

      controller.addMoneyAccount(MOCK_MPC_ACCOUNT);

      expect(controller.state.defaultMoneyAccountId).toBe(
        MOCK_MONEY_ACCOUNT.id,
      );
    });

    it('is callable via the messenger', () => {
      const { rootMessenger } = setup();

      const account = rootMessenger.call(
        'MoneyAccountController:addMoneyAccount',
        MOCK_MPC_ACCOUNT,
      );

      expect(account).toStrictEqual(MOCK_MPC_ACCOUNT);
    });
  });

  describe('setDefaultMoneyAccount', () => {
    it('sets the default account', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
        defaultMoneyAccountId: MOCK_MONEY_ACCOUNT.id,
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
        defaultMoneyAccountId: MOCK_MONEY_ACCOUNT.id,
      });

      rootMessenger.call(
        'MoneyAccountController:setDefaultMoneyAccount',
        MOCK_MPC_ACCOUNT.id,
      );

      expect(controller.state.defaultMoneyAccountId).toBe(MOCK_MPC_ACCOUNT.id);
    });
  });

  describe('getMoneyAccount', () => {
    it('returns the default account when no selector is provided', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
        defaultMoneyAccountId: MOCK_MONEY_ACCOUNT_2.id,
      });

      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MONEY_ACCOUNT_2);
    });

    it('returns undefined when no default is set', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        defaultMoneyAccountId: null,
      });

      expect(controller.getMoneyAccount()).toBeUndefined();
    });

    it('returns the account for the given id', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MPC_ACCOUNT],
      });

      expect(
        controller.getMoneyAccount({ id: MOCK_MPC_ACCOUNT.id }),
      ).toStrictEqual(MOCK_MPC_ACCOUNT);
    });

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
