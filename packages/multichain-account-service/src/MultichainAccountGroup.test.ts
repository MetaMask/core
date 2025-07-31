/* eslint-disable jsdoc/require-jsdoc */
import type { AccountSelector, Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  isBip44Account,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import {
  BtcAccountType,
  BtcMethod,
  BtcScope,
  EthAccountType,
  EthMethod,
  EthScope,
  SolScope,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountGroup } from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import type { MockAccountProvider } from './tests';
import {
  MOCK_ENTROPY_SOURCE_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_SOL_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MOCK_BTC_P2WPKH_ACCOUNT_1,
  MOCK_BTC_P2TR_ACCOUNT_1,
  MockAccountBuilder,
} from './tests';

const MOCK_WALLET_1_ENTROPY_SOURCE = MOCK_ENTROPY_SOURCE_1;

const MOCK_WALLET_1_EVM_ACCOUNT = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
const MOCK_WALLET_1_SOL_ACCOUNT = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
const MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT = MockAccountBuilder.from(
  MOCK_BTC_P2WPKH_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
const MOCK_WALLET_1_BTC_P2TR_ACCOUNT = MockAccountBuilder.from(
  MOCK_BTC_P2TR_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();

function setupAccountProvider(
  accounts: InternalAccount[],
): MockAccountProvider {
  const mocks: MockAccountProvider = {
    accounts: [],
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAndCreateAccounts: jest.fn(),
  };

  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;

  const getAccounts = () =>
    mocks.accounts.filter((account) => isBip44Account(account));

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<InternalAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );

  return mocks;
}

function setup({
  groupIndex = 0,
  accounts = [
    [MOCK_WALLET_1_EVM_ACCOUNT],
    [
      MOCK_WALLET_1_SOL_ACCOUNT,
      MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
      MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
      MOCK_SNAP_ACCOUNT_2, // Non-BIP-44 account.
    ],
  ],
}: { groupIndex?: number; accounts?: InternalAccount[][] } = {}): {
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  group: MultichainAccountGroup<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
} {
  const providers = accounts.map(setupAccountProvider);

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    providers,
    entropySource: MOCK_WALLET_1_ENTROPY_SOURCE,
  });

  const group = new MultichainAccountGroup({
    wallet,
    groupIndex,
    providers,
  });

  return { wallet, group, providers };
}

