import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { AcrossProvider } from './AcrossProvider';
import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';
import type { AcrossQuote } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';
import type { TokenPayProviderQuote } from '../token-pay/types';

jest.mock('./across-quotes');
jest.mock('./across-submit');

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891' as Hex,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef',
};

function buildRequest(
  overrides: Partial<PayStrategyGetQuotesRequest> = {},
): PayStrategyGetQuotesRequest {
  return {
    messenger: overrides.messenger as PayStrategyGetQuotesRequest['messenger'],
    requests: [QUOTE_REQUEST_MOCK],
    transaction: { type: TransactionType.simpleSend } as TransactionMeta,
    ...overrides,
  };
}

describe('AcrossProvider', () => {
  const getAcrossQuotesMock = jest.mocked(getAcrossQuotes);
  const submitAcrossQuotesMock = jest.mocked(submitAcrossQuotes);
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          tokenPay: {
            providers: {
              across: {
                enabled: true,
              },
            },
          },
        },
      },
    });
  });

  it('returns false for perps deposit transactions', () => {
    const provider = new AcrossProvider();
    const request = buildRequest({
      messenger,
      transaction: { type: TransactionType.perpsDeposit } as TransactionMeta,
    });

    expect(provider.supports(request)).toBe(false);
  });

  it('returns false for same-chain requests', () => {
    const provider = new AcrossProvider();
    const request = buildRequest({
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          targetChainId: QUOTE_REQUEST_MOCK.sourceChainId,
        },
      ],
    });

    expect(provider.supports(request)).toBe(false);
  });

  it('returns false when Across is disabled', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          tokenPay: {
            providers: {
              across: {
                enabled: false,
              },
            },
          },
        },
      },
    });

    const provider = new AcrossProvider();
    const request = buildRequest({ messenger });

    expect(provider.supports(request)).toBe(false);
  });

  it('returns true for same-chain requests when allowed', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          tokenPay: {
            providers: {
              across: {
                allowSameChain: true,
                enabled: true,
              },
            },
          },
        },
      },
    });

    const provider = new AcrossProvider();
    const request = buildRequest({
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          targetChainId: QUOTE_REQUEST_MOCK.sourceChainId,
        },
      ],
    });

    expect(provider.supports(request)).toBe(true);
  });

  it('returns true for cross-chain requests', () => {
    const provider = new AcrossProvider();
    const request = buildRequest({ messenger });

    expect(provider.supports(request)).toBe(true);
  });

  it('maps quotes with provider metadata', async () => {
    const quote = {
      original: {
        request: { amount: '1', tradeType: 'exactOutput' },
        quote: {} as AcrossQuote['quote'],
      },
    } as TransactionPayQuote<AcrossQuote>;

    getAcrossQuotesMock.mockResolvedValue([quote]);

    const provider = new AcrossProvider();
    const result = await provider.getQuotes(buildRequest({ messenger }));

    expect(result[0].original).toStrictEqual({
      providerId: 'across',
      quote: quote.original,
    });
    expect(result[0].strategy).toBe(TransactionPayStrategy.TokenPay);
  });

  it('executes by unwrapping provider quotes', async () => {
    submitAcrossQuotesMock.mockResolvedValue({ transactionHash: '0xhash' });

    const provider = new AcrossProvider();
    const wrappedQuote = {
      original: {
        providerId: 'across',
        quote: {
          request: { amount: '1', tradeType: 'exactOutput' },
          quote: {} as AcrossQuote['quote'],
        },
      },
    } as TransactionPayQuote<TokenPayProviderQuote<AcrossQuote>>;

    await provider.execute({
      quotes: [wrappedQuote],
      messenger,
      transaction: { id: '1', txParams: { from: '0x1' } } as TransactionMeta,
      isSmartTransaction: jest.fn(),
    });

    expect(submitAcrossQuotesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [
          expect.objectContaining({
            original: wrappedQuote.original.quote,
          }),
        ],
      }),
    );
  });
});
