import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TokenPayStrategy, isTokenPayStrategy } from './TokenPayStrategy';
import * as providerRegistry from './provider-registry';
import type { TokenPayProvider, TokenPayProviderQuote } from './types';
import { TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayQuote,
} from '../../types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';

const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;

const TRANSACTION_META_MOCK = {
  id: 'tx-1',
  txParams: {
    from: FROM_MOCK,
  },
} as TransactionMeta;

const QUOTE_MOCK: TransactionPayQuote<TokenPayProviderQuote<unknown>> = {
  dust: { usd: '0', fiat: '0' },
  estimatedDuration: 0,
  fees: {
    provider: { usd: '0', fiat: '0' },
    sourceNetwork: {
      estimate: { usd: '0', fiat: '0', human: '0', raw: '0' },
      max: { usd: '0', fiat: '0', human: '0', raw: '0' },
    },
    targetNetwork: { usd: '0', fiat: '0' },
  },
  original: {
    providerId: 'across',
    quote: { test: true },
  },
  request: {
    from: FROM_MOCK,
    sourceBalanceRaw: '100',
    sourceChainId: '0x1',
    sourceTokenAddress: '0xabc',
    sourceTokenAmount: '100',
    targetAmountMinimum: '100',
    targetChainId: '0x2',
    targetTokenAddress: '0xdef',
  },
  sourceAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
  targetAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
  strategy: TransactionPayStrategy.TokenPay,
};

function createMockProvider(
  id: 'relay' | 'across',
  supports = true,
): TokenPayProvider<unknown> {
  return {
    id,
    supports: jest.fn().mockReturnValue(supports),
    getQuotes: jest.fn().mockResolvedValue([QUOTE_MOCK]),
    getBatchTransactions: jest.fn().mockResolvedValue([{ to: '0x123' }]),
    getRefreshInterval: jest.fn().mockResolvedValue(15000),
    execute: jest.fn().mockResolvedValue({ transactionHash: '0xhash' }),
  };
}

