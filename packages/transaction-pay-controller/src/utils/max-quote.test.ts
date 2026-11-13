import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockModuleExcept } from '../../tests/mock-module-except.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { accountRequiresMfa } from './account.js';
import { isAtomicMaxEnabled } from './feature-flags.js';
import { getMaxGasStationQuote } from './max-gas-station.js';
import {
  getMaxQuotes,
  isAtomicMaxQuote,
  isAtomicMaxSupported,
} from './max-quote.js';
import type { MaxQuoteDetails, MaxQuotesRequest } from './max-quote.js';
import { getTokenInfo } from './token.js';
import { QuoteError } from './validation.js';

vi.mock(import('./account.js'));
vi.mock(import('./feature-flags.js'));
vi.mock(import('./max-gas-station.js'));
vi.mock(import('./token.js'), async (importOriginal) =>
  mockModuleExcept(await importOriginal(), [
    'getEvmAsset',
    'getEvmQuoteSource',
  ]),
);

type OriginalQuoteMock = {
  id: string;
  isSubsidized: boolean;
  targetAmountRaw: string;
};

type QuoteMock = TransactionPayQuote<OriginalQuoteMock>;

const AMOUNT_DATA_MOCK = '0xabcdef' as Hex;

const REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891',
  isMaxAmount: true,
  sourceBalanceRaw: '1000000',
  sourceAccountId: 'eip155:1:0x1234567890123456789012345678901234567891',
  sourceAssetId: 'eip155:1/erc20:0xabc',
  sourceTokenAmount: '1000000',
  targetAmountMinimum: '0',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef',
};

const TRANSACTION_MOCK = {
  id: 'tx-1',
  nestedTransactions: [{ data: '0x01' as Hex }, { data: '0x02' as Hex }],
  requiredAssets: [{ address: '0xdef', amount: '0x1', standard: 'erc20' }],
  txParams: { from: '0x1234567890123456789012345678901234567892' },
} as unknown as TransactionMeta;

function makeQuote(
  id: string,
  {
    isSubsidized = false,
    request = REQUEST_MOCK,
    targetAmountRaw = '900',
  }: {
    isSubsidized?: boolean;
    request?: QuoteRequest;
    targetAmountRaw?: string;
  } = {},
): QuoteMock {
  return {
    original: { id, isSubsidized, targetAmountRaw },
    request,
  } as QuoteMock;
}

function getQuoteDetails({ original }: QuoteMock): MaxQuoteDetails {
  return {
    gasLimits: [],
    isGasless: false,
    isSubsidized: original.isSubsidized,
    targetAmountRaw: original.targetAmountRaw,
  };
}

