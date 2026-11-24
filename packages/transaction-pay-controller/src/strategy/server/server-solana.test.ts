import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockModuleExcept } from '../../../tests/mock-module-except.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { getServerPollingInterval } from '../../utils/feature-flags.js';
import {
  compileSolanaTransaction,
  computeSolanaFeeRaw,
  getSolanaRentReserveRaw,
  getSolanaSource,
  signAndSendSolanaTransaction,
  waitForSolanaTransactionConfirmed,
} from '../../utils/solana.js';
import type { SolanaSource } from '../../utils/solana.js';
import {
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
} from '../../utils/token.js';
import { updateTransaction } from '../../utils/transaction.js';
import {
  getServerSolanaNetworkCost,
  getServerSolanaSender,
  requoteServerSolanaMax,
  submitServerSolanaTransaction,
  validateServerSolanaBalance,
} from './server-solana.js';
import type { ServerQuote, ServerSolanaTransactionStep } from './types.js';

vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../../utils/solana.js'), async (importOriginal) =>
  mockModuleExcept(await importOriginal(), [
    'getSolanaNativeAssetId',
    'isSolanaNativeRequest',
    'SOLANA_DECIMALS',
  ]),
);
vi.mock(import('../../utils/token.js'));
vi.mock(import('../../utils/transaction.js'));

