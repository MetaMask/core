import { successfulFetch, toHex } from '@metamask/controller-utils';
import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getRelayQuotes } from './relay-quotes';
import type { RelayQuote } from './types';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
} from '../../types';
import { DEFAULT_RELAY_QUOTE_URL } from '../../utils/feature-flags';
import {
  calculateGasCost,
  calculateGasFeeTokenCost,
  calculateTransactionGasCost,
} from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891',
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
};

const QUOTE_MOCK = {
  details: {
    currencyIn: {
      amountUsd: '1.24',
    },
    currencyOut: {
      amountFormatted: '1.0',
      amountUsd: '1.23',
      currency: {
        decimals: 2,
      },
      minimumAmount: '125',
    },
    timeEstimate: 300,
  },
  fees: {
    relayer: {
      amountUsd: '1.11',
    },
  },
  steps: [
    {
      items: [
        {
          check: {
            endpoint: '/test',
            method: 'GET',
          },
          data: {
            chainId: 1,
            data: '0x123' as Hex,
            from: '0x1' as Hex,
            gas: '21000',
            maxFeePerGas: '1000000000',
            maxPriorityFeePerGas: '2000000000',
            to: '0x2' as Hex,
            value: '300000',
          },
          status: 'complete',
        },
      ],
      kind: 'transaction',
    },
  ],
} as RelayQuote;

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;