describe('max-quote', () => {
  const accountRequiresMfaMock = vi.mocked(accountRequiresMfa);
  const getMaxGasStationQuoteMock = vi.mocked(getMaxGasStationQuote);
  const getTokenInfoMock = vi.mocked(getTokenInfo);
  const isAtomicMaxEnabledMock = vi.mocked(isAtomicMaxEnabled);
  const messengerCallMock = vi.fn();

  const messenger = {
    call: messengerCallMock,
  } as unknown as TransactionPayControllerMessenger;

  const fullRequest = {
    messenger,
    transaction: TRANSACTION_MOCK,
  } as PayStrategyGetQuotesRequest;

  let getQuotesMock: ReturnType<
    typeof vi.fn<MaxQuotesRequest<OriginalQuoteMock>['getQuotes']>
  >;

  let requoteMock: ReturnType<
    typeof vi.fn<MaxQuotesRequest<OriginalQuoteMock>['requote']>
  >;

  let validateAtomicQuoteMock: ReturnType<
    typeof vi.fn<
      NonNullable<MaxQuotesRequest<OriginalQuoteMock>['validateAtomicQuote']>
    >
  >;

  function run(request: QuoteRequest = REQUEST_MOCK): Promise<QuoteMock[]> {
    return getMaxQuotes({
      fullRequest,
      getQuoteDetails,
      getQuotes: getQuotesMock,
      request,
      requote: requoteMock,
      validateAtomicQuote: validateAtomicQuoteMock,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();

    getQuotesMock = vi.fn();
    requoteMock = vi.fn();
    validateAtomicQuoteMock = vi.fn();

    isAtomicMaxEnabledMock.mockReturnValue(true);

    getMaxGasStationQuoteMock.mockImplementation(async ({ quote }) => {
      const { original } = quote as QuoteMock;

      return {
        ...quote,
        original: { ...original, id: `${original.id}-gas-station` },
      };
    });

    // Source token first, then target token.
    getTokenInfoMock
      .mockReturnValueOnce({ decimals: 6, symbol: 'TST' })
      .mockReturnValueOnce({ decimals: 18, symbol: 'TST' });

    messengerCallMock.mockResolvedValue({
      updates: [{ data: AMOUNT_DATA_MOCK, nestedTransactionIndex: 1 }],
    });
  });

  describe('getMaxQuotes', () => {
    describe('if atomic max not supported', () => {
      beforeEach(() => {
        isAtomicMaxEnabledMock.mockReturnValue(false);
      });

      it('returns gas station quote for each quote', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a'), makeQuote('b')]);

        const result = await run();

        expect(result.map((quote) => quote.original.id)).toStrictEqual([
          'a-gas-station',
          'b-gas-station',
        ]);
        expect(getQuotesMock).toHaveBeenCalledWith(
          REQUEST_MOCK,
          TRANSACTION_MOCK,
        );
      });

      it('re-quotes same quote with original transaction for gas station', async () => {
        const quote = makeQuote('a');
        const adjustedRequest = { ...REQUEST_MOCK, sourceTokenAmount: '1' };

        getQuotesMock.mockResolvedValue([quote]);

        await run();

        const { getQuoteDetails: gasStationDetails, requote } =
          getMaxGasStationQuoteMock.mock.calls[0][0];

        await requote(adjustedRequest);

        expect(requoteMock).toHaveBeenCalledWith(
          quote,
          adjustedRequest,
          TRANSACTION_MOCK,
        );
        expect(gasStationDetails).toBe(getQuoteDetails);
      });

      it('removes atomic hint if true', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a')]);

        await run({ ...REQUEST_MOCK, atomic: true });

        expect(getQuotesMock).toHaveBeenCalledWith(
          { ...REQUEST_MOCK, atomic: undefined },
          TRANSACTION_MOCK,
        );
      });

      it('keeps atomic hint if false', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a')]);

        await run({ ...REQUEST_MOCK, atomic: false });

        expect(getQuotesMock).toHaveBeenCalledWith(
          { ...REQUEST_MOCK, atomic: false },
          TRANSACTION_MOCK,
        );
      });

      it('does not validate quotes', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a')]);

        await run();

        expect(validateAtomicQuoteMock).not.toHaveBeenCalled();
      });
    });

    describe('if atomic first', () => {
      it('quotes atomically with fixed rate target amount', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        const result = await run();

        expect(result.map((quote) => quote.original.id)).toStrictEqual(['a']);
        expect(getMaxGasStationQuoteMock).not.toHaveBeenCalled();
        expect(getQuotesMock).toHaveBeenCalledWith(
          {
            ...REQUEST_MOCK,
            atomic: true,
            targetAmountMinimum: '1000000000000000000',
          },
          expect.objectContaining({
            nestedTransactions: [{ data: '0x01' }, { data: AMOUNT_DATA_MOCK }],
            requiredAssets: [
              expect.objectContaining({ amount: '0xde0b6b3a7640000' }),
            ],
          }),
        );
      });

      it('validates subsidized atomic quote', async () => {
        const quote = makeQuote('a', { isSubsidized: true });
        getQuotesMock.mockResolvedValue([quote]);

        await run();

        expect(validateAtomicQuoteMock).toHaveBeenCalledWith(quote);
      });

      it('throws prefixed error if atomic quote validation fails', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        validateAtomicQuoteMock.mockRejectedValue(new Error('Test error'));

        const error = await run().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(QuoteError);
        expect((error as QuoteError).info).toStrictEqual({
          detail: ['Atomic promotion failed: Test error'],
          message: 'Atomic promotion failed: Test error',
          reason: 'no-quotes',
        });
      });

      it('rounds down fixed rate target amount', async () => {
        getTokenInfoMock
          .mockReset()
          .mockReturnValueOnce({ decimals: 18, symbol: 'TST' })
          .mockReturnValueOnce({ decimals: 6, symbol: 'TST' });

        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        await run({ ...REQUEST_MOCK, sourceTokenAmount: '1999999999999' });

        expect(getQuotesMock.mock.calls[0][0].targetAmountMinimum).toBe('1');
      });

      it('requests amount data with copy of transaction', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        await run();

        const [, { amount, transaction }] = messengerCallMock.mock.calls[0];

        expect(messengerCallMock).toHaveBeenCalledWith(
          'TransactionPayController:getAmountData',
          expect.anything(),
        );
        expect(amount).toBe('1000000000000000000');
        expect(transaction).toStrictEqual(TRANSACTION_MOCK);
        expect(transaction).not.toBe(TRANSACTION_MOCK);
      });

      it('does not mutate original transaction', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        await run();

        expect(TRANSACTION_MOCK.nestedTransactions?.[1].data).toBe('0x02');
        expect(TRANSACTION_MOCK.requiredAssets?.[0].amount).toBe('0x1');
      });

      it('falls back to non-atomic gas station quote if not subsidized', async () => {
        const atomicQuote = makeQuote('atomic');
        const subsidizedQuote = makeQuote('subsidized', { isSubsidized: true });

        getQuotesMock.mockResolvedValue([atomicQuote, subsidizedQuote]);
        requoteMock.mockResolvedValue(makeQuote('non-atomic'));

        const result = await run();

        expect(result.map((quote) => quote.original.id)).toStrictEqual([
          'non-atomic-gas-station',
          'subsidized',
        ]);
        expect(requoteMock).toHaveBeenCalledTimes(1);
        expect(validateAtomicQuoteMock).toHaveBeenCalledTimes(1);
        expect(requoteMock).toHaveBeenCalledWith(
          atomicQuote,
          { ...REQUEST_MOCK, atomic: false },
          TRANSACTION_MOCK,
        );
      });

      it('throws if token decimals not found', async () => {
        getTokenInfoMock.mockReset().mockReturnValue(undefined);

        await expect(run()).rejects.toThrow(
          'Token decimals not found for atomic max quote',
        );
      });

      it('throws if fixed rate target amount is zero', async () => {
        await expect(
          run({ ...REQUEST_MOCK, sourceTokenAmount: '0' }),
        ).rejects.toThrow('Invalid target amount: 0');
      });

      it('throws if amount data has no updates', async () => {
        messengerCallMock.mockResolvedValue({ updates: [] });

        await expect(run()).rejects.toThrow(
          'getAmountData returned no updates for atomic promotion',
        );
      });

      it('throws if transaction has no nested transactions', async () => {
        await expect(
          getMaxQuotes({
            fullRequest: {
              ...fullRequest,
              transaction: {
                ...TRANSACTION_MOCK,
                nestedTransactions: undefined,
              },
            },
            getQuoteDetails,
            getQuotes: getQuotesMock,
            request: REQUEST_MOCK,
            requote: requoteMock,
          }),
        ).rejects.toThrow('Missing nested transactions for atomic promotion');
      });

      it('throws if amount data update has unknown index', async () => {
        messengerCallMock.mockResolvedValue({
          updates: [{ data: AMOUNT_DATA_MOCK, nestedTransactionIndex: 5 }],
        });

        await expect(run()).rejects.toThrow(
          'getAmountData returned an unusable nested transaction update',
        );
      });

      it('throws if transaction has no required assets', async () => {
        await expect(
          getMaxQuotes({
            fullRequest: {
              ...fullRequest,
              transaction: { ...TRANSACTION_MOCK, requiredAssets: [] },
            },
            getQuoteDetails,
            getQuotes: getQuotesMock,
            request: REQUEST_MOCK,
            requote: requoteMock,
          }),
        ).rejects.toThrow('Missing required assets for atomic promotion');
      });
    });

    describe('if not atomic', () => {
      const NON_ATOMIC_REQUEST_MOCK = { ...REQUEST_MOCK, atomic: false };

      it('returns gas station quote if not subsidized', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a')]);

        const result = await run(NON_ATOMIC_REQUEST_MOCK);

        expect(result.map((quote) => quote.original.id)).toStrictEqual([
          'a-gas-station',
        ]);
        expect(getQuotesMock).toHaveBeenCalledWith(
          NON_ATOMIC_REQUEST_MOCK,
          TRANSACTION_MOCK,
        );
        expect(requoteMock).not.toHaveBeenCalled();
      });

      it('promotes subsidized quote using its target amount', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true, targetAmountRaw: '950' }),
        ]);

        requoteMock.mockResolvedValue(
          makeQuote('promoted', { isSubsidized: true }),
        );

        const result = await run(NON_ATOMIC_REQUEST_MOCK);

        expect(result.map((quote) => quote.original.id)).toStrictEqual([
          'promoted',
        ]);
        expect(requoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            original: expect.objectContaining({ id: 'a-gas-station' }),
          }),
          { ...REQUEST_MOCK, atomic: true, targetAmountMinimum: '950' },
          expect.objectContaining({
            nestedTransactions: [{ data: '0x01' }, { data: AMOUNT_DATA_MOCK }],
            requiredAssets: [expect.objectContaining({ amount: '0x3b6' })],
          }),
        );
      });

      it('does not promote subsidized quote if account requires MFA', async () => {
        accountRequiresMfaMock.mockReturnValue(true);

        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        const result = await run(NON_ATOMIC_REQUEST_MOCK);

        expect(result.map((quote) => quote.original.id)).toStrictEqual([
          'a-gas-station',
        ]);
        expect(accountRequiresMfaMock).toHaveBeenCalledWith(
          messenger,
          TRANSACTION_MOCK.txParams.from,
        );
        expect(requoteMock).not.toHaveBeenCalled();
      });

      it('validates promoted quote', async () => {
        const promotedQuote = makeQuote('promoted', { isSubsidized: true });

        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        requoteMock.mockResolvedValue(promotedQuote);

        await run(NON_ATOMIC_REQUEST_MOCK);

        expect(validateAtomicQuoteMock).toHaveBeenCalledWith(promotedQuote);
      });

      it('throws prefixed error if promoted quote validation fails', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        requoteMock.mockResolvedValue(
          makeQuote('promoted', { isSubsidized: true }),
        );

        validateAtomicQuoteMock.mockRejectedValue(new Error('Test error'));

        await expect(run(NON_ATOMIC_REQUEST_MOCK)).rejects.toThrow(
          'Atomic promotion failed: Test error',
        );
      });

      it('does not validate quote if not subsidized', async () => {
        getQuotesMock.mockResolvedValue([makeQuote('a')]);

        await run(NON_ATOMIC_REQUEST_MOCK);

        expect(validateAtomicQuoteMock).not.toHaveBeenCalled();
      });

      it('throws prefixed error if promoted quote lost subsidy', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true }),
        ]);

        requoteMock.mockResolvedValue(makeQuote('promoted'));

        await expect(run(NON_ATOMIC_REQUEST_MOCK)).rejects.toThrow(
          'Atomic promotion failed: Promoted quote lost subsidy',
        );
      });

      it('throws prefixed error if promotion fails', async () => {
        getQuotesMock.mockResolvedValue([
          makeQuote('a', { isSubsidized: true, targetAmountRaw: '1.5' }),
        ]);

        const error = await run(NON_ATOMIC_REQUEST_MOCK).catch(
          (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(QuoteError);
        expect(error).toStrictEqual(
          expect.objectContaining({
            message: 'Atomic promotion failed: Invalid target amount: 1.5',
          }),
        );
      });
    });
  });

  describe('isAtomicMaxSupported', () => {
    it('returns true if enabled', () => {
      expect(
        isAtomicMaxSupported({
          messenger,
          request: REQUEST_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(true);

      expect(isAtomicMaxEnabledMock).toHaveBeenCalledWith(
        messenger,
        TRANSACTION_MOCK,
      );
    });

    it('returns false if disabled', () => {
      isAtomicMaxEnabledMock.mockReturnValue(false);

      expect(
        isAtomicMaxSupported({
          messenger,
          request: REQUEST_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(false);
    });

    it('returns false if post quote', () => {
      expect(
        isAtomicMaxSupported({
          messenger,
          request: { ...REQUEST_MOCK, isPostQuote: true },
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(false);
    });
  });

  describe('isAtomicMaxQuote', () => {
    it('returns true if max amount and atomic', () => {
      expect(
        isAtomicMaxQuote({ request: { ...REQUEST_MOCK, atomic: true } }),
      ).toBe(true);
    });

    it('returns false if not atomic', () => {
      expect(isAtomicMaxQuote({ request: REQUEST_MOCK })).toBe(false);
    });

    it('returns false if not max amount', () => {
      expect(
        isAtomicMaxQuote({
          request: { ...REQUEST_MOCK, atomic: true, isMaxAmount: false },
        }),
      ).toBe(false);
    });
  });
});
