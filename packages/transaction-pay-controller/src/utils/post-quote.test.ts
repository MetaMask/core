import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock.js';
import type { QuoteRequest, TransactionPayQuote } from '../types.js';
import { getFeatureFlags } from './feature-flags.js';
import { estimateSourceGas, reservePostQuoteGas } from './post-quote.js';
import { estimateQuoteGasLimits } from './quote-gas.js';
import type { QuoteGasTransaction } from './quote-gas.js';

jest.mock('./feature-flags');
jest.mock('./quote-gas');

const FALLBACK_GAS_MOCK = { estimate: 1, max: 2 };
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const SAFE_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const TOKEN_MOCK = '0x3333333333333333333333333333333333333333' as Hex;

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
  sourceTokenAddress: TOKEN_MOCK,
  sourceTokenAmount: '1000',
} as unknown as QuoteRequest;

describe('post-quote', () => {
  const { messenger } = getMessengerMock();
  const estimateQuoteGasLimitsMock = jest.mocked(estimateQuoteGasLimits);

  beforeEach(() => {
    jest.resetAllMocks();

    jest.mocked(getFeatureFlags).mockReturnValue({
      relayFallbackGas: FALLBACK_GAS_MOCK,
    } as ReturnType<typeof getFeatureFlags>);
  });

  describe('estimateSourceGas', () => {
    function mockGas(gasLimits: number[], is7702 = false): void {
      const total = gasLimits.reduce((sum, gas) => sum + gas, 0);

      estimateQuoteGasLimitsMock.mockResolvedValue({
        gasLimits: gasLimits.map((gas) => ({ estimate: gas, max: gas })),
        is7702,
        totalGasEstimate: total,
        totalGasLimit: total,
        usedBatch: gasLimits.length > 1 || is7702,
      });
    }

    it('estimates only the quote transactions when not post-quote', async () => {
      mockGas([50000]);

      const result = await estimateSourceGas({
        messenger,
        request: REQUEST_MOCK,
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(estimateQuoteGasLimitsMock).toHaveBeenCalledWith({
        fallbackGas: FALLBACK_GAS_MOCK,
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });
      expect(result).toStrictEqual({
        gasLimits: [50000],
        is7702: false,
        totalGasEstimate: 50000,
        totalGasLimit: 50000,
      });
    });

    it('estimates the original transaction ahead of the quote transactions for post-quote flows', async () => {
      mockGas([71000], true);

      const result = await estimateSourceGas({
        messenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(
        estimateQuoteGasLimitsMock.mock.calls[0][0].transactions,
      ).toStrictEqual([
        {
          chainId: '0x89',
          data: '0xaaaa',
          from: FROM_MOCK,
          gas: '0x5208',
          to: TRANSACTION_MOCK.txParams.to,
          value: '0',
        },
        QUOTE_TRANSACTION_MOCK,
      ]);
      expect(result).toStrictEqual({
        gasLimits: [71000],
        is7702: true,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('prefers the nested transaction gas for the original transaction', async () => {
      mockGas([30000, 50000]);

      await estimateSourceGas({
        messenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          nestedTransactions: [{ gas: '0x7530' }],
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(
        estimateQuoteGasLimitsMock.mock.calls[0][0].transactions[0].gas,
      ).toBe('0x7530');
    });

    it('estimates every transaction from the override without provided gas', async () => {
      mockGas([21000, 50000]);

      await estimateSourceGas({
        fromOverride: SAFE_MOCK,
        messenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      const { transactions } = estimateQuoteGasLimitsMock.mock.calls[0][0];

      expect(transactions.map((tx) => tx.from)).toStrictEqual([
        SAFE_MOCK,
        SAFE_MOCK,
      ]);
      expect(transactions.map((tx) => tx.gas)).toStrictEqual([
        undefined,
        undefined,
      ]);
    });

    it('prepends a separate limit for the original transaction gas when it cannot be estimated with the quote', async () => {
      mockGas([50000]);

      const result = await estimateSourceGas({
        messenger,
        request: { ...REQUEST_MOCK, isPostQuote: true },
        transaction: {
          ...TRANSACTION_MOCK,
          txParams: { ...TRANSACTION_MOCK.txParams, to: undefined },
        },
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(
        estimateQuoteGasLimitsMock.mock.calls[0][0].transactions,
      ).toStrictEqual([QUOTE_TRANSACTION_MOCK]);
      expect(result).toStrictEqual({
        gasLimits: [21000, 50000],
        is7702: false,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('adds the original transaction gas to a combined 7702 limit when the account is overridden', async () => {
      mockGas([50000], true);

      const result = await estimateSourceGas({
        messenger,
        request: {
          ...REQUEST_MOCK,
          from: SAFE_MOCK,
          isPostQuote: true,
        },
        transaction: TRANSACTION_MOCK,
        transactions: [QUOTE_TRANSACTION_MOCK],
      });

      expect(result).toStrictEqual({
        gasLimits: [71000],
        is7702: true,
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });
    });

    it('adds the payment override allowance ahead of the original transaction gas', async () => {
      mockGas([50000]);

      const result = await estimateSourceGas({
        messenger,
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
      mockGas([50000]);

      const result = await estimateSourceGas({
        messenger,
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
      mockGas([21000, 50000]);

      await estimateSourceGas({
        messenger,
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

      expect(
        estimateQuoteGasLimitsMock.mock.calls[0][0].transactions[0],
      ).toStrictEqual(
        expect.objectContaining({ data: '0x', gas: undefined, value: '0' }),
      );
    });
  });

  describe('reservePostQuoteGas', () => {
    function buildQuote({
      isSourceGasFeeToken = true,
      request = {},
      sourceNetworkMaxRaw = '100',
    }: {
      isSourceGasFeeToken?: boolean;
      request?: Partial<QuoteRequest>;
      sourceNetworkMaxRaw?: string;
    } = {}): TransactionPayQuote<string> {
      return {
        fees: {
          isSourceGasFeeToken,
          sourceNetwork: { max: { raw: sourceNetworkMaxRaw } },
        },
        original: 'phase1',
        request: { ...REQUEST_MOCK, isPostQuote: true, ...request },
      } as TransactionPayQuote<string>;
    }

    it('returns the quote when not post-quote', async () => {
      const quote = buildQuote({ request: { isPostQuote: false } });
      const requote = jest.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when gas is paid in native tokens from a non-native source', async () => {
      const quote = buildQuote({ isSourceGasFeeToken: false });
      const requote = jest.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('requotes with the buffered gas cost subtracted when gas is paid with the source token', async () => {
      const quote = buildQuote();
      const adjustedQuote = buildQuote();
      const requote = jest.fn().mockResolvedValue(adjustedQuote);

      expect(await reservePostQuoteGas({ quote, requote })).toBe(adjustedQuote);
      expect(requote).toHaveBeenCalledWith(
        expect.objectContaining({ sourceTokenAmount: '890' }),
      );
    });

    it.each([
      ['the chain native token', '0x0000000000000000000000000000000000001010'],
      ['the zero address', '0x0000000000000000000000000000000000000000'],
    ])('requotes when the source is %s', async (_title, sourceTokenAddress) => {
      const quote = buildQuote({
        isSourceGasFeeToken: false,
        request: { sourceTokenAddress: sourceTokenAddress as Hex },
      });
      const requote = jest.fn().mockResolvedValue(quote);

      await reservePostQuoteGas({ quote, requote });

      expect(requote).toHaveBeenCalledTimes(1);
    });

    it('returns the quote when the existing balance already covers gas', async () => {
      const quote = buildQuote({ request: { sourceBalanceRaw: '1110' } });
      const requote = jest.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when gas exceeds the source amount', async () => {
      const quote = buildQuote({ sourceNetworkMaxRaw: '1000' });
      const requote = jest.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when the requote loses gas fee token eligibility', async () => {
      const quote = buildQuote();
      const requote = jest
        .fn()
        .mockResolvedValue(buildQuote({ isSourceGasFeeToken: false }));

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
    });

    it('returns the quote when the requote fails', async () => {
      const quote = buildQuote();
      const requote = jest.fn().mockRejectedValue(new Error('requote failed'));

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
    });
  });
});
