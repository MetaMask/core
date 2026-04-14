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
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../../types';
import { computeRawFromFiatAmount, getTokenFiatRate } from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import type { TransactionPayFiatAsset } from './constants';
import { getFiatQuotes } from './fiat-quotes';
import { deriveFiatAssetForFiatPayment, pickBestFiatQuote } from './utils';

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
  caipAssetId: 'eip155:137/slip44:966',
  chainId: '0x89',
  decimals: 18,
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
  request: PayStrategyGetQuotesRequest;
} {
  const callMock = jest.fn((action: string) => {
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

    throw new Error(`Unexpected action: ${action}`);
  });

  return {
    callMock,
    request: {
      fiatPaymentMethod,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    },
  };
}

describe('getFiatQuotes', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const computeRawFromFiatAmountMock = jest.mocked(computeRawFromFiatAmount);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const pickBestFiatQuoteMock = jest.mocked(pickBestFiatQuote);

  beforeEach(() => {
    jest.resetAllMocks();

    deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);
    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '2',
    });
    computeRawFromFiatAmountMock.mockReturnValue('5000000000000000000');
    getRelayQuotesMock.mockResolvedValue([getRelayQuoteMock()]);
    pickBestFiatQuoteMock.mockReturnValue(FIAT_QUOTE_MOCK);
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
        paymentMethods: ['/payments/debit-credit-card'],
        walletAddress: WALLET_ADDRESS,
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

    const request: PayStrategyGetQuotesRequest = {
      fiatPaymentMethod: '/payments/debit-credit-card',
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    };

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('returns empty array if fiat asset mapping is missing', async () => {
    deriveFiatAssetForFiatPaymentMock.mockReturnValue(undefined);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

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

  it('returns empty array if preferred fiat quote is missing', async () => {
    pickBestFiatQuoteMock.mockReturnValue(undefined);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toStrictEqual([]);
  });

  it('handles ramps response without success property', async () => {
    pickBestFiatQuoteMock.mockReturnValue(undefined);
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
    pickBestFiatQuoteMock.mockReturnValue({
      provider: '/providers/transak-native-staging',
      quote: {
        amountIn: 20,
        amountOut: 5,
        paymentMethod: '/payments/debit-credit-card',
      },
    } as RampsQuote);
    const { request } = getRequest();

    const result = await getFiatQuotes(request);

    expect(result).toHaveLength(1);
    expect(result[0].fees.providerFiat).toStrictEqual({
      fiat: '0',
      usd: '0',
    });
    // provider = relay(1) + ramps(0) = 1
    expect(result[0].fees.provider).toStrictEqual({ fiat: '1', usd: '1' });
  });
});
