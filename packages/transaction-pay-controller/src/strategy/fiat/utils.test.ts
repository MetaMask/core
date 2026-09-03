import type { RampsOrder } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { NATIVE_TOKEN_ADDRESS } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import {
  ETH_MAINNET_FIAT_ASSET,
  FIAT_ASSET_ID_BY_TX_TYPE,
} from './constants.js';
import type { TransactionPayFiatAsset } from './constants.js';
import {
  deriveFiatAssetForFiatPayment,
  getRawSourceAmountFromOrderCryptoAmount,
  isMoneyAccountDepositTransaction,
  resolveSourceAmountRaw,
} from './utils.js';

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

    it('uses feature flag enabled types to filter nested transactions in batch', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            enabledTransactionTypes: [TransactionType.predictDeposit],
          },
        },
      });

      const transaction = {
        nestedTransactions: [
          { type: TransactionType.perpsDeposit },
          { type: TransactionType.predictDeposit },
        ],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('falls back to batch type when no nested transaction matches enabled types', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            enabledTransactionTypes: [TransactionType.predictDeposit],
          },
        },
      });

      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(ETH_MAINNET_FIAT_ASSET);
    });
  });

  describe('resolveSourceAmountRaw', () => {
    const {
      messenger: resolveMessenger,
      findNetworkClientIdByChainIdMock,
      getNetworkClientByIdMock,
      getNetworkConfigurationByChainIdMock,
      getTokensControllerStateMock,
      getRemoteFeatureFlagControllerStateMock:
        resolveRemoteFeatureFlagControllerStateMock,
    } = getMessengerMock();

    beforeEach(() => {
      jest.resetAllMocks();

      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
      getNetworkConfigurationByChainIdMock.mockReturnValue(undefined);
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
    });

    it('returns on-chain ERC-20 amount and block number from receipt', async () => {
      PROVIDER_MOCK.request.mockResolvedValue({
        blockNumber: '0x1a2b3c',
        logs: [
          {
            address: ERC20_ADDRESS_MOCK,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x000000000000000000000000${'aa'.repeat(20)}`,
              `0x000000000000000000000000${WALLET_ADDRESS_MOCK.slice(2).toLowerCase()}`,
            ],
            data: '0x00000000000000000000000000000000000000000000000000000000006acfc0',
          },
        ],
      });

      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('7000000');
      expect(result.fromBlock).toBe('0x1a2b3c');
    });

    it('falls back to cryptoAmount when txHash is missing', async () => {
      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock({ txHash: '' }),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('1500000');
      expect(result.fromBlock).toBeUndefined();
      expect(PROVIDER_MOCK.request).not.toHaveBeenCalled();
    });

    it('falls back to cryptoAmount when receipt is null', async () => {
      PROVIDER_MOCK.request.mockResolvedValue(null);

      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('1500000');
      expect(result.fromBlock).toBeUndefined();
    });

    it('falls back to cryptoAmount when on-chain read throws', async () => {
      PROVIDER_MOCK.request.mockRejectedValue(new Error('Network error'));

      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock(),
        fiatAsset: ERC20_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('1500000');
      expect(result.fromBlock).toBeUndefined();
    });

    it('returns native amount from debug_traceTransaction', async () => {
      PROVIDER_MOCK.request.mockResolvedValue({
        to: WALLET_ADDRESS_MOCK.toLowerCase(),
        value: '0x1bc16d674ec80000',
        calls: [],
      });

      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock(),
        fiatAsset: NATIVE_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('2000000000000000000');
      expect(result.fromBlock).toBeUndefined();
    });

    it('falls back to tx.value for native when trace is unsupported', async () => {
      PROVIDER_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.reject(new Error('Method not found'));
          }
          return Promise.resolve({
            to: WALLET_ADDRESS_MOCK.toLowerCase(),
            value: '0x1bc16d674ec80000',
          });
        },
      );

      const result = await resolveSourceAmountRaw({
        messenger: resolveMessenger,
        order: getOrderMock(),
        fiatAsset: NATIVE_FIAT_ASSET_MOCK,
        walletAddress: WALLET_ADDRESS_MOCK,
      });

      expect(result.amountRaw).toBe('2000000000000000000');
    });

    it('throws when token info cannot be resolved for fallback', async () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {},
        allTokensStale: {},
        allIgnoredTokens: {},
        allDetectedTokens: {},
      } as never);

      await expect(
        resolveSourceAmountRaw({
          messenger: resolveMessenger,
          order: getOrderMock({ txHash: '' }),
          fiatAsset: ERC20_FIAT_ASSET_MOCK,
          walletAddress: WALLET_ADDRESS_MOCK,
        }),
      ).rejects.toThrow(
        `Unable to resolve token info for fiat asset ${ERC20_ADDRESS_MOCK} on chain ${CHAIN_ID_MOCK}`,
      );
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

  describe('isMoneyAccountDepositTransaction', () => {
    it('returns true for batch transaction with moneyAccountDeposit nested type', () => {
      const transaction = {
        type: TransactionType.batch,
        nestedTransactions: [
          { type: TransactionType.tokenMethodApprove },
          { type: TransactionType.moneyAccountDeposit },
        ],
      } as unknown as TransactionMeta;

      expect(isMoneyAccountDepositTransaction(transaction)).toBe(true);
    });

    it('returns false for non-money-account transaction types', () => {
      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      expect(isMoneyAccountDepositTransaction(transaction)).toBe(false);
    });

    it('returns false for batch transaction without moneyAccountDeposit nested type', () => {
      const transaction = {
        type: TransactionType.batch,
        nestedTransactions: [{ type: TransactionType.tokenMethodApprove }],
      } as unknown as TransactionMeta;

      expect(isMoneyAccountDepositTransaction(transaction)).toBe(false);
    });
  });
});
