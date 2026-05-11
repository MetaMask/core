import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { RampsOrder } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { NATIVE_TOKEN_ADDRESS } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import { ETH_MAINNET_FIAT_ASSET, FIAT_ASSET_ID_BY_TX_TYPE } from './constants';
import type { TransactionPayFiatAsset } from './constants';
import {
  deriveFiatAssetForFiatPayment,
  getRawSourceAmountFromOrderCryptoAmount,
  resolveSourceAmountRaw,
} from './utils';

jest.mock('@ethersproject/providers', () => ({
  ...jest.requireActual('@ethersproject/providers'),
  Web3Provider: jest.fn(),
}));

const TX_HASH_MOCK = '0xabc123';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const ERC20_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'net-client-1';
const PROVIDER_MOCK = { request: jest.fn() };

const NATIVE_FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
  address: NATIVE_TOKEN_ADDRESS,
  chainId: CHAIN_ID_MOCK,
};

const ERC20_FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
  address: ERC20_ADDRESS_MOCK,
  chainId: CHAIN_ID_MOCK,
};

const erc20Interface = new Interface(abiERC20);

function buildTransferCallData(to: Hex, amount: string): string {
  return erc20Interface.encodeFunctionData('transfer', [to, amount]);
}

function getOrderMock(overrides: Partial<RampsOrder> = {}): RampsOrder {
  return {
    cryptoAmount: '1.5',
    txHash: TX_HASH_MOCK,
    ...overrides,
  } as RampsOrder;
}

const FEATURE_FLAG_ASSET_MOCK: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000000abc',
  chainId: '0xa',
};

describe('Fiat Utils', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });
  });

  describe('deriveFiatAssetForFiatPayment', () => {
    it('returns asset from feature flag when present', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
    });

    it('returns feature flag asset over hardcoded asset when both exist', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
      expect(result).not.toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns hardcoded asset when feature flag has no entry for the type', () => {
      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns hardcoded asset for direct transaction type', () => {
      const transaction = {
        type: TransactionType.perpsDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('returns hardcoded asset for supported nested transaction in batch', () => {
      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('skips unsupported nested types and finds supported one in batch', () => {
      const transaction = {
        nestedTransactions: [
          { type: TransactionType.tokenMethodApprove },
          { type: TransactionType.perpsDeposit },
        ],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('returns feature flag asset for supported nested transaction in batch', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.perpsDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
    });

    it('returns ETH mainnet fallback for unsupported type', () => {
      const transaction = {
        type: TransactionType.contractInteraction,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(ETH_MAINNET_FIAT_ASSET);
    });

    it('returns ETH mainnet fallback for batch with no nested transactions', () => {
      const transaction = {
        nestedTransactions: [],
        type: TransactionType.batch,
      } as unknown as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(ETH_MAINNET_FIAT_ASSET);
    });
  });

  describe('resolveSourceAmountRaw', () => {
    const {
      messenger,
      findNetworkClientIdByChainIdMock,
      getNetworkClientByIdMock,
      getTokensControllerStateMock,
      getRemoteFeatureFlagControllerStateMock:
        resolveRemoteFeatureFlagControllerStateMock,
    } = getMessengerMock();

    let mockGetTransaction: jest.Mock;

    beforeEach(() => {
      jest.resetAllMocks();

      mockGetTransaction = jest.fn();

      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
      getNetworkClientByIdMock.mockReturnValue({
        provider: PROVIDER_MOCK,
      } as never);

      resolveRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
      });

      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            '0x0': [
              {
                address: ERC20_ADDRESS_MOCK,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: '',
                name: 'USDC',
                isERC721: false,
              },
            ],
          },
        },
        allTokensStale: {},
        allIgnoredTokens: {},
        allDetectedTokens: {},
      } as never);

      (Web3Provider as unknown as jest.Mock).mockImplementation(() => ({
        getTransaction: mockGetTransaction,
      }));
    });

    it('returns on-chain amount when txHash is present and read succeeds', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: buildTransferCallData(WALLET_ADDRESS_MOCK, '7000000'),
        value: { toString: () => '0' },
      });

      const result = await resolveSourceAmountRaw({
        messenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
      });

      expect(result).toBe('7000000');
    });

    it('falls back to cryptoAmount when txHash is missing', async () => {
      const result = await resolveSourceAmountRaw({
        messenger,
        order: getOrderMock({ txHash: '' }),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
      });

      expect(result).toBe('1500000');
      expect(mockGetTransaction).not.toHaveBeenCalled();
    });

    it('falls back to cryptoAmount when on-chain read returns undefined', async () => {
      mockGetTransaction.mockResolvedValue(null);

      const result = await resolveSourceAmountRaw({
        messenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
      });

      expect(result).toBe('1500000');
    });

    it('falls back to cryptoAmount when on-chain read throws', async () => {
      mockGetTransaction.mockRejectedValue(new Error('Network error'));

      const result = await resolveSourceAmountRaw({
        messenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
      });

      expect(result).toBe('1500000');
    });

    it('returns on-chain native token amount when txHash is present', async () => {
      mockGetTransaction.mockResolvedValue({
        value: { toString: () => '2000000000000000000' },
      });

      const result = await resolveSourceAmountRaw({
        messenger,
        order: getOrderMock(),
        fiatAsset: NATIVE_FIAT_ASSET_MOCK,
      });

      expect(result).toBe('2000000000000000000');
    });
  });

  describe('getRawSourceAmountFromOrderCryptoAmount', () => {
    it('converts human-readable amount to raw token amount', () => {
      expect(
        getRawSourceAmountFromOrderCryptoAmount({
          cryptoAmount: '1.2345',
          decimals: 18,
        }),
      ).toBe('1234500000000000000');
    });

    it('truncates fractional sub-decimal amounts', () => {
      expect(
        getRawSourceAmountFromOrderCryptoAmount({
          cryptoAmount: '1.1234567',
          decimals: 6,
        }),
      ).toBe('1123456');
    });

    it.each([
      ['0', 'Invalid fiat order crypto amount: 0'],
      ['-1', 'Invalid fiat order crypto amount: -1'],
      ['NaN', 'Invalid fiat order crypto amount: NaN'],
    ])('throws for invalid crypto amount %s', (cryptoAmount, expectedError) => {
      expect(() =>
        getRawSourceAmountFromOrderCryptoAmount({ cryptoAmount, decimals: 18 }),
      ).toThrow(expectedError);
    });

    it('throws when computed amount rounds to zero', () => {
      expect(() =>
        getRawSourceAmountFromOrderCryptoAmount({
          cryptoAmount: '0.0000000000000000001',
          decimals: 18,
        }),
      ).toThrow('Computed fiat order source amount is not positive');
    });
  });
});