describe('MultichainAccount', () => {
  describe('constructor', () => {
    it('constructs a multichain account group', async () => {
      const accounts = [
        [MOCK_WALLET_1_EVM_ACCOUNT],
        [MOCK_WALLET_1_SOL_ACCOUNT],
      ];
      const groupIndex = 0;
      const { wallet, group } = setup({ groupIndex, accounts });

      const expectedWalletId = toMultichainAccountWalletId(
        wallet.entropySource,
      );
      const expectedAccounts = accounts.flat();

      expect(group.id).toStrictEqual(
        toMultichainAccountGroupId(expectedWalletId, groupIndex),
      );
      expect(group.type).toBe(AccountGroupType.MultichainAccount);
      expect(group.index).toBe(groupIndex);
      expect(group.wallet).toStrictEqual(wallet);
      expect(group.getAccounts()).toHaveLength(expectedAccounts.length);
      expect(group.getAccounts()).toStrictEqual(expectedAccounts);
    });

    it('constructs a multichain account group for a specific index', async () => {
      const groupIndex = 2;
      const { group } = setup({ groupIndex });

      expect(group.index).toBe(groupIndex);
    });
  });

  describe('getAccount', () => {
    it('gets internal account from its id', async () => {
      const evmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const solAccount = MOCK_WALLET_1_SOL_ACCOUNT;
      const { group } = setup({ accounts: [[evmAccount], [solAccount]] });

      expect(group.getAccount(evmAccount.id)).toBe(evmAccount);
      expect(group.getAccount(solAccount.id)).toBe(solAccount);
    });

    it('returns undefined if the account ID does not belong to the multichain account group', async () => {
      const { group } = setup();

      expect(group.getAccount('unknown-id')).toBeUndefined();
    });
  });

  describe('get', () => {
    it.each([
      {
        tc: 'using id',
        selector: { id: MOCK_WALLET_1_EVM_ACCOUNT.id },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
      {
        tc: 'using address',
        selector: { address: MOCK_WALLET_1_SOL_ACCOUNT.address },
        expected: MOCK_WALLET_1_SOL_ACCOUNT,
      },
      {
        tc: 'using type',
        selector: { type: MOCK_WALLET_1_EVM_ACCOUNT.type },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
      {
        tc: 'using scope',
        selector: { scopes: [SolScope.Mainnet] },
        expected: MOCK_WALLET_1_SOL_ACCOUNT,
      },
      {
        tc: 'using another scope (but still included in the list of account.scopes)',
        selector: { scopes: [SolScope.Testnet] },
        expected: MOCK_WALLET_1_SOL_ACCOUNT,
      },
      {
        tc: 'using specific EVM chain still matches with EVM EOA scopes',
        selector: { scopes: [EthScope.Testnet] },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
      {
        tc: 'using multiple scopes',
        selector: { scopes: [SolScope.Mainnet, SolScope.Testnet] },
        expected: MOCK_WALLET_1_SOL_ACCOUNT,
      },
      {
        tc: 'using method',
        selector: { methods: [EthMethod.SignTransaction] },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
      {
        tc: 'using another method',
        selector: { methods: [EthMethod.PersonalSign] },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
      {
        tc: 'using multiple methods',
        selector: {
          methods: [EthMethod.SignTransaction, EthMethod.PersonalSign],
        },
        expected: MOCK_WALLET_1_EVM_ACCOUNT,
      },
    ] as {
      tc: string;
      selector: AccountSelector<Bip44Account<InternalAccount>>;
      expected: Bip44Account<InternalAccount>;
    }[])(
      'gets internal account from selector: $tc',
      async ({ selector, expected }) => {
        const { group } = setup();

        expect(group.get(selector)).toStrictEqual(expected);
      },
    );

    it.each([
      {
        tc: 'using non-matching id',
        selector: { id: '66da96d7-8f24-4895-82d6-183d740c2da1' },
      },
      {
        tc: 'using non-matching address',
        selector: { address: 'unknown-address' },
      },
      {
        tc: 'using non-matching type',
        selector: { type: 'unknown-type' },
      },
      {
        tc: 'using non-matching scope',
        selector: {
          scopes: ['bip122:12a765e31ffd4059bada1e25190f6e98' /* Litecoin */],
        },
      },
      {
        tc: 'using non-matching method',
        selector: { methods: ['eth_unknownMethod'] },
      },
    ] as {
      tc: string;
      selector: AccountSelector<Bip44Account<InternalAccount>>;
    }[])(
      'gets undefined if not matching selector: $tc',
      async ({ selector }) => {
        const { group } = setup();

        expect(group.get(selector)).toBeUndefined();
      },
    );

    it('throws if multiple candidates are found', async () => {
      const { group } = setup();

      const selector = {
        scopes: [EthScope.Mainnet, SolScope.Mainnet],
      };

      expect(() => group.get(selector)).toThrow(
        'Too many account candidates, expected 1, got: 2',
      );
    });
  });

  it.each([
    {
      tc: 'using id',
      selector: { id: MOCK_WALLET_1_EVM_ACCOUNT.id },
      expected: [MOCK_WALLET_1_EVM_ACCOUNT],
    },
    {
      tc: 'using non-matching id',
      selector: { id: '66da96d7-8f24-4895-82d6-183d740c2da1' },
      expected: [],
    },
    {
      tc: 'using address',
      selector: { address: MOCK_WALLET_1_SOL_ACCOUNT.address },
      expected: [MOCK_WALLET_1_SOL_ACCOUNT],
    },
    {
      tc: 'using non-matching address',
      selector: { address: 'unknown-address' },
      expected: [],
    },
    {
      tc: 'using type',
      selector: { type: MOCK_WALLET_1_EVM_ACCOUNT.type },
      expected: [MOCK_WALLET_1_EVM_ACCOUNT],
    },
    {
      tc: 'using non-matching type',
      selector: { type: 'unknown-type' },
      expected: [],
    },
    {
      tc: 'using scope',
      selector: { scopes: [SolScope.Mainnet] },
      expected: [MOCK_WALLET_1_SOL_ACCOUNT],
    },
    {
      tc: 'using another scope (but still included in the list of account.scopes)',
      selector: { scopes: [SolScope.Testnet] },
      expected: [MOCK_WALLET_1_SOL_ACCOUNT],
    },
    {
      tc: 'using specific EVM chain still matches with EVM EOA scopes',
      selector: { scopes: [EthScope.Testnet] },
      expected: [MOCK_WALLET_1_EVM_ACCOUNT],
    },
    {
      tc: 'using multiple scopes',
      selector: { scopes: [BtcScope.Mainnet, BtcScope.Testnet] },
      expected: [
        MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
        MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
      ],
    },
    {
      tc: 'using non-matching scopes',
      selector: {
        scopes: ['bip122:12a765e31ffd4059bada1e25190f6e98' /* Litecoin */],
      },
      expected: [],
    },
    {
      tc: 'using method',
      selector: { methods: [BtcMethod.SendBitcoin] },
      expected: [
        MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
        MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
      ],
    },
    {
      tc: 'using multiple methods',
      selector: {
        methods: [EthMethod.SignTransaction, EthMethod.PersonalSign],
      },
      expected: [MOCK_WALLET_1_EVM_ACCOUNT],
    },
    {
      tc: 'using non-matching method',
      selector: { methods: ['eth_unknownMethod'] },
      expected: [],
    },
    {
      tc: 'using multiple selectors',
      selector: {
        type: EthAccountType.Eoa,
        methods: [EthMethod.SignTransaction, EthMethod.PersonalSign],
      },
      expected: [MOCK_WALLET_1_EVM_ACCOUNT],
    },
    {
      tc: 'using non-matching selectors',
      selector: {
        type: BtcAccountType.P2wpkh,
        methods: [EthMethod.SignTransaction, EthMethod.PersonalSign],
      },
      expected: [],
    },
  ] as {
    tc: string;
    selector: AccountSelector<Bip44Account<InternalAccount>>;
    expected: Bip44Account<InternalAccount>[];
  }[])(
    'selects internal accounts from selector: $tc',
    async ({ selector, expected }) => {
      const { group } = setup();

      expect(group.select(selector)).toStrictEqual(expected);
    },
  );
});
