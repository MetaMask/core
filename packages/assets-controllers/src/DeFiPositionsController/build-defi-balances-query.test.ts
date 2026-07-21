import {
  BtcAccountType,
  EthAccountType,
  EthMethod,
  EthScope,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { createMockInternalAccount } from '../../../accounts-controller/tests/mocks';
import {
  buildDeFiBalancesQuery,
  DEFI_SUPPORTED_NETWORKS,
} from './build-defi-balances-query';

const EVM_ADDRESS = '0x0000000000000000000000000000000000000001';
const SOLANA_ADDRESS = 'So11111111111111111111111111111111111111112';

const mockEvmAccount = createMockInternalAccount({
  id: 'evm-account-id',
  address: EVM_ADDRESS,
  type: EthAccountType.Eoa,
});

const mockSolanaAccount: InternalAccount = {
  id: 'solana-account-id',
  address: SOLANA_ADDRESS,
  options: {},
  methods: [SolMethod.SendAndConfirmTransaction],
  scopes: [SolScope.Mainnet],
  type: SolAccountType.DataAccount,
  metadata: {
    name: 'Solana Account',
    keyring: { type: KeyringTypes.snap },
    importTime: Date.now(),
    lastSelected: Date.now(),
    snap: {
      id: 'mock-sol-snap',
      name: 'mock-sol-snap',
      enabled: true,
    },
  },
};

const mockBtcAccount = createMockInternalAccount({
  id: 'btc-account-id',
  type: BtcAccountType.P2wpkh,
});

describe('buildDeFiBalancesQuery', () => {
  it('builds an EVM CAIP account spanning all supported EVM networks', () => {
    const mixedCaseEvmAccount = createMockInternalAccount({
      id: 'evm-account-id',
      address: EVM_ADDRESS.toUpperCase(),
      type: EthAccountType.Eoa,
    });
    const result = buildDeFiBalancesQuery([
      mixedCaseEvmAccount,
      mockBtcAccount,
    ]);

    const expectedEvmNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('eip155:'),
    );

    expect(result.networks).toStrictEqual(expectedEvmNetworks);
    expect([...result.internalAccountIdByCaip.entries()]).toStrictEqual([
      [`eip155:0:${EVM_ADDRESS.toLowerCase()}`, 'evm-account-id'],
    ]);
  });

  it('builds a Solana CAIP account for supported Solana networks', () => {
    const result = buildDeFiBalancesQuery([mockSolanaAccount, mockBtcAccount]);

    const expectedSolanaNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('solana:'),
    );
    const [, solanaReference] = SolScope.Mainnet.split(':');

    expect(result.networks).toStrictEqual(expectedSolanaNetworks);
    expect([...result.internalAccountIdByCaip.entries()]).toStrictEqual([
      [`solana:${solanaReference}:${SOLANA_ADDRESS}`, 'solana-account-id'],
    ]);
  });

  it('combines EVM and Solana accounts from the selected group', () => {
    const result = buildDeFiBalancesQuery([
      mockEvmAccount,
      mockSolanaAccount,
      mockBtcAccount,
    ]);

    const expectedEvmNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('eip155:'),
    );
    const expectedSolanaNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('solana:'),
    );

    // EVM networks are added first, then Solana — not the literal
    // DEFI_SUPPORTED_NETWORKS order (where Solana sits mid-list).
    expect(result.networks).toStrictEqual([
      ...expectedEvmNetworks,
      ...expectedSolanaNetworks,
    ]);
    expect(result.internalAccountIdByCaip.size).toBe(2);
    expect(
      result.internalAccountIdByCaip.get(
        `eip155:0:${EVM_ADDRESS.toLowerCase()}`,
      ),
    ).toBe('evm-account-id');
    expect(
      result.internalAccountIdByCaip.get(
        `solana:${SolScope.Mainnet.split(':')[1]}:${SOLANA_ADDRESS}`,
      ),
    ).toBe('solana-account-id');
  });

  it('returns empty networks and map when there are no supported accounts', () => {
    const result = buildDeFiBalancesQuery([mockBtcAccount]);

    expect(result).toStrictEqual({
      networks: [],
      internalAccountIdByCaip: new Map(),
    });
  });

  it('uses only the first EVM and first Solana account in the group', () => {
    const secondEvmAccount = createMockInternalAccount({
      id: 'evm-account-id-2',
      address: '0x0000000000000000000000000000000000000002',
      type: EthAccountType.Eoa,
      methods: [EthMethod.SignTransaction],
      scopes: [EthScope.Eoa],
    });
    const secondSolanaAccount: InternalAccount = {
      ...mockSolanaAccount,
      id: 'solana-account-id-2',
      address: 'So22222222222222222222222222222222222222222',
    };

    const result = buildDeFiBalancesQuery([
      mockEvmAccount,
      secondEvmAccount,
      mockSolanaAccount,
      secondSolanaAccount,
    ]);

    expect(result.internalAccountIdByCaip.size).toBe(2);
    expect(
      result.internalAccountIdByCaip.get(
        `eip155:0:${EVM_ADDRESS.toLowerCase()}`,
      ),
    ).toBe('evm-account-id');
    expect(
      result.internalAccountIdByCaip.get(
        `solana:${SolScope.Mainnet.split(':')[1]}:${SOLANA_ADDRESS}`,
      ),
    ).toBe('solana-account-id');
  });
});
