import type {
  TransactionControllerEstimateGasBatchAction,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';
import { getFeatureFlags, getGasBuffer } from './feature-flags.js';
import { estimateGasLimit } from './gas.js';
import { estimateQuoteGasLimits, estimateSourceGas } from './quote-gas.js';
import type { QuoteGasTransaction } from './quote-gas.js';

vi.mock(import('./feature-flags.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFeatureFlags: vi.fn(),
  getGasBuffer: vi.fn(),
}));

vi.mock(import('./gas.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  estimateGasLimit: vi.fn(),
}));

describe('quote gas estimation', () => {
  const getGasBufferMock = vi.mocked(getGasBuffer);
  const estimateGasLimitMock = vi.mocked(estimateGasLimit);

  const { estimateGasBatchMock, messenger } = getMessengerMock();

  const TRANSACTIONS_MOCK = [
    {
      chainId: '0x1' as Hex,
      data: '0xaaaa' as Hex,
      from: '0x1234567890123456789012345678901234567891' as Hex,
      to: '0x1111111111111111111111111111111111111111' as Hex,
      value: '0x0' as Hex,
    },
    {
      chainId: '0x1' as Hex,
      data: '0xbbbb' as Hex,
      from: '0x1234567890123456789012345678901234567891' as Hex,
      gas: '30000',
      to: '0x2222222222222222222222222222222222222222' as Hex,
      value: '0x0' as Hex,
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    getGasBufferMock.mockReturnValue(1);
  });

  it('throws when there are no transactions', async () => {
    await expect(
      estimateQuoteGasLimits({
        messenger,
        transactions: [],
      }),
    ).rejects.toThrow('Quote gas estimation requires at least one transaction');

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('uses batch estimation for multiple transactions even when the chain does not support EIP-7702', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 51000,
      gasLimits: [21000, 30000],
    });

    const result = await estimateQuoteGasLimits({
      fallbackOnSimulationFailure: true,
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 21000,
          max: 21000,
        },
        {
          estimate: 30000,
          max: 30000,
        },
      ],
      is7702: false,
      totalGasEstimate: 51000,
      totalGasLimit: 51000,
      usedBatch: true,
    });
  });

  it('uses per-transaction estimation when there is only one transaction', async () => {
    estimateGasLimitMock.mockResolvedValueOnce({
      estimate: 21000,
      max: 21000,
      usedFallback: false,
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: [TRANSACTIONS_MOCK[0]],
    });

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(result.is7702).toBe(false);
    expect(result.usedBatch).toBe(false);
  });

  it('uses batch estimation when the source chain supports EIP-7702', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
    });

    const result = await estimateQuoteGasLimits({
      fallbackOnSimulationFailure: true,
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(estimateGasBatchMock).toHaveBeenCalledWith({
      chainId: '0x1',
      from: TRANSACTIONS_MOCK[0].from,
      transactions: [
        expect.objectContaining({
          data: TRANSACTIONS_MOCK[0].data,
          to: TRANSACTIONS_MOCK[0].to,
        }),
        expect.objectContaining({
          data: TRANSACTIONS_MOCK[1].data,
          gas: '0x7530',
          to: TRANSACTIONS_MOCK[1].to,
        }),
      ],
    });
    expect(result).toStrictEqual({
      batchGasLimit: {
        estimate: 75000,
        max: 75000,
      },
      gasLimits: [
        {
          estimate: 75000,
          max: 75000,
        },
      ],
      is7702: true,
      totalGasEstimate: 75000,
      totalGasLimit: 75000,
      usedBatch: true,
    });
  });

  it('marks batch estimates that require an authorization list', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
      requiresAuthorizationList: true,
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      batchGasLimit: {
        estimate: 50000,
        max: 50000,
      },
      gasLimits: [
        {
          estimate: 50000,
          max: 50000,
        },
      ],
      is7702: true,
      requiresAuthorizationList: true,
      totalGasEstimate: 50000,
      totalGasLimit: 50000,
      usedBatch: true,
    });
  });

  it('uses per-transaction batch gas limits and preserves provided gas when it already matches', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 51000,
      gasLimits: [21000, 30000],
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 31500,
          max: 31500,
        },
        {
          estimate: 30000,
          max: 30000,
        },
      ],
      is7702: false,
      totalGasEstimate: 61500,
      totalGasLimit: 61500,
      usedBatch: true,
    });
  });

  it('buffers per-transaction batch gas when a provided gas value is overridden', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 56000,
      gasLimits: [21000, 35000],
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 31500,
          max: 31500,
        },
        {
          estimate: 52500,
          max: 52500,
        },
      ],
      is7702: false,
      totalGasEstimate: 84000,
      totalGasLimit: 84000,
      usedBatch: true,
    });
  });

  it('throws when batch estimation fails', async () => {
    estimateGasBatchMock.mockRejectedValue(
      new Error('Batch estimation failed'),
    );

    await expect(
      estimateQuoteGasLimits({
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: TRANSACTIONS_MOCK,
      }),
    ).rejects.toThrow('Batch estimation failed');

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('throws when batch returns an unexpected gas limit count', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 123000,
      gasLimits: [21000, 30000, 72000],
    });

    await expect(
      estimateQuoteGasLimits({
        messenger,
        transactions: TRANSACTIONS_MOCK,
      }),
    ).rejects.toThrow('Unexpected batch gas limit count');

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('treats numeric gas values as provided gas limits', async () => {
    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: [
        {
          ...TRANSACTIONS_MOCK[0],
          gas: 42000,
        },
      ],
    });

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 42000,
          max: 42000,
        },
      ],
      is7702: false,
      totalGasEstimate: 42000,
      totalGasLimit: 42000,
      usedBatch: false,
    });
  });

  it('defaults missing transaction values to zero for per-transaction estimation', async () => {
    estimateGasLimitMock.mockResolvedValueOnce({
      estimate: 21000,
      max: 21000,
      usedFallback: false,
    });

    await estimateQuoteGasLimits({
      messenger,
      transactions: [
        {
          chainId: '0x1',
          data: '0xaaaa',
          from: '0x1234567890123456789012345678901234567891',
          to: '0x1111111111111111111111111111111111111111',
        },
      ],
    });

    expect(estimateGasLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '0x0',
      }),
    );
  });

  it('defaults missing transaction values to zero for batch estimation', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
    });

    await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK.map(({ value, ...transaction }) => ({
        ...transaction,
      })),
    });

    expect(estimateGasBatchMock).toHaveBeenCalledWith({
      chainId: '0x1',
      from: TRANSACTIONS_MOCK[0].from,
      transactions: [
        expect.objectContaining({
          value: '0x0',
        }),
        expect.objectContaining({
          value: '0x0',
        }),
      ],
    });
  });

  describe('estimateSourceGas', () => {
    const FALLBACK_GAS_MOCK = { estimate: 1, max: 2 };
    const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
    const SAFE_MOCK = '0x2222222222222222222222222222222222222222' as Hex;

    const QUOTE_TRANSACTION_MOCK: QuoteGasTransaction = {
      chainId: '0x89',
      data: '0xbbbb',
      from: FROM_MOCK,
      gas: '50000',
      to: '0x4444444444444444444444444444444444444444',
      value: '0',
    };

    const TRANSACTION_MOCK = {
      chainId: '0x89',
      txParams: {
        data: '0xaaaa',
        from: FROM_MOCK,
        gas: '0x5208',
        to: '0x5555555555555555555555555555555555555555',
      },
    } as unknown as TransactionMeta;

    const REQUEST_MOCK = {
      from: FROM_MOCK,
      sourceBalanceRaw: '1000',
      sourceChainId: '0x89',
      sourceTokenAddress: '0x3333333333333333333333333333333333333333',
      sourceTokenAmount: '1000',
    } as unknown as QuoteRequest;

    const { estimateGasBatchMock: batchMock, messenger: sourceMessenger } =
      getMessengerMock() as unknown as {
        estimateGasBatchMock: MockedFunction<
          TransactionControllerEstimateGasBatchAction['handler']
        >;
        messenger: TransactionPayControllerMessenger;
      };

    function mockBatchGas(gasLimits: number[]): void {
      batchMock.mockResolvedValue({
        gasLimits,
        totalGasLimit: gasLimits.reduce((sum, gas) => sum + gas, 0),
      });
    }

    beforeEach(() => {
      vi.mocked(getFeatureFlags).mockReturnValue({
        relayFallbackGas: FALLBACK_GAS_MOCK,
      } as ReturnType<typeof getFeatureFlags>);
    });

    it('estimates only the quote transactions when not post-quote', async () => {
      estimateGasLimitMock.mockResolvedValue({
        estimate: 50000,
        max: 50000,
        usedFallback: false,
      });

      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: REQUEST_MOCK,
        transaction: TRANSACTION_MOCK,
        transactions: [{ ...QUOTE_TRANSACTION_MOCK, gas: undefined }],
      });

      expect(batchMock).not.toHaveBeenCalled();
      expect(estimateGasLimitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: QUOTE_TRANSACTION_MOCK.data,
          fallbackGas: FALLBACK_GAS_MOCK,
          fallbackOnSimulationFailure: true,
          to: QUOTE_TRANSACTION_MOCK.to,
        }),
      );
      expect(result).toStrictEqual({
        gasLimits: [50000],
        is7702: false,
        totalGasEstimate: 50000,
        totalGasLimit: 50000,
      });
    });

    it('estimates the original transaction ahead of the quote transactions for post-quote flows', async () => {
      mockBatchGas([71000]);

      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(batchMock).toHaveBeenCalledWith({
        chainId: '0x89',
        from: FROM_MOCK,
        transactions: [
          expect.objectContaining({
            data: '0xaaaa',
            gas: '0x5208',
            to: TRANSACTION_MOCK.txParams.to,
          }),
          expect.objectContaining({
            data: QUOTE_TRANSACTION_MOCK.data,
            to: QUOTE_TRANSACTION_MOCK.to,
          }),
        ],
      });
      expect(result).toStrictEqual({
        gasLimits: [71000],
        is7702: true,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('prefers the nested transaction gas for the original transaction', async () => {
      mockBatchGas([30000, 50000]);

      await estimateSourceGas({
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          nestedTransactions: [{ gas: '0x7530' }],
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(batchMock.mock.calls[0][0].transactions[0].gas).toBe('0x7530');
    });

    it('estimates every transaction from the override without provided gas', async () => {
      mockBatchGas([21000, 50000]);

      await estimateSourceGas({
        fromOverride: SAFE_MOCK,
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      const { from, transactions } = batchMock.mock.calls[0][0];

      expect(from).toBe(SAFE_MOCK);
      expect(transactions.map((tx) => tx.gas)).toStrictEqual([
        undefined,
        undefined,
      ]);
    });

    it('prepends a separate limit for the original transaction gas when it cannot be estimated with the quote', async () => {
      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          txParams: { ...TRANSACTION_MOCK.txParams, to: undefined },
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(batchMock).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        gasLimits: [21000, 50000],
        is7702: false,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('adds the original transaction gas to a combined 7702 limit when the account is overridden', async () => {
      mockBatchGas([50000]);

      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: {
          ...REQUEST_MOCK,
          from: SAFE_MOCK,
          isPostQuote: true,
        },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK, QUOTE_TRANSACTION_MOCK],
      });

      expect(batchMock.mock.calls[0][0].transactions).toHaveLength(2);
      expect(result).toStrictEqual({
        gasLimits: [71000],
        is7702: true,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('adds the payment override allowance ahead of the original transaction gas', async () => {
      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: {
          ...REQUEST_MOCK,
          from: SAFE_MOCK,
          isPostQuote: true,
          paymentOverride: 'moneyAccount',
        } as QuoteRequest,
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(result).toStrictEqual({
        gasLimits: [75000, 21000, 50000],
        is7702: false,
        totalGasEstimate: 146000,
        totalGasLimit: 146000,
      });
    });

    it('adds nothing when the original transaction has no gas', async () => {
      const result = await estimateSourceGas({
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, from: SAFE_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          txParams: { ...TRANSACTION_MOCK.txParams, gas: undefined },
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(result.gasLimits).toStrictEqual([50000]);
    });

    it('defaults missing original transaction data and value', async () => {
      mockBatchGas([21000, 50000]);

      await estimateSourceGas({
        messenger: sourceMessenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          txParams: {
            from: FROM_MOCK,
            to: TRANSACTION_MOCK.txParams.to,
          },
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(batchMock.mock.calls[0][0].transactions[0]).toStrictEqual(
        expect.objectContaining({ data: '0x', gas: undefined, value: '0x0' }),
      );
    });
  });
});