const DELEGATION_RESULT_MOCK = {
  authorizationList: [
    {
      chainId: '0x1' as Hex,
      nonce: '0x2' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0x111' as Hex,
  to: '0x222' as Hex,
  value: '0x333' as Hex,
} as Awaited<ReturnType<GetDelegationTransactionCallback>>;

const GAS_FEE_TOKEN_MOCK = {
  amount: toHex(1230000),
  gas: toHex(21000),
  tokenAddress: '0xabc' as Hex,
} as GasFeeToken;

describe('Relay Quotes Utils', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);

  const calculateTransactionGasCostMock = jest.mocked(
    calculateTransactionGasCost,
  );

  const {
    messenger,
    getDelegationTransactionMock,
    getGasFeeTokensMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '4.0',
    });

    calculateTransactionGasCostMock.mockReturnValue({
      fiat: '2.34',
      human: '0.615',
      raw: '6150000000000000',
      usd: '1.23',
    });

    calculateGasCostMock.mockReturnValue({
      fiat: '4.56',
      human: '1.725',
      raw: '1725000000000000',
      usd: '3.45',
    });

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '5.56',
      human: '2.725',
      raw: '2725000000000000',
      usd: '4.45',
    });

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: {},
    });

    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGasFeeTokensMock.mockResolvedValue([]);
  });

  describe('getRelayQuotes', () => {
    it('returns quotes from Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toStrictEqual([
        expect.objectContaining({
          original: QUOTE_MOCK,
        }),
      ]);
    });

    it('sends request to Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        DEFAULT_RELAY_QUOTE_URL,
        expect.objectContaining({
          body: JSON.stringify({
            amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
            destinationChainId: 2,
            destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
            originChainId: 1,
            originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
            recipient: QUOTE_REQUEST_MOCK.from,
            tradeType: 'EXPECTED_OUTPUT',
            user: QUOTE_REQUEST_MOCK.from,
          }),
        }),
      );
    });

    it('includes transactions in request', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          authorizationList: [
            {
              chainId: 1,
              nonce: 2,
              yParity: 1,
            },
          ],
          tradeType: 'EXACT_OUTPUT',
          txs: [
            {
              to: QUOTE_REQUEST_MOCK.targetTokenAddress,
              data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b',
              value: '0x0',
            },
            {
              to: DELEGATION_RESULT_MOCK.to,
              data: DELEGATION_RESULT_MOCK.data,
              value: DELEGATION_RESULT_MOCK.value,
            },
          ],
        }),
      );
    });

    it('sends request to url from feature flag', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const relayQuoteUrl = 'https://test.com/quote';

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        cacheTimestamp: 0,
        remoteFeatureFlags: {
          confirmations_pay: {
            relayQuoteUrl,
          },
        },
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        relayQuoteUrl,
        expect.anything(),
      );
    });

    it('ignores requests with no target minimum', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, targetAmountMinimum: '0' }],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('includes duration in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].estimatedDuration).toBe(300);
    });

    it('includes provider fee from relayer fee', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.11',
        fiat: '2.22',
      });
    });

    it('includes provider fee from usd change if greater', async () => {
      const quote = cloneDeep(QUOTE_MOCK);
      quote.details.currencyIn.amountUsd = '3.00';

      successfulFetchMock.mockResolvedValue({
        json: async () => quote,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.77',
        fiat: '3.54',
      });
    });

    it('includes dust in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].dust).toStrictEqual({
        usd: '0.0246',
        fiat: '0.0492',
      });
    });

    describe('includes source network fee', () => {
      it('in quote', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('using fallback if gas missing', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        delete quoteMock.steps[0].items[0].data.gas;

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 900000 }),
        );
      });

      it('using gas total from multiple transactions', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);

        quoteMock.steps[0].items.push({
          data: {
            gas: '480000',
          },
        } as never);

        quoteMock.steps.push({
          items: [
            {
              data: {
                gas: '1000',
              },
            },
            {
              data: {
                gas: '2000',
              },
            },
          ],
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 504000 }),
        );
      });

      it('using gas fee token cost if insufficient native balance', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBe(true);
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '5.56',
            human: '2.725',
            raw: '2725000000000000',
            usd: '4.45',
          },
          max: {
            fiat: '5.56',
            human: '2.725',
            raw: '2725000000000000',
            usd: '4.45',
          },
        });
      });

      it('using estimated gas fee token cost if insufficient native balance and batch', async () => {
        const quote = cloneDeep(QUOTE_MOCK);

        quote.steps[0].items.push({
          data: {
            gas: '21000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quote,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
          expect.objectContaining({
            gasFeeToken: {
              ...GAS_FEE_TOKEN_MOCK,
              amount: toHex(1230000 * 2),
            },
          }),
        );
      });

      it('not using gas fee token if sufficient native balance', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1725000000000000');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('not using gas fee token if source token not found', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([
          { ...GAS_FEE_TOKEN_MOCK, tokenAddress: '0xdef' as Hex },
        ]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('not using gas fee token if calculation fails', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
        calculateGasFeeTokenCostMock.mockReturnValue(undefined);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('using gas fee token cost with normalized value', async () => {
        const quote = cloneDeep(QUOTE_MOCK);
        quote.steps[0].items[0].data.value = undefined as never;

        successfulFetchMock.mockResolvedValue({
          json: async () => quote,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(getGasFeeTokensMock).toHaveBeenCalledWith(
          expect.objectContaining({
            value: '0x0',
          }),
        );
      });
    });

    it('includes target network fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.targetNetwork).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('throws if fetching quote fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Fetch error'));

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Fetch error');
    });

    it('throws if source token fiat rate is unavailable', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(`Source token fiat rate not found`);
    });

    it('updates request if Arbitrum deposit to Hyperliquid', async () => {
      const arbitrumToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [arbitrumToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: '12300',
          destinationChainId: 1337,
          destinationCurrency: '0x00000000000000000000000000000000',
        }),
      );
    });

    it('updates request if source is polygon native', async () => {
      getNativeTokenMock.mockReturnValue(
        '0x0000000000000000000000000000000000001010',
      );

      const polygonToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        sourceChainId: CHAIN_ID_POLYGON,
        sourceTokenAddress: '0x0000000000000000000000000000000000001010',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [polygonToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          originCurrency: NATIVE_TOKEN_ADDRESS,
        }),
      );
    });
  });
});
