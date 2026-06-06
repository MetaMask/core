import type {
  Quote as RampsQuote,
  QuotesResponse as RampsQuotesResponse,
} from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionFiatQuoteError,
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../../types';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import type { TransactionPayFiatAsset } from './constants';
import { getFiatQuotes } from './fiat-quotes';
import { deriveFiatAssetForFiatPayment } from './utils';

jest.mock('../relay/relay-quotes');
jest.mock('../../utils/token');
jest.mock('./utils');

const TRANSACTION_ID = 'tx-id';
const WALLET_ADDRESS = '0x1111111111111111111111111111111111111111' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID,
  txParams: { from: WALLET_ADDRESS },
  type: TransactionType.predictDeposit,
} as TransactionMeta;

const REQUIRED_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x2222222222222222222222222222222222222222' as Hex,
  allowUnderMinimum: false,
  amountFiat: '12',
  amountHuman: '12',
  amountRaw: '12000000',
  amountUsd: '12',
  balanceFiat: '0',
  balanceHuman: '0',
  balanceRaw: '0',
  balanceUsd: '0',
  chainId: '0x89',
  decimals: 6,
  skipIfBalance: false,
  symbol: 'USDC',
};

const FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  chainId: '0x89',
};

const FIAT_QUOTE_MOCK: RampsQuote = {
  provider: '/providers/transak-native-staging',
  quote: {
    amountIn: 20,
    amountOut: 5,
    networkFee: 0.2,
    paymentMethod: '/payments/debit-credit-card',
    providerFee: 0.5,
  },
};

const FIAT_QUOTES_RESPONSE_MOCK: RampsQuotesResponse = {
  customActions: [],
  error: [],
  sorted: [],
  success: [FIAT_QUOTE_MOCK],
};

const AMOUNT_MOCK = {
  fiat: '0',
  human: '0',
  raw: '0',
  usd: '0',
};

function getRelayQuoteMock({
  metaMaskUsd = '4',
  providerUsd = '1',
  sourceNetworkUsd = '2',
  targetNetworkUsd = '3',
}: {
  metaMaskUsd?: string;
  providerUsd?: string;
  sourceNetworkUsd?: string;
  targetNetworkUsd?: string;
} = {}): TransactionPayQuote<RelayQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 1,
    fees: {
      isSourceGasFeeToken: false,
      isTargetGasFeeToken: false,
      metaMask: { fiat: metaMaskUsd, usd: metaMaskUsd },
      provider: { fiat: providerUsd, usd: providerUsd },
      sourceNetwork: {
        estimate: {
          fiat: sourceNetworkUsd,
          human: '0',
          raw: '0',
          usd: sourceNetworkUsd,
        },
        max: AMOUNT_MOCK,
      },
      targetNetwork: { fiat: targetNetworkUsd, usd: targetNetworkUsd },
    },
    original: {} as RelayQuote,
    request: {} as never,
    sourceAmount: AMOUNT_MOCK,
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

function getRequest({
  amountFiat = '10',
  fiatPaymentMethod = '/payments/debit-credit-card',
  rampsQuotes = FIAT_QUOTES_RESPONSE_MOCK,
  tokens = [REQUIRED_TOKEN_MOCK],
  throwsOnRampsQuotes,
}: {
  amountFiat?: string;
  fiatPaymentMethod?: string;
  rampsQuotes?: RampsQuotesResponse;
  tokens?: TransactionPayRequiredToken[];
  throwsOnRampsQuotes?: Error;
} = {}): {
  callMock: jest.Mock;
  capturedFiatPayment: TransactionFiatPayment;
  request: PayStrategyGetQuotesRequest;
} {
  const capturedFiatPayment: TransactionFiatPayment = {};

  const callMock = jest.fn(
    (action: string, requestArg?: Record<string, unknown>) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID]: {
              fiatPayment: {
                amountFiat,
              },
              isLoading: false,
              tokens,
            },
          },
        };
      }

      if (action === 'RampsController:getQuotes') {
        if (throwsOnRampsQuotes) {
          throw throwsOnRampsQuotes;
        }

        return rampsQuotes;
      }

      if (action === 'TransactionPayController:updateFiatPayment') {
        const { callback } = requestArg as unknown as {
          callback: (fiatPayment: TransactionFiatPayment) => void;
        };
        callback(capturedFiatPayment);
        return undefined;
      }

      throw new Error(`Unexpected action: ${action}`);
    },
  );

  return {
    callMock,
    capturedFiatPayment,
    request: {
      accountSupports7702: false,
      fiatPaymentMethod,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    },
  };
}

const FIAT_ASSET_CAIP_ID_MOCK = 'eip155:137/slip44:966';

