import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuoteRequest, TransactionPayQuote } from '../types.js';
import { reservePostQuoteGas } from './post-quote.js';

const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_MOCK = '0x3333333333333333333333333333333333333333' as Hex;

const REQUEST_MOCK = {
  from: FROM_MOCK,
  sourceBalanceRaw: '1000',
  sourceChainId: '0x89',
  sourceTokenAddress: TOKEN_MOCK,
  sourceTokenAmount: '1000',
} as unknown as QuoteRequest;

describe('post-quote', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      const requote = vi.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when gas is paid in native tokens from a non-native source', async () => {
      const quote = buildQuote({ isSourceGasFeeToken: false });
      const requote = vi.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('requotes with the buffered gas cost subtracted when gas is paid with the source token', async () => {
      const quote = buildQuote();
      const adjustedQuote = buildQuote();
      const requote = vi.fn().mockResolvedValue(adjustedQuote);

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
      const requote = vi.fn().mockResolvedValue(quote);

      await reservePostQuoteGas({ quote, requote });

      expect(requote).toHaveBeenCalledTimes(1);
    });

    it('returns the quote when the existing balance already covers gas', async () => {
      const quote = buildQuote({ request: { sourceBalanceRaw: '1110' } });
      const requote = vi.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when gas exceeds the source amount', async () => {
      const quote = buildQuote({ sourceNetworkMaxRaw: '1000' });
      const requote = vi.fn();

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('returns the quote when the requote loses gas fee token eligibility', async () => {
      const quote = buildQuote();
      const requote = vi
        .fn()
        .mockResolvedValue(buildQuote({ isSourceGasFeeToken: false }));

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
    });

    it('returns the quote when the requote fails', async () => {
      const quote = buildQuote();
      const requote = vi.fn().mockRejectedValue(new Error('requote failed'));

      expect(await reservePostQuoteGas({ quote, requote })).toBe(quote);
    });
  });
});
