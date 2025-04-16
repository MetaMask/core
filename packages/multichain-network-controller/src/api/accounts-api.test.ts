import {
  BtcScope,
  SolScope,
  EthScope,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  type CaipAccountId,
  type CaipChainId,
  type CaipReference,
  KnownCaipNamespace,
} from '@metamask/utils';

import {
  type ActiveNetworksResponse,
  toAllowedCaipAccountIds,
  toActiveNetworksByAddress,
  buildActiveNetworksUrl,
  MULTICHAIN_ACCOUNTS_BASE_URL,
} from './accounts-api';

const MOCK_ADDRESSES = {
  evm: '0x1234567890123456789012345678901234567890',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  bitcoin: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
} as const;

const MOCK_CAIP_IDS = {
  // Use of scope (CAIP-2) to craft a CAIP-10 identifiers.
  evm: `${EthScope.Mainnet}:${MOCK_ADDRESSES.evm}`,
  solana: `${SolScope.Mainnet}:${MOCK_ADDRESSES.solana}`,
  bitcoin: `${BtcScope.Mainnet}:${MOCK_ADDRESSES.bitcoin}`,
} as const;

describe('toAllowedCaipAccountIds', () => {
  const createMockAccount = (
    address: string,
    scopes: CaipChainId[],
    type: InternalAccount['type'],
  ): InternalAccount => ({
    address,
    scopes,
    type,
    id: '1',
    options: {},
    methods: [],
    metadata: {
      name: 'Test Account',
      importTime: Date.now(),
      keyring: { type: 'test' },
    },
  });

  it('formats account with EVM scopes', () => {
    const account = createMockAccount(
      MOCK_ADDRESSES.evm,
      [EthScope.Mainnet, EthScope.Testnet],
      EthAccountType.Eoa,
    );

    const result = toAllowedCaipAccountIds(account);
    expect(result).toStrictEqual([
      `${EthScope.Mainnet}:${MOCK_ADDRESSES.evm}`,
      `${EthScope.Testnet}:${MOCK_ADDRESSES.evm}`,
    ]);
  });

  it('formats account with BTC scope', () => {
    const account = createMockAccount(
      MOCK_ADDRESSES.bitcoin,
      [BtcScope.Mainnet],
      BtcAccountType.P2wpkh,
    );

    const result = toAllowedCaipAccountIds(account);
    expect(result).toStrictEqual([
      `${BtcScope.Mainnet}:${MOCK_ADDRESSES.bitcoin}`,
    ]);
  });

  it('formats account with Solana scope', () => {
    const account = createMockAccount(
      MOCK_ADDRESSES.solana,
      [SolScope.Mainnet],
      SolAccountType.DataAccount,
    );

    const result = toAllowedCaipAccountIds(account);
    expect(result).toStrictEqual([
      `${SolScope.Mainnet}:${MOCK_ADDRESSES.solana}`,
    ]);
  });

  it('excludes unsupported scopes', () => {
    const account = createMockAccount(
      MOCK_ADDRESSES.evm,
      [EthScope.Mainnet, 'unsupported:123'],
      EthAccountType.Eoa,
    );

    const result = toAllowedCaipAccountIds(account);
    expect(result).toStrictEqual([`${EthScope.Mainnet}:${MOCK_ADDRESSES.evm}`]);
  });

  it('returns empty array for account with no supported scopes', () => {
    const account = createMockAccount(
      MOCK_ADDRESSES.evm,
      ['unsupported:123'],
      EthAccountType.Eoa,
    );

    const result = toAllowedCaipAccountIds(account);
    expect(result).toStrictEqual([]);
  });
});

describe('toActiveNetworksByAddress', () => {
  const SOLANA_MAINNET: CaipReference = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

  it('formats EVM network responses', () => {
    const response: ActiveNetworksResponse = {
      activeNetworks: [
        `${KnownCaipNamespace.Eip155}:1:${MOCK_ADDRESSES.evm}`,
        `${KnownCaipNamespace.Eip155}:137:${MOCK_ADDRESSES.evm}`,
      ],
    };

    const result = toActiveNetworksByAddress(response);

    expect(result).toStrictEqual({
      [MOCK_ADDRESSES.evm]: {
        namespace: KnownCaipNamespace.Eip155,
        activeChains: ['1', '137'],
      },
    });
  });

  it('formats non-EVM network responses', () => {
    const response: ActiveNetworksResponse = {
      activeNetworks: [
        `${KnownCaipNamespace.Solana}:${SOLANA_MAINNET}:${MOCK_ADDRESSES.solana}`,
      ],
    };

    const result = toActiveNetworksByAddress(response);

    expect(result).toStrictEqual({
      [MOCK_ADDRESSES.solana]: {
        namespace: KnownCaipNamespace.Solana,
        activeChains: [SOLANA_MAINNET],
      },
    });
  });

  it('formats mixed EVM and non-EVM networks', () => {
    const response: ActiveNetworksResponse = {
      activeNetworks: [
        `${KnownCaipNamespace.Eip155}:1:${MOCK_ADDRESSES.evm}`,
        `${KnownCaipNamespace.Solana}:${SOLANA_MAINNET}:${MOCK_ADDRESSES.solana}`,
      ],
    };

    const result = toActiveNetworksByAddress(response);

    expect(result).toStrictEqual({
      [MOCK_ADDRESSES.evm]: {
        namespace: KnownCaipNamespace.Eip155,
        activeChains: ['1'],
      },
      [MOCK_ADDRESSES.solana]: {
        namespace: KnownCaipNamespace.Solana,
        activeChains: [SOLANA_MAINNET],
      },
    });
  });

  it('returns empty object for empty response', () => {
    const response: ActiveNetworksResponse = {
      activeNetworks: [],
    };

    const result = toActiveNetworksByAddress(response);

    expect(result).toStrictEqual({});
  });

  it('formats multiple addresses with different networks', () => {
    const secondEvmAddress = '0x9876543210987654321098765432109876543210';
    const response: ActiveNetworksResponse = {
      activeNetworks: [
        `${KnownCaipNamespace.Eip155}:1:${MOCK_ADDRESSES.evm}`,
        `${KnownCaipNamespace.Eip155}:137:${secondEvmAddress}`,
      ],
    };

    const result = toActiveNetworksByAddress(response);

    expect(result).toStrictEqual({
      [MOCK_ADDRESSES.evm]: {
        namespace: KnownCaipNamespace.Eip155,
        activeChains: ['1'],
      },
      [secondEvmAddress]: {
        namespace: KnownCaipNamespace.Eip155,
        activeChains: ['137'],
      },
    });
  });
});

describe('buildActiveNetworksUrl', () => {
  it('constructs URL with single account ID', () => {
    const url = buildActiveNetworksUrl([MOCK_CAIP_IDS.evm]);
    expect(url.toString()).toBe(
      `${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks?accountIds=${encodeURIComponent(MOCK_CAIP_IDS.evm)}`,
    );
  });

  it('constructs URL with multiple account IDs', () => {
    const accountIds: CaipAccountId[] = [
      MOCK_CAIP_IDS.evm,
      MOCK_CAIP_IDS.solana,
    ];
    const url = buildActiveNetworksUrl(accountIds);
    expect(url.toString()).toBe(
      `${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks?accountIds=${encodeURIComponent(accountIds.join(','))}`,
    );
  });
});