describe('TokenPayStrategy', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  let strategy: TokenPayStrategy;
  let mockRelayProvider: TokenPayProvider<unknown>;
  let mockAcrossProvider: TokenPayProvider<unknown>;
  let getTokenPayProvidersSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    strategy = new TokenPayStrategy();
    mockRelayProvider = createMockProvider('relay');
    mockAcrossProvider = createMockProvider('across');

    getTokenPayProvidersSpy = jest
      .spyOn(providerRegistry, 'getTokenPayProviders')
      .mockReturnValue([mockRelayProvider, mockAcrossProvider]);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          tokenPay: {
            primaryProvider: 'across',
            providerOrder: ['across', 'relay'],
            providers: {
              across: { enabled: true },
              relay: { enabled: true },
            },
          },
        },
      },
    });
  });

  afterEach(() => {
    getTokenPayProvidersSpy.mockRestore();
  });

  describe('getQuotes', () => {
    it('selects provider based on providerOrder and calls getQuotes', async () => {
      const request: PayStrategyGetQuotesRequest = {
        messenger,
        requests: [
          {
            from: FROM_MOCK,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1',
            sourceTokenAddress: '0xabc',
            sourceTokenAmount: '100',
            targetAmountMinimum: '100',
            targetChainId: '0x2',
            targetTokenAddress: '0xdef',
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      };

      const result = await strategy.getQuotes(request);

      expect(mockAcrossProvider.supports).toHaveBeenCalledWith(request);
      expect(mockAcrossProvider.getQuotes).toHaveBeenCalledWith(request);
      expect(result).toStrictEqual([QUOTE_MOCK]);
    });

    it('falls back to next provider when first does not support', async () => {
      (mockAcrossProvider.supports as jest.Mock).mockReturnValue(false);

      const request: PayStrategyGetQuotesRequest = {
        messenger,
        requests: [
          {
            from: FROM_MOCK,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1',
            sourceTokenAddress: '0xabc',
            sourceTokenAmount: '100',
            targetAmountMinimum: '100',
            targetChainId: '0x2',
            targetTokenAddress: '0xdef',
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      };

      await strategy.getQuotes(request);

      expect(mockRelayProvider.supports).toHaveBeenCalledWith(request);
      expect(mockRelayProvider.getQuotes).toHaveBeenCalledWith(request);
    });

    it('throws when no provider supports the request', async () => {
      (mockAcrossProvider.supports as jest.Mock).mockReturnValue(false);
      (mockRelayProvider.supports as jest.Mock).mockReturnValue(false);

      const request: PayStrategyGetQuotesRequest = {
        messenger,
        requests: [],
        transaction: TRANSACTION_META_MOCK,
      };

      await expect(strategy.getQuotes(request)).rejects.toThrow(
        'No supported Token Pay provider found',
      );
    });
  });

  describe('getBatchTransactions', () => {
    it('selects provider from quotes and calls getBatchTransactions', async () => {
      const request: PayStrategyGetBatchRequest<TokenPayProviderQuote<unknown>> =
        {
          messenger,
          quotes: [QUOTE_MOCK],
        };

      const result = await strategy.getBatchTransactions(request);

      expect(result).toStrictEqual([{ to: '0x123' }]);
      expect(mockAcrossProvider.getBatchTransactions).toHaveBeenCalled();
    });

    it('returns empty array when provider not found', async () => {
      const request: PayStrategyGetBatchRequest<TokenPayProviderQuote<unknown>> =
        {
          messenger,
          quotes: [
            {
              ...QUOTE_MOCK,
              original: { providerId: undefined as never, quote: {} },
            },
          ],
        };

      const result = await strategy.getBatchTransactions(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when provider has no getBatchTransactions', async () => {
      const providerWithoutBatch: TokenPayProvider<unknown> = {
        id: 'across',
        supports: jest.fn().mockReturnValue(true),
        getQuotes: jest.fn().mockResolvedValue([]),
        execute: jest.fn().mockResolvedValue({}),
      };

      getTokenPayProvidersSpy.mockReturnValue([providerWithoutBatch]);

      const request: PayStrategyGetBatchRequest<TokenPayProviderQuote<unknown>> =
        {
          messenger,
          quotes: [QUOTE_MOCK],
        };

      const result = await strategy.getBatchTransactions(request);

      expect(result).toStrictEqual([]);
    });
  });

  describe('getRefreshInterval', () => {
    it('selects provider by config and returns refresh interval', async () => {
      const request: PayStrategyGetRefreshIntervalRequest = {
        chainId: '0x1',
        messenger,
      };

      const result = await strategy.getRefreshInterval(request);

      expect(result).toBe(15000);
      expect(mockAcrossProvider.getRefreshInterval).toHaveBeenCalledWith(
        request,
      );
    });

    it('returns undefined when provider has no getRefreshInterval', async () => {
      const providerWithoutRefresh: TokenPayProvider<unknown> = {
        id: 'across',
        supports: jest.fn().mockReturnValue(true),
        getQuotes: jest.fn().mockResolvedValue([]),
        execute: jest.fn().mockResolvedValue({}),
      };

      getTokenPayProvidersSpy.mockReturnValue([providerWithoutRefresh]);

      const request: PayStrategyGetRefreshIntervalRequest = {
        chainId: '0x1',
        messenger,
      };

      const result = await strategy.getRefreshInterval(request);

      expect(result).toBeUndefined();
    });

    it('skips relay provider when disabled', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            tokenPay: {
              primaryProvider: 'relay',
              providerOrder: ['relay', 'across'],
              providers: {
                across: { enabled: true },
                relay: { enabled: false },
              },
            },
          },
        },
      });

      const request: PayStrategyGetRefreshIntervalRequest = {
        chainId: '0x1',
        messenger,
      };

      await strategy.getRefreshInterval(request);

      expect(mockAcrossProvider.getRefreshInterval).toHaveBeenCalled();
      expect(mockRelayProvider.getRefreshInterval).not.toHaveBeenCalled();
    });

    it('skips across provider when disabled', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            tokenPay: {
              primaryProvider: 'across',
              providerOrder: ['across', 'relay'],
              providers: {
                across: { enabled: false },
                relay: { enabled: true },
              },
            },
          },
        },
      });

      const request: PayStrategyGetRefreshIntervalRequest = {
        chainId: '0x1',
        messenger,
      };

      await strategy.getRefreshInterval(request);

      expect(mockRelayProvider.getRefreshInterval).toHaveBeenCalled();
      expect(mockAcrossProvider.getRefreshInterval).not.toHaveBeenCalled();
    });

    it('returns first provider when none match config', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            tokenPay: {
              primaryProvider: 'unknown',
              providerOrder: ['unknown'],
              providers: {
                across: { enabled: true },
                relay: { enabled: true },
              },
            },
          },
        },
      });

      const request: PayStrategyGetRefreshIntervalRequest = {
        chainId: '0x1',
        messenger,
      };

      await strategy.getRefreshInterval(request);

      expect(mockRelayProvider.getRefreshInterval).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('selects provider from quotes and calls execute', async () => {
      const request: PayStrategyExecuteRequest<TokenPayProviderQuote<unknown>> =
        {
          isSmartTransaction: jest.fn(),
          messenger,
          quotes: [QUOTE_MOCK],
          transaction: TRANSACTION_META_MOCK,
        };

      const result = await strategy.execute(request);

      expect(result).toStrictEqual({ transactionHash: '0xhash' });
      expect(mockAcrossProvider.execute).toHaveBeenCalled();
    });

    it('throws when provider not found', async () => {
      const request: PayStrategyExecuteRequest<TokenPayProviderQuote<unknown>> =
        {
          isSmartTransaction: jest.fn(),
          messenger,
          quotes: [
            {
              ...QUOTE_MOCK,
              original: { providerId: undefined as never, quote: {} },
            },
          ],
          transaction: TRANSACTION_META_MOCK,
        };

      await expect(strategy.execute(request)).rejects.toThrow(
        'Token Pay provider not found for execute',
      );
    });
  });
});

describe('isTokenPayStrategy', () => {
  it('returns true for TokenPay strategy', () => {
    expect(isTokenPayStrategy(TransactionPayStrategy.TokenPay)).toBe(true);
  });

  it('returns false for other strategies', () => {
    expect(isTokenPayStrategy(TransactionPayStrategy.Bridge)).toBe(false);
    expect(isTokenPayStrategy(TransactionPayStrategy.Relay)).toBe(false);
    expect(isTokenPayStrategy(TransactionPayStrategy.Test)).toBe(false);
  });
});
