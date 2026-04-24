import type { Hex, Json } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock';
import type { TransactionPayQuote } from '../types';
import { checkQuoteUsability } from './quote-usability';
import { getNativeToken, getTokenBalance } from './token';

jest.mock('./token', () => ({
  ...jest.requireActual<typeof import('./token')>('./token'),
  getTokenBalance: jest.fn(),
}));

const ACCOUNT_MOCK = '0xabc' as Hex;
const SOURCE_CHAIN_ID_MOCK = '0x1' as Hex;
const SOURCE_TOKEN_ADDRESS_MOCK =
  '0x1234567890123456789012345678901234567890' as Hex;
const TARGET_CHAIN_ID_MOCK = '0x2' as Hex;
const TARGET_TOKEN_ADDRESS_MOCK =
  '0x9876543210987654321098765432109876543210' as Hex;

const QUOTE_MOCK = {
  dust: {
    fiat: '0',
    usd: '0',
  },
  estimatedDuration: 1,
  fees: {
    metaMask: {
      fiat: '0',
      usd: '0',
    },
    provider: {
      fiat: '0',
      usd: '0',
    },
    sourceNetwork: {
      estimate: {
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      },
      max: {
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      },
    },
    targetNetwork: {
      fiat: '0',
      usd: '0',
    },
  },
  original: {},
  request: {
    from: ACCOUNT_MOCK,
    sourceBalanceRaw: '100',
    sourceChainId: SOURCE_CHAIN_ID_MOCK,
    sourceTokenAddress: SOURCE_TOKEN_ADDRESS_MOCK,
    sourceTokenAmount: '0',
    targetAmountMinimum: '0',
    targetChainId: TARGET_CHAIN_ID_MOCK,
    targetTokenAddress: TARGET_TOKEN_ADDRESS_MOCK,
  },
  sourceAmount: {
    fiat: '0',
    human: '0',
    raw: '0',
    usd: '0',
  },
  strategy: 'test',
  targetAmount: {
    fiat: '0',
    usd: '0',
  },
} as TransactionPayQuote<Json>;

describe('Quote Usability Utils', () => {
  const { messenger } = getMessengerMock();
  const getTokenBalanceMock = jest.mocked(getTokenBalance);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenBalanceMock.mockReturnValue('100');
  });

  describe('checkQuoteUsability', () => {
    it('returns unusable if a quote requires an authorization list', () => {
      const result = checkQuoteUsability({
        messenger,
        quotes: [
          {
            ...QUOTE_MOCK,
            original: {
              metamask: {
                requiresAuthorizationList: true,
              },
            },
          } as TransactionPayQuote<Json>,
        ],
      });

      expect(result).toStrictEqual({
        reason: 'requires_authorization_list',
        usable: false,
      });
    });

    it('uses the quote source balance for native source-token requirements', () => {
      const result = checkQuoteUsability({
        messenger,
        quotes: [
          {
            ...QUOTE_MOCK,
            request: {
              ...QUOTE_MOCK.request,
              sourceBalanceRaw: '5',
              sourceTokenAddress: getNativeToken(SOURCE_CHAIN_ID_MOCK),
            },
            sourceAmount: {
              ...QUOTE_MOCK.sourceAmount,
              raw: '10',
            },
          } as TransactionPayQuote<Json>,
        ],
      });

      expect(result).toStrictEqual({
        reason: 'insufficient_native_gas',
        usable: false,
      });
      expect(getTokenBalanceMock).not.toHaveBeenCalled();
    });

    it('treats quotes with non-object original data as usable if no native balance is required', () => {
      const result = checkQuoteUsability({
        messenger,
        quotes: [
          {
            ...QUOTE_MOCK,
            original: undefined as never,
          },
        ],
      });

      expect(result).toStrictEqual({ usable: true });
    });

    it('treats invalid native amount data as zero', () => {
      const result = checkQuoteUsability({
        messenger,
        quotes: [
          {
            ...QUOTE_MOCK,
            request: {
              ...QUOTE_MOCK.request,
              sourceTokenAddress: getNativeToken(SOURCE_CHAIN_ID_MOCK),
            },
            sourceAmount: {
              ...QUOTE_MOCK.sourceAmount,
              raw: 'invalid',
            },
          } as TransactionPayQuote<Json>,
        ],
      });

      expect(result).toStrictEqual({ usable: true });
    });

    it('treats missing native gas amount data as zero', () => {
      const result = checkQuoteUsability({
        messenger,
        quotes: [
          {
            ...QUOTE_MOCK,
            fees: {
              ...QUOTE_MOCK.fees,
              sourceNetwork: {
                ...QUOTE_MOCK.fees.sourceNetwork,
                max: {
                  ...QUOTE_MOCK.fees.sourceNetwork.max,
                  raw: undefined as never,
                },
              },
            },
          } as TransactionPayQuote<Json>,
        ],
      });

      expect(result).toStrictEqual({ usable: true });
    });
  });
});
