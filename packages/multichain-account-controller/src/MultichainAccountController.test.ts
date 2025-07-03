import { Messenger } from '@metamask/base-controller';
import type {
  EntropySourceId,
  KeyringAccount,
  KeyringRequest,
} from '@metamask/keyring-api';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { v4 as uuid } from 'uuid';

import {
  MultichainAccountController,
  type AllowedActions,
  type AllowedEvents,
  type MultichainAccountControllerActions,
  type MultichainAccountControllerEvents,
  type MultichainAccountControllerMessenger,
} from './MultichainAccountController';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_SNAP_1 = {
  id: 'local:mock-snap-id-1',
  name: 'Mock Snap 1',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 1',
  },
};

const MOCK_SNAP_2 = {
  id: 'local:mock-snap-id-2',
  name: 'Mock Snap 2',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 2',
  },
};

const MOCK_ENTROPY_SOURCE_1 = 'mock-keyring-id-1';
const MOCK_ENTROPY_SOURCE_2 = 'mock-keyring-id-2';

const MOCK_HD_KEYRING_1 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_1, name: 'HD Keyring 1' },
  accounts: ['0x123'],
};

const MOCK_HD_KEYRING_2 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_2, name: 'HD Keyring 2' },
  accounts: ['0x456'],
};

const MOCK_HD_ACCOUNT_1: InternalAccount = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropySource: MOCK_HD_KEYRING_1.metadata.id,
    index: 0,
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 0,
    lastSelected: 0,
    nameLastUpdatedAt: 0,
  },
};

const MOCK_HD_ACCOUNT_2: InternalAccount = {
  id: 'mock-id-2',
  address: '0x456',
  options: {
    entropySource: MOCK_HD_KEYRING_2.metadata.id,
    index: 0,
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 2',
    keyring: { type: KeyringTypes.hd },
    importTime: 0,
    lastSelected: 0,
    nameLastUpdatedAt: 0,
  },
};

const MOCK_SNAP_ACCOUNT_1: InternalAccount = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: {
    entropySource: MOCK_HD_KEYRING_2.metadata.id,
    index: 0,
  }, // Note: shares entropy with MOCK_HD_ACCOUNT_2
  methods: Object.values(SolMethod),
  type: SolAccountType.DataAccount,
  scopes: [SolScope.Mainnet],
  metadata: {
    name: 'Snap Account 1',
    keyring: { type: KeyringTypes.snap },
    snap: MOCK_SNAP_1,
    importTime: 0,
    lastSelected: 0,
  },
};

const MOCK_SNAP_ACCOUNT_2: InternalAccount = {
  id: 'mock-snap-id-2',
  address: '0x789',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Snap Acc 2',
    keyring: { type: KeyringTypes.snap },
    snap: MOCK_SNAP_2,
    importTime: 0,
    lastSelected: 0,
  },
};

const MOCK_HARDWARE_ACCOUNT_1: InternalAccount = {
  id: 'mock-hardware-id-1',
  address: '0xABC',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Hardware Acc 1',
    keyring: { type: KeyringTypes.ledger },
    importTime: 0,
    lastSelected: 0,
  },
};

class MockAccountBuilder {
  readonly #account: InternalAccount;

  constructor(account: InternalAccount) {
    // Make a deep-copy to avoid mutating the same ref.
    this.#account = JSON.parse(JSON.stringify(account));
  }

  static from(account: InternalAccount): MockAccountBuilder {
    return new MockAccountBuilder(account);
  }

  static toKeyringAccount(account: InternalAccount): KeyringAccount {
    const { metadata, ...keyringAccount } = account;

    return keyringAccount;
  }

  withUuuid() {
    this.#account.id = uuid();
    return this;
  }

  withEntropySource(entropySource: EntropySourceId) {
    this.#account.options.entropySource = entropySource;
    return this;
  }

  withGroupIndex(groupIndex: number) {
    this.#account.options.index = groupIndex;
    return this;
  }

