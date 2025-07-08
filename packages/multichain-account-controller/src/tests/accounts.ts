import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
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

const ETH_EOA_METHODS = [
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

export const MOCK_HD_ACCOUNT_1: InternalAccount = {
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

export const MOCK_HD_ACCOUNT_2: InternalAccount = {
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

export const MOCK_SNAP_ACCOUNT_1: InternalAccount = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: {
    entropySource: MOCK_HD_KEYRING_2.metadata.id,
    index: 0,
  }, // Note: shares entropy with MOCK_HD_ACCOUNT_2
  methods: SOL_METHODS,
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

export class MockAccountBuilder {
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

  withAddressSuffix(suffix: string) {
    this.#account.address += suffix;
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