describe('getFiatQuotes', () => {
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const computeRawFromFiatAmountMock = jest.mocked(computeRawFromFiatAmount);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    buildCaipAssetTypeMock.mockReturnValue(FIAT_ASSET_CAIP_ID_MOCK);
    deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);
    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '2',
    });
    getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'POL' });
    computeRawFromFiatAmountMock.mockReturnValue('5000000000000000000');
    getRelayQuotesMock.mockResolvedValue([getRelayQuoteMock()]);
  });

  it('returns combined fiat quote and calls ramps with adjusted amount', async () => {
    const { callMock, request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
      expect.objectContaining({
        from: WALLET_ADDRESS,
        isPostQuote: true,
        sourceChainId: FIAT_ASSET_MOCK.chainId,
        sourceTokenAddress: FIAT_ASSET_MOCK.address,
        sourceTokenAmount: '5000000000000000000',
        targetAmountMinimum: REQUIRED_TOKEN_MOCK.amountRaw,
        targetChainId: REQUIRED_TOKEN_MOCK.chainId,
        targetTokenAddress: REQUIRED_TOKEN_MOCK.address,
      }),
    ]);

    expect(callMock).toHaveBeenCalledWith(
      'RampsController:getQuotes',
      expect.objectContaining({
        amount: 20,
        assetId: FIAT_ASSET_CAIP_ID_MOCK,
        autoSelectProvider: true,
        fiat: 'USD',
        paymentMethods: ['/payments/debit-credit-card'],
        restrictToKnownOrNativeProviders: true,
        walletAddress: WALLET_ADDRESS,
      }),
    );

    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:updateFiatPayment',
      expect.objectContaining({
        callback: expect.any(Function),
        transactionId: TRANSACTION_ID,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe(TransactionPayStrategy.Fiat);
    // provider = relay(1) + ramps(0.7) = 1.7
    expect(result[0].fees.provider).toStrictEqual({ fiat: '1.7', usd: '1.7' });
    // providerFiat = ramps only (0.5 + 0.2 = 0.7)
    expect(result[0].fees.providerFiat).toStrictEqual({
      fiat: '0.7',
      usd: '0.7',
    });
    expect(result[0].fees.metaMask).toStrictEqual({
      fiat: '0.3',
      usd: '0.3',
    });
    expect(result[0].original).toStrictEqual({
      rampsQuote: FIAT_QUOTE_MOCK,
      relayQuote: {},
    });
  });

  it('returns empty array if amountFiat is missing', async () => {
    const { request } = getRequest({ amountFiat: '' });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if payment method is missing', async () => {
    const { request } = getRequest({ fiatPaymentMethod: '' });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if no required token is available', async () => {
    const { request } = getRequest({
      tokens: [{ ...REQUIRED_TOKEN_MOCK, skipIfBalance: true }],
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if tokens array is empty', async () => {
    const { request } = getRequest({
      tokens: [],
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if tokens are undefined in transaction data', async () => {
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID]: {
              fiatPayment: {
                amountFiat: '10',
              },
              isLoading: false,
            },
          },
        };
      }

      throw new Error(`Unexpected action: ${action}`);
    });

    const result = await getFiatQuotes({
      accountSupports7702: false,
      fiatPaymentMethod: '/payments/debit-credit-card',
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    });

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if source token fiat rate is missing', async () => {
    getTokenFiatRateMock.mockReturnValue(undefined);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if token info is unavailable', async () => {
    getTokenInfoMock.mockReturnValue(undefined);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if computeRawFromFiatAmount returns undefined', async () => {
    computeRawFromFiatAmountMock.mockReturnValue(undefined);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if source amount resolves to zero', async () => {
    computeRawFromFiatAmountMock.mockReturnValue(undefined);
    const { request } = getRequest({ amountFiat: '0' });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if relay quotes are unavailable', async () => {
    getRelayQuotesMock.mockResolvedValue([]);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('returns empty array if adjusted amount is non-positive', async () => {
    getRelayQuotesMock.mockResolvedValue([
      getRelayQuoteMock({
        metaMaskUsd: '0',
        providerUsd: '-20',
        sourceNetworkUsd: '0',
        targetNetworkUsd: '0',
      }),
    ]);
    const { callMock, request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(callMock).not.toHaveBeenCalledWith(
      'RampsController:getQuotes',
      expect.anything(),
    );
  });

  it('returns empty array if BigNumber adjusted amount is not finite', async () => {
    getRelayQuotesMock.mockResolvedValue([
      getRelayQuoteMock({
        metaMaskUsd: 'Infinity',
        providerUsd: '0',
        sourceNetworkUsd: '0',
        targetNetworkUsd: '0',
      }),
    ]);
    const { callMock, request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(callMock).not.toHaveBeenCalledWith(
      'RampsController:getQuotes',
      expect.anything(),
    );
  });

  it('returns empty array if adjusted amount overflows Number precision', async () => {
    getRelayQuotesMock.mockResolvedValue([
      getRelayQuoteMock({
        metaMaskUsd: '0',
        providerUsd: '1e309',
        sourceNetworkUsd: '0',
        targetNetworkUsd: '0',
      }),
    ]);
    const { callMock, request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(callMock).not.toHaveBeenCalledWith(
      'RampsController:getQuotes',
      expect.anything(),
    );
  });

  it('returns empty array if no quotes in success array', async () => {
    const { request } = getRequest({
      rampsQuotes: {
        customActions: [],
        error: [],
        sorted: [],
        success: [],
      },
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('handles ramps response without success property', async () => {
    const { request } = getRequest({
      rampsQuotes: {
        customActions: [],
        error: [],
        sorted: [],
      } as unknown as RampsQuotesResponse,
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('stores rampsQuote on fiat payment state via updateFiatPayment', async () => {
    const fiatPaymentState: TransactionFiatPayment = {};
    const callMock = jest.fn(
      (action: string, requestArg?: Record<string, unknown>) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [TRANSACTION_ID]: {
                fiatPayment: { amountFiat: '10' },
                isLoading: false,
                tokens: [REQUIRED_TOKEN_MOCK],
              },
            },
          };
        }

        if (action === 'RampsController:getQuotes') {
          return FIAT_QUOTES_RESPONSE_MOCK;
        }

        if (action === 'TransactionPayController:updateFiatPayment') {
          const { callback } = requestArg as unknown as {
            callback: (fp: TransactionFiatPayment) => void;
          };
          callback(fiatPaymentState);
          return undefined;
        }

        throw new Error(`Unexpected action: ${action}`);
      },
    );

    await getFiatQuotes({
      accountSupports7702: false,
      fiatPaymentMethod: '/payments/debit-credit-card',
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    });

    expect(fiatPaymentState.rampsQuote).toStrictEqual(FIAT_QUOTE_MOCK);
  });

  it('returns empty array if ramps quotes fetch throws', async () => {
    const { request } = getRequest({
      throwsOnRampsQuotes: new Error('ramps failed'),
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('returns empty array if multiple required tokens exist', async () => {
    const secondToken = {
      ...REQUIRED_TOKEN_MOCK,
      address: '0x3333333333333333333333333333333333333333' as Hex,
    };
    const { request } = getRequest({
      tokens: [REQUIRED_TOKEN_MOCK, secondToken],
    });

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('sets providerFiat fee to zero when ramps provider/network fees are missing', async () => {
    const quoteWithoutFees: RampsQuote = {
      provider: '/providers/transak-native-staging',
      quote: {
        amountIn: 20,
        amountOut: 5,
        paymentMethod: '/payments/debit-credit-card',
      },
    };
    const { request } = getRequest({
      rampsQuotes: {
        customActions: [],
        error: [],
        sorted: [],
        success: [quoteWithoutFees],
      },
    });

    const result = await getFiatQuotes(request);

    expect(result).toHaveLength(1);
    expect(result[0].fees.providerFiat).toStrictEqual({
      fiat: '0',
      usd: '0',
    });
    // provider = relay(1) + ramps(0) = 1
    expect(result[0].fees.provider).toStrictEqual({ fiat: '1', usd: '1' });
  });

  describe('quoteError surfacing', () => {
    it('sets quoteError with LIMIT_EXCEEDED code when provider error message contains "minimum"', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [
            {
              provider: '/providers/transak-native-staging',
              error: 'Minimum purchase is $20',
            },
          ],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'LIMIT_EXCEEDED',
          message: 'Minimum purchase is $20',
        },
      );
    });

    it('sets quoteError with LIMIT_EXCEEDED code when provider error message contains "maximum"', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [
            {
              provider: '/providers/transak-native-staging',
              error: 'Maximum purchase limit exceeded',
            },
          ],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'LIMIT_EXCEEDED',
          message: 'Maximum purchase limit exceeded',
        },
      );
    });

    it('sets quoteError with LIMIT_EXCEEDED code when provider error message contains "limit"', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [
            {
              provider: '/providers/transak-native-staging',
              error: 'Transaction limit reached for today',
            },
          ],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'LIMIT_EXCEEDED',
          message: 'Transaction limit reached for today',
        },
      );
    });

    it('sets quoteError with QUOTE_FAILED when provider error message does not match limit keywords', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [
            {
              provider: '/providers/transak-native-staging',
              error: 'Provider is temporarily unavailable',
            },
          ],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'QUOTE_FAILED',
          message: 'Provider is temporarily unavailable',
        },
      );
    });

    it('sets quoteError with QUOTE_FAILED and no message when error array is empty', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'QUOTE_FAILED',
          message: undefined,
        },
      );
    });

    it('sets quoteError with QUOTE_FAILED and no message when first error entry has no error field', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [{ provider: '/providers/transak-native-staging' }],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toStrictEqual<TransactionFiatQuoteError>(
        {
          code: 'QUOTE_FAILED',
          message: undefined,
        },
      );
    });

    it('clears quoteError on the fiat payment state when quote succeeds', async () => {
      const { capturedFiatPayment, request } = getRequest();

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError).toBeUndefined();
    });

    it('does not treat rate-related messages as LIMIT_EXCEEDED', async () => {
      const { capturedFiatPayment, request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [
            {
              provider: '/providers/transak-native-staging',
              error: 'Exchange rate request failed',
            },
          ],
          sorted: [],
          success: [],
        },
      });

      await getFiatQuotes(request);

      expect(capturedFiatPayment.quoteError?.code).toBe('QUOTE_FAILED');
    });
  });
});