const SCOPE = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOURCE_ADDRESS = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const NATIVE_ASSET = `${SCOPE}/slip44:501` as CaipAssetType;
const USDC_ASSET =
  `${SCOPE}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as CaipAssetType;

const SOURCE: SolanaSource = {
  accountId: 'wallet-account-uuid',
  address: SOURCE_ADDRESS,
  scope: SCOPE,
  snapId: 'npm:@metamask/solana-wallet-snap' as SolanaSource['snapId'],
};

const SOLANA_STEP: ServerSolanaTransactionStep = {
  addressLookupTableAddresses: [],
  instructions: [
    {
      data: '00',
      keys: [{ isSigner: true, isWritable: true, pubkey: SOURCE_ADDRESS }],
      programId: '11111111111111111111111111111111',
    },
  ],
  type: 'solanaTransaction',
};

const QUOTE_REQUEST: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891',
  sourceAccountId: `${SCOPE}:${SOURCE_ADDRESS}`,
  sourceAssetId: NATIVE_ASSET,
  sourceBalanceRaw: '1000000000',
  sourceTokenAmount: '1000000000',
  targetAmountMinimum: '0',
  targetChainId: '0xa4b1',
  targetTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

/**
 * Build a Solana-source server quote.
 *
 * @param options - Quote overrides.
 * @param options.feeRaw - Network fee in lamports.
 * @param options.request - Quote request overrides.
 * @param options.sourceAmountRaw - Source amount in atomic units.
 * @returns The quote.
 */
function getQuote({
  feeRaw = '5000',
  request = {},
  sourceAmountRaw = '500000000',
}: {
  feeRaw?: string;
  request?: Partial<QuoteRequest>;
  sourceAmountRaw?: string;
} = {}): TransactionPayQuote<ServerQuote> {
  return {
    original: {
      provider: 'relay',
      solana: { feeRaw, rentReserveRaw: '890880' },
      steps: [SOLANA_STEP],
    },
    request: { ...QUOTE_REQUEST, ...request },
    sourceAmount: { raw: sourceAmountRaw },
  } as TransactionPayQuote<ServerQuote>;
}

describe('server-solana', () => {
  const messenger = {} as TransactionPayControllerMessenger;

  const compileSolanaTransactionMock = vi.mocked(compileSolanaTransaction);
  const computeSolanaFeeRawMock = vi.mocked(computeSolanaFeeRaw);
  const getAssetBalanceMock = vi.mocked(getAssetBalance);
  const getAssetFiatRateMock = vi.mocked(getAssetFiatRate);
  const getAssetInfoMock = vi.mocked(getAssetInfo);
  const getServerPollingIntervalMock = vi.mocked(getServerPollingInterval);
  const getSolanaRentReserveRawMock = vi.mocked(getSolanaRentReserveRaw);
  const getSolanaSourceMock = vi.mocked(getSolanaSource);
  const signAndSendSolanaTransactionMock = vi.mocked(
    signAndSendSolanaTransaction,
  );
  const updateTransactionMock = vi.mocked(updateTransaction);
  const waitForSolanaTransactionConfirmedMock = vi.mocked(
    waitForSolanaTransactionConfirmed,
  );

  beforeEach(() => {
    vi.resetAllMocks();

    getSolanaSourceMock.mockReturnValue(SOURCE);
    compileSolanaTransactionMock.mockResolvedValue({
      lastValidBlockHeight: 1234,
      transaction: 'base64',
    });
    computeSolanaFeeRawMock.mockResolvedValue('5000');
    getSolanaRentReserveRawMock.mockResolvedValue('890880');
    getAssetFiatRateMock.mockReturnValue({ fiatRate: '180', usdRate: '200' });
    getServerPollingIntervalMock.mockReturnValue(2000);
  });

  describe('getServerSolanaSender', () => {
    it('returns the address of the Solana source account', () => {
      expect(getServerSolanaSender(messenger, QUOTE_REQUEST)).toBe(
        SOURCE_ADDRESS,
      );
      expect(getSolanaSourceMock).toHaveBeenCalledWith(
        messenger,
        QUOTE_REQUEST,
      );
    });
  });

  describe('getServerSolanaNetworkCost', () => {
    it('prices the Snap fee of the compiled step in fiat', async () => {
      expect(
        await getServerSolanaNetworkCost({
          messenger,
          quoteRequest: QUOTE_REQUEST,
          steps: [SOLANA_STEP],
        }),
      ).toStrictEqual({
        fee: {
          fiat: '0.0009',
          human: '0.000005',
          raw: '5000',
          usd: '0.001',
        },
        solana: { feeRaw: '5000', rentReserveRaw: '890880' },
      });
      expect(compileSolanaTransactionMock).toHaveBeenCalledWith({
        messenger,
        source: SOURCE,
        transaction: SOLANA_STEP,
      });
      expect(computeSolanaFeeRawMock).toHaveBeenCalledWith(
        messenger,
        SOURCE,
        'base64',
      );
      expect(getAssetFiatRateMock).toHaveBeenCalledWith(
        messenger,
        NATIVE_ASSET,
      );
    });

    it('throws if the native fiat rate is missing', async () => {
      getAssetFiatRateMock.mockReturnValue(undefined);

      await expect(
        getServerSolanaNetworkCost({
          messenger,
          quoteRequest: QUOTE_REQUEST,
          steps: [SOLANA_STEP],
        }),
      ).rejects.toThrow('Solana native fiat rate not found');
    });

    it.each([
      ['no Solana step', []],
      ['multiple Solana steps', [SOLANA_STEP, SOLANA_STEP]],
      [
        'an EVM step alongside the Solana step',
        [SOLANA_STEP, { type: 'transaction' }],
      ],
    ])('throws for a quote with %s', async (_label, steps) => {
      await expect(
        getServerSolanaNetworkCost({
          messenger,
          quoteRequest: QUOTE_REQUEST,
          steps: steps as ServerQuote['steps'],
        }),
      ).rejects.toThrow(
        'Server quote must have a single Solana transaction step',
      );
    });
  });

  describe('requoteServerSolanaMax', () => {
    it('re-quotes with the fee and rent reserve withheld', async () => {
      const maxQuote = getQuote();
      const requote = vi.fn().mockResolvedValue(maxQuote);

      expect(await requoteServerSolanaMax(getQuote(), requote)).toBe(maxQuote);
      expect(requote).toHaveBeenCalledTimes(1);
      expect(requote).toHaveBeenCalledWith('999104120');
    });

    it('re-quotes once more with a higher fee', async () => {
      const finalQuote = getQuote({ feeRaw: '10000' });
      const requote = vi
        .fn()
        .mockResolvedValueOnce(getQuote({ feeRaw: '10000' }))
        .mockResolvedValueOnce(finalQuote);

      expect(await requoteServerSolanaMax(getQuote(), requote)).toBe(
        finalQuote,
      );
      expect(requote).toHaveBeenNthCalledWith(2, '999099120');
    });

    it('returns the original quote when the balance cannot cover the fee and reserve', async () => {
      const quote = getQuote({ request: { sourceBalanceRaw: '895880' } });
      const requote = vi.fn();

      expect(await requoteServerSolanaMax(quote, requote)).toBe(quote);
      expect(requote).not.toHaveBeenCalled();
    });

    it('keeps the first max quote when the higher fee leaves no balance', async () => {
      const maxQuote = getQuote({
        feeRaw: '1000000000',
        request: { sourceBalanceRaw: '1000000000' },
      });
      const requote = vi.fn().mockResolvedValue(maxQuote);

      expect(await requoteServerSolanaMax(getQuote(), requote)).toBe(maxQuote);
      expect(requote).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateServerSolanaBalance', () => {
    it('does not throw when the balance covers the amount, fee and reserve', () => {
      expect(() =>
        validateServerSolanaBalance(messenger, [getQuote()]),
      ).not.toThrow();
    });

    it('throws a native source shortfall with every quote', () => {
      const quotes = [getQuote({ sourceAmountRaw: '999500000' })];

      expect(() => validateServerSolanaBalance(messenger, quotes)).toThrow(
        expect.objectContaining({
          info: {
            detail: [
              'Network fee: 0.000005 SOL',
              'Rent reserve: 0.00089088 SOL',
              'Missing source: 395880',
            ],
            message: 'Insufficient Solana balance for quote',
            reason: 'insufficient-source-balance',
          },
          quotes,
        }),
      );
    });

    it('throws SPL token and native SOL shortfalls', () => {
      getAssetBalanceMock.mockReturnValue('5000');
      getAssetInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });

      expect(() =>
        validateServerSolanaBalance(messenger, [
          getQuote({
            request: { sourceAssetId: USDC_ASSET, sourceBalanceRaw: '1000000' },
            sourceAmountRaw: '1500000',
          }),
        ]),
      ).toThrow(
        expect.objectContaining({
          info: expect.objectContaining({
            detail: [
              'Network fee: 0.000005 SOL',
              'Rent reserve: 0.00089088 SOL',
              'Missing native: 0.00089088 SOL',
              'Missing source: 0.5 USDC',
            ],
          }),
        }),
      );
      expect(getAssetBalanceMock).toHaveBeenCalledWith(
        messenger,
        SOURCE.accountId,
        NATIVE_ASSET,
      );
    });

    it('reports the raw source shortfall when the source asset is unknown', () => {
      getAssetBalanceMock.mockReturnValue('895880');

      expect(() =>
        validateServerSolanaBalance(messenger, [
          getQuote({
            request: { sourceAssetId: USDC_ASSET, sourceBalanceRaw: '1000000' },
            sourceAmountRaw: '1500000',
          }),
        ]),
      ).toThrow(
        expect.objectContaining({
          info: expect.objectContaining({
            detail: expect.arrayContaining(['Missing source: 500000']),
          }),
        }),
      );
    });

    it('throws a native SOL shortfall alone for an SPL token quote', () => {
      getAssetBalanceMock.mockReturnValue('0');

      expect(() =>
        validateServerSolanaBalance(messenger, [
          getQuote({
            request: { sourceAssetId: USDC_ASSET, sourceBalanceRaw: '1000000' },
            sourceAmountRaw: '1000000',
          }),
        ]),
      ).toThrow(
        expect.objectContaining({
          info: expect.objectContaining({
            detail: [
              'Network fee: 0.000005 SOL',
              'Rent reserve: 0.00089088 SOL',
              'Missing native: 0.00089588 SOL',
            ],
          }),
        }),
      );
    });

    it('does not throw for an affordable SPL token quote', () => {
      getAssetBalanceMock.mockReturnValue('895880');

      expect(() =>
        validateServerSolanaBalance(messenger, [
          getQuote({
            request: { sourceAssetId: USDC_ASSET, sourceBalanceRaw: '1000000' },
            sourceAmountRaw: '1000000',
          }),
        ]),
      ).not.toThrow();
    });
  });

  describe('submitServerSolanaTransaction', () => {
    const TRANSACTION = { id: 'tx-1' } as TransactionMeta;

    it('recompiles, signs once, records the source hash and waits for confirmation', async () => {
      signAndSendSolanaTransactionMock.mockResolvedValue('signature');

      await submitServerSolanaTransaction(getQuote(), messenger, TRANSACTION);

      expect(compileSolanaTransactionMock).toHaveBeenCalledWith({
        messenger,
        source: SOURCE,
        transaction: SOLANA_STEP,
      });
      expect(signAndSendSolanaTransactionMock).toHaveBeenCalledTimes(1);
      expect(signAndSendSolanaTransactionMock).toHaveBeenCalledWith(
        messenger,
        SOURCE,
        'base64',
      );
      expect(waitForSolanaTransactionConfirmedMock).toHaveBeenCalledWith({
        lastValidBlockHeight: 1234,
        messenger,
        pollingInterval: 2000,
        scope: SCOPE,
        signature: 'signature',
      });

      const transactionMeta = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][1](transactionMeta);

      expect(transactionMeta.metamaskPay?.sourceHash).toBe('signature');
    });
  });
});