  get() {
    return this.#account;
  }
}

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
function getRootMessenger() {
  return new Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the MultichainAccountController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the MultichainAccountController.
 */
function getMultichainAccountControllerMessenger(
  messenger = getRootMessenger(),
): MultichainAccountControllerMessenger {
  return messenger.getRestricted({
    name: 'MultichainAccountController',
    allowedEvents: [],
    allowedActions: [
      'AccountsController:getAccount',
      'AccountsController:getAccountByAddress',
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'KeyringController:withKeyring',
    ],
  });
}

/**
 * Sets up the MultichainAccountController for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.accounts - List of accounts to use.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts,
}: {
  messenger?: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  controller: MultichainAccountController;
  messenger: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
} {
  if (accounts) {
    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      () => accounts,
    );
  }

  const controller = new MultichainAccountController({
    messenger: getMultichainAccountControllerMessenger(messenger),
  });
  return { controller, messenger };
}

describe('MultichainAccountController', () => {
  describe('getMultichainAccounts', () => {
    it('gets multichain accounts', () => {
      const { controller } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          // Wallet 2:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
            .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
            .withGroupIndex(0)
            .get(),
          // Not HD accounts
          MOCK_SNAP_ACCOUNT_2,
          MOCK_HARDWARE_ACCOUNT_1,
        ],
      });

      expect(
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        }),
      ).toHaveLength(1);
      expect(
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toHaveLength(1);
    });

    it('gets multichain accounts with multiple wallets', () => {
      const { controller } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(1)
            .get(),
        ],
      });

      const multichainAccounts = controller.getMultichainAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(multichainAccounts).toHaveLength(2); // Group index 0 + 1.
      expect(multichainAccounts[0].accounts).toHaveLength(1); // Just EVM.
      expect(multichainAccounts[0].accounts[0].type).toBe(EthAccountType.Eoa);
      expect(multichainAccounts[1].accounts).toHaveLength(1); // Just SOL.
      expect(multichainAccounts[1].accounts[0].type).toBe(
        SolAccountType.DataAccount,
      );
    });

    it('throws if trying to access an unknown wallet', () => {
      const { controller } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
        ],
      });

      // Wallet 2 should not exist, thus, this should throw.
      expect(() =>
        // NOTE: We use `getMultichainAccounts` which uses `#getWallet` under the hood.
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toThrow('Unknown wallet, not wallet matching this entropy source');
    });
  });

  describe('getMultichainAccount', () => {
    it('gets a specific multichain account', () => {
      const accounts = [
        // Wallet 1:
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(0)
          .get(),
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(1)
          .get(),
      ];
      const { controller } = setup({
        accounts,
      });

      const groupIndex = 1;
      const multichainAccount = controller.getMultichainAccount({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex,
      });
      expect(multichainAccount.index).toBe(groupIndex);
      expect(multichainAccount.accounts).toHaveLength(1);
      expect(multichainAccount.accounts[0]).toStrictEqual(accounts[1]);
    });

    it('throws if trying to access an out-of-bound group index', () => {
      const { controller } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
        ],
      });

      const groupIndex = 1;
      expect(() =>
        controller.getMultichainAccount({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex,
        }),
      ).toThrow(`No multichain account for index: ${groupIndex}`);
    });
  });

  describe('createNextMultichainAccount', () => {
    it('creates the next multichain account', async () => {
      const messenger = getRootMessenger();

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      // This list will be used to build the initial wallet with 1 multichain account (for
      // group index 0)!
      const mockListMultichainAccounts = jest
        .fn()
        .mockReturnValue([mockEvmAccount]);
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        mockListMultichainAccounts,
      );

      const { controller } = setup({ messenger });

      // Before creating the next multichain account, we need to mock some actions:
      const mockNextEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const mockNextSolAccount = MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .withUuuid() // Required by KeyringClient.
        .get();

      // Required by the EvmAccountProvider:
      const mockWithKeyring = jest
        .fn()
        .mockResolvedValue(mockNextEvmAccount.address);
      messenger.registerActionHandler(
        'KeyringController:withKeyring',
        mockWithKeyring,
      );

      // Required by the SolAccountProvider:
      const mockHandleRequest = jest.fn().mockResolvedValue(
        MockAccountBuilder.toKeyringAccount(mockNextSolAccount), // Required by KeyringClient.
      );
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        mockHandleRequest,
      );

      // Both providers rely on the accounts controller:
      const mockGetAccountByAddress = jest
        .fn()
        .mockResolvedValue(mockNextEvmAccount);
      messenger.registerActionHandler(
        'AccountsController:getAccountByAddress',
        mockGetAccountByAddress,
      );
      const mockGetAccount = jest.fn().mockResolvedValue(mockNextSolAccount);
      messenger.registerActionHandler(
        'AccountsController:getAccount',
        mockGetAccount,
      );

      // Finally, the multichain account will re-use the list of internal account
      // to groups accounts for the new index, so we have to add them to the list
      // of internal accounts, as if they were really created.
      mockListMultichainAccounts.mockReturnValue([
        // Group index 0:
        mockEvmAccount,
        // Group index 1:
        mockNextEvmAccount,
        mockNextSolAccount,
      ]);

      const multichainAccount = await controller.createNextMultichainAccount({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(multichainAccount.index).toBe(1);
      expect(multichainAccount.accounts).toHaveLength(2); // EVM + SOL.
      expect(multichainAccount.accounts[0].type).toBe(EthAccountType.Eoa);
      expect(multichainAccount.accounts[1].type).toBe(
        SolAccountType.DataAccount,
      );
    });
  });

  describe('discoverAndCreateMultichainAccounts', () => {
    it.todo('discovers and creates multichain accounts');
  });
});
