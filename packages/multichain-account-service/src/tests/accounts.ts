/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import { isBip44Account } from '@metamask/account-api';
import type {
  DiscoveredAccount,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  BtcScope,
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { v4 as uuid } from 'uuid';

export const MOCK_MNEMONIC =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

export const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const SOL_METHODS = Object.values(SolMethod);

export const MOCK_SNAP_1 = {
  id: 'local:mock-snap-id-1',
  name: 'Mock Snap 1',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 1',
  },
};

export const MOCK_SNAP_2 = {
  id: 'local:mock-snap-id-2',
  name: 'Mock Snap 2',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 2',
  },
};

export const MOCK_ENTROPY_SOURCE_1 = 'mock-keyring-id-1';
export const MOCK_ENTROPY_SOURCE_2 = 'mock-keyring-id-2';

export const MOCK_HD_KEYRING_1 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_1, name: 'HD Keyring 1' },
  accounts: ['0x123'],
};

export const MOCK_HD_KEYRING_2 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_2, name: 'HD Keyring 2' },
  accounts: ['0x456'],
};

export const MOCK_HD_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
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

export const MOCK_HD_ACCOUNT_2: Bip44Account<InternalAccount> = {
  id: 'mock-id-2',
  address: '0x456',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
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

export const MOCK_SOL_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      // NOTE: shares entropy with MOCK_HD_ACCOUNT_2
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
  },
  methods: SOL_METHODS,
  type: SolAccountType.DataAccount,
  scopes: [SolScope.Mainnet, SolScope.Testnet, SolScope.Devnet],
  metadata: {
    name: 'Solana Account 1',
    keyring: { type: KeyringTypes.snap },
    snap: MOCK_SNAP_1,
    importTime: 0,
    lastSelected: 0,
  },
};

export const MOCK_SOL_DISCOVERED_ACCOUNT_1: DiscoveredAccount = {
  type: 'bip44',
  scopes: [SolScope.Mainnet],
  derivationPath: `m/44'/501'/0'/0'`,
};

export const MOCK_BTC_P2WPKH_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'b0f030d8-e101-4b5a-a3dd-13f8ca8ec1db',
  type: BtcAccountType.P2wpkh,
  methods: [BtcMethod.SendBitcoin],
  address: 'bc1qx8ls07cy8j8nrluy2u0xwn7gh8fxg0rg4s8zze',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      // NOTE: shares entropy with MOCK_HD_ACCOUNT_2
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
  },
  scopes: [BtcScope.Mainnet],
  metadata: {
    name: 'Bitcoin Native Segwit Account 1',
    importTime: 0,
    keyring: {
      type: 'Snap keyring',
    },
    snap: {
      id: 'mock-btc-snap-id',
      enabled: true,
      name: 'Mock Bitcoin Snap',
    },
  },
};

export const MOCK_BTC_P2TR_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'a20c2e1a-6ff6-40ba-b8e0-ccdb6f9933bb',
  type: BtcAccountType.P2tr,
  methods: [BtcMethod.SendBitcoin],
  address: 'tb1p5cyxnuxmeuwuvkwfem96lxx9wex9kkf4mt9ll6q60jfsnrzqg4sszkqjnh',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      // NOTE: shares entropy with MOCK_HD_ACCOUNT_2
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
  },
  scopes: [BtcScope.Testnet],
  metadata: {
    name: 'Bitcoin Taproot Account 1',
    importTime: 0,
    keyring: {
      type: 'Snap keyring',
    },
    snap: {
      id: 'mock-btc-snap-id',
      enabled: true,
      name: 'Mock Bitcoin Snap',
    },
  },
};

export const MOCK_SNAP_ACCOUNT_1 = MOCK_SOL_ACCOUNT_1;

export const MOCK_SNAP_ACCOUNT_2: InternalAccount = {
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

export const MOCK_SNAP_ACCOUNT_3 = MOCK_BTC_P2WPKH_ACCOUNT_1;
export const MOCK_SNAP_ACCOUNT_4 = MOCK_BTC_P2TR_ACCOUNT_1;

export const MOCK_HARDWARE_ACCOUNT_1: InternalAccount = {
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

export class MockAccountBuilder<Account extends KeyringAccount> {
  readonly #account: Account;

  constructor(account: Account) {
    // Make a deep-copy to avoid mutating the same ref.
    this.#account = JSON.parse(JSON.stringify(account));
  }

  static from<Account extends KeyringAccount>(
    account: Account,
  ): MockAccountBuilder<Account> {
    return new MockAccountBuilder(account);
  }

  withId(id: InternalAccount['id']) {
    this.#account.id = id;
    return this;
  }

  withUuid() {
    this.#account.id = uuid();
    return this;
  }

  withAddressSuffix(suffix: string) {
    this.#account.address += suffix;
    return this;
  }

  withEntropySource(entropySource: EntropySourceId) {
    if (isBip44Account(this.#account)) {
      this.#account.options.entropy.id = entropySource;
    }
    return this;
  }

  withGroupIndex(groupIndex: number) {
    if (isBip44Account(this.#account)) {
      this.#account.options.entropy.groupIndex = groupIndex;
    }
    return this;
  }

  get() {
    return this.#account;
  }
}

export const MOCK_WALLET_1_ENTROPY_SOURCE = MOCK_ENTROPY_SOURCE_1;

export const MOCK_WALLET_1_EVM_ACCOUNT = MockAccountBuilder.from(
  MOCK_HD_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
export const MOCK_WALLET_1_SOL_ACCOUNT = MockAccountBuilder.from(
  MOCK_SOL_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
export const MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT = MockAccountBuilder.from(
  MOCK_BTC_P2WPKH_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();
export const MOCK_WALLET_1_BTC_P2TR_ACCOUNT = MockAccountBuilder.from(
  MOCK_BTC_P2TR_ACCOUNT_1,
)
  .withEntropySource(MOCK_WALLET_1_ENTROPY_SOURCE)
  .withGroupIndex(0)
  .get();

export function mockAsInternalAccount(
  account: KeyringAccount,
): InternalAccount {
  return {
    ...account,
    metadata: {
      name: 'Mocked Account',
      importTime: Date.now(),
      keyring: {
        type: 'mock-keyring-type',
      },
    },
  };
}
