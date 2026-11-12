import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionPayControllerMessenger } from '../../index.js';
import type {
  PayStrategyResumeRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatQuotes } from './fiat-quotes.js';
import { resumeFiatDirectMusd } from './fiat-resume.js';
import { submitFiatQuotes } from './fiat-submit.js';
import { FiatStrategy } from './FiatStrategy.js';
import type { FiatQuote } from './types.js';

vi.mock(import('./fiat-quotes.js'));
vi.mock(import('./fiat-resume.js'));
vi.mock(import('./fiat-submit.js'));

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<FiatQuote>;

const MESSENGER_MOCK = {
  call: vi.fn().mockReturnValue({ remoteFeatureFlags: {} }),
} as unknown as TransactionPayControllerMessenger;

describe('FiatStrategy', () => {
  const getFiatQuotesMock = vi.mocked(getFiatQuotes);
  const resumeFiatDirectMusdMock = vi.mocked(resumeFiatDirectMusd);
  const submitFiatQuotesMock = vi.mocked(submitFiatQuotes);

  beforeEach(() => {
    vi.resetAllMocks();
    getFiatQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('getQuotes', () => {
    it('delegates to getFiatQuotes', async () => {
      const request = {
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: {} as TransactionMeta,
      };

      const result = await new FiatStrategy().getQuotes(request);

      expect(result).toStrictEqual([QUOTE_MOCK]);
      expect(getFiatQuotesMock).toHaveBeenCalledWith(request);
    });
  });

  describe('execute', () => {
    it('delegates to submitFiatQuotes', async () => {
      submitFiatQuotesMock.mockResolvedValue({ transactionHash: '0x1234' });

      await new FiatStrategy().execute({
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitFiatQuotesMock).toHaveBeenCalledTimes(1);
      expect(
        submitFiatQuotesMock.mock.calls[0][0].transaction.txParams.from,
      ).toBe('0x1');
    });

    it('prefixes execute errors with the Fiat prefix without replacing the Error object', async () => {
      const error = new Error('Missing order ID');
      submitFiatQuotesMock.mockRejectedValue(error);

      const thrown = await new FiatStrategy()
        .execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        })
        .catch((caught) => caught);

      expect(thrown).toBe(error);
      expect(thrown.message).toBe('Fiat: Missing order ID');
    });

    it('throws if fiat submission returns no transaction hash', async () => {
      submitFiatQuotesMock.mockResolvedValue({ transactionHash: undefined });

      await expect(
        new FiatStrategy().execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow('Fiat: Missing transaction hash');
    });

    it('preserves nested Post-Ramp and Vault prefixes', async () => {
      submitFiatQuotesMock.mockRejectedValue(
        new Error(
          'Post-Ramp: Direct mUSD: Second leg: Vault: Missing transaction hash',
        ),
      );

      await expect(
        new FiatStrategy().execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow(
        'Fiat: Post-Ramp: Direct mUSD: Second leg: Vault: Missing transaction hash',
      );
    });
  });

  describe('canResume', () => {
    it('returns true when fiat order metadata is complete', () => {
      expect(
        new FiatStrategy().canResume({
          metamaskPay: {
            fiat: { orderId: 'order-1', provider: 'transak' },
          },
        } as TransactionMeta),
      ).toBe(true);
    });

    it('returns false when fiat order metadata is missing', () => {
      expect(new FiatStrategy().canResume({} as TransactionMeta)).toBe(false);
      expect(
        new FiatStrategy().canResume({
          metamaskPay: { fiat: { orderId: 'order-1' } },
        } as TransactionMeta),
      ).toBe(false);
      expect(
        new FiatStrategy().canResume({
          metamaskPay: { fiat: { provider: 'transak' } },
        } as TransactionMeta),
      ).toBe(false);
    });
  });

  describe('resume', () => {
    it('delegates to resumeFiatDirectMusd', async () => {
      resumeFiatDirectMusdMock.mockResolvedValue({ transactionHash: '0x1234' });
      const request = {
        messenger: MESSENGER_MOCK,
        transaction: { id: 'tx-1' } as TransactionMeta,
      } satisfies PayStrategyResumeRequest;

      expect(await new FiatStrategy().resume(request)).toStrictEqual({
        transactionHash: '0x1234',
      });

      expect(resumeFiatDirectMusdMock).toHaveBeenCalledWith(request);
    });

    it('throws if fiat resume returns no transaction hash', async () => {
      resumeFiatDirectMusdMock.mockResolvedValue({
        transactionHash: undefined,
      });

      await expect(
        new FiatStrategy().resume({
          messenger: MESSENGER_MOCK,
          transaction: { id: 'tx-1' } as TransactionMeta,
        }),
      ).rejects.toThrow('Fiat: Missing transaction hash after fiat resume');
    });

    it('prefixes resume errors with the Fiat prefix without replacing the Error object', async () => {
      const error = new Error('resume failed');
      resumeFiatDirectMusdMock.mockRejectedValue(error);

      const thrown = await new FiatStrategy()
        .resume({
          messenger: MESSENGER_MOCK,
          transaction: { id: 'tx-1' } as TransactionMeta,
        })
        .catch((caught: unknown) => caught);

      expect(thrown).toBe(error);
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('Fiat: resume failed');
    });
  });
});
