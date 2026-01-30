import type { TransactionMeta } from '@metamask/transaction-controller';

import { RelayProvider } from './RelayProvider';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import type { RelayQuote } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import type { TokenPayProviderQuote } from '../token-pay/types';

jest.mock('./relay-quotes');
jest.mock('./relay-submit');

const QUOTE_MOCK = {
  original: {},
} as TransactionPayQuote<RelayQuote>;

function buildRequest(
  overrides: Partial<PayStrategyGetQuotesRequest> = {},
): PayStrategyGetQuotesRequest {
  return {
    messenger: overrides.messenger as PayStrategyGetQuotesRequest['messenger'],
    requests: [],
    transaction: {} as TransactionMeta,
    ...overrides,
  };
}

describe('RelayProvider', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
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
              relay: {
                enabled: true,
              },
            },
          },
        },
      },
    });
  });

  it('returns false when Relay is disabled', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          tokenPay: {
            providers: {
              relay: {
                enabled: false,
              },
            },
          },
        },
      },
    });

    const provider = new RelayProvider();
    const request = buildRequest({ messenger });

    expect(provider.supports(request)).toBe(false);
  });

  it('returns true when Relay is enabled', () => {
    const provider = new RelayProvider();
    const request = buildRequest({ messenger });

    expect(provider.supports(request)).toBe(true);
  });

  it('maps quotes with provider metadata', async () => {
    getRelayQuotesMock.mockResolvedValue([QUOTE_MOCK]);

    const provider = new RelayProvider();
    const result = await provider.getQuotes(buildRequest({ messenger }));

    expect(result[0].original).toStrictEqual({
      providerId: 'relay',
      quote: QUOTE_MOCK.original,
    });
    expect(result[0].strategy).toBe(TransactionPayStrategy.TokenPay);
  });

  it('executes by unwrapping provider quotes', async () => {
    submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0xhash' });

    const provider = new RelayProvider();
    const wrappedQuote = {
      original: {
        providerId: 'relay',
        quote: QUOTE_MOCK.original,
      },
    } as TransactionPayQuote<TokenPayProviderQuote<RelayQuote>>;

    await provider.execute({
      quotes: [wrappedQuote],
      messenger,
      transaction: { id: '1', txParams: { from: '0x1' } } as TransactionMeta,
      isSmartTransaction: jest.fn(),
    });

    expect(submitRelayQuotesMock).toHaveBeenCalledWith(
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
