import type {
  Quote as RampsQuote,
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';
import { buildCaipAssetType } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';
import type { TransactionPayFiatAsset } from './constants';
import { submitFiatQuotes } from './fiat-submit';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment, resolveSourceAmountRaw } from './utils';

jest.mock('./utils');
jest.mock('../../utils/token');
jest.mock('../../utils/transaction');
jest.mock('../relay/relay-quotes');
jest.mock('../relay/relay-submit');

const TRANSACTION_ID_MOCK = 'tx-id';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const ORDER_ID_MOCK = '/providers/transak/orders/order-123';

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: {
    from: WALLET_ADDRESS_MOCK,
  },
  type: TransactionType.predictDeposit,
} as TransactionMeta;

const FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  chainId: '0x89',
};

const FIAT_ASSET_CAIP_ID_MOCK = 'eip155:137/slip44:966';

const RAMPS_QUOTE_MOCK: RampsQuote = {
  provider: '/providers/transak-native-staging',
  quote: {
    amountIn: 20,
    amountOut: 5,
    paymentMethod: '/payments/debit-credit-card',
  },
};

const BASE_QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: WALLET_ADDRESS_MOCK,
  sourceBalanceRaw: '1000000000000000000',
  sourceChainId: '0x89',
  sourceTokenAddress: '0x0000000000000000000000000000000000001010',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '12000000',
  targetChainId: '0x89',
  targetTokenAddress: '0x2222222222222222222222222222222222222222',
};

const RELAY_QUOTE_RESULT_MOCK = {
  dust: { fiat: '0', usd: '0' },
  estimatedDuration: 1,
  fees: {
    metaMask: { fiat: '0', usd: '0' },
    provider: { fiat: '0', usd: '0' },
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
  original: {
    details: {
      currencyOut: { amount: '12000000' },
    },
  } as unknown as RelayQuote,
  request: BASE_QUOTE_REQUEST_MOCK,
  sourceAmount: {
    fiat: '0',
    human: '0',
    raw: '0',
    usd: '0',
  },
  strategy: TransactionPayStrategy.Relay,
  targetAmount: {
    fiat: '0',
    usd: '0',
  },
} as TransactionPayQuote<RelayQuote>;

function getFiatOrderMock({
  cryptoAmount = '1',
  cryptoCurrency,
  status = RampsOrderStatus.Completed,
}: {
  cryptoAmount?: RampsOrder['cryptoAmount'];
  cryptoCurrency?: RampsOrderCryptoCurrency;
  status?: RampsOrderStatus;
} = {}): RampsOrder {
  return {
    cryptoAmount,
    cryptoCurrency,
    status,
  } as RampsOrder;
}

function getFiatQuoteMock({
  request = BASE_QUOTE_REQUEST_MOCK,
}: {
  request?: QuoteRequest;
} = {}): TransactionPayQuote<FiatQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 1,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: '0', usd: '0' },
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
    original: {
      rampsQuote: RAMPS_QUOTE_MOCK,
      relayQuote: {
        details: {
          currencyOut: { amount: '12000000' },
        },
      } as unknown as RelayQuote,
    },
    request,
    sourceAmount: {
      fiat: '0',
      human: '0',
      raw: '0',
      usd: '0',
    },
    strategy: TransactionPayStrategy.Fiat,
    targetAmount: {
      fiat: '0',
      usd: '0',
    },
  };
}

function getRequest({
  orderId = ORDER_ID_MOCK,
  rampsQuote = RAMPS_QUOTE_MOCK,
  order = getFiatOrderMock(),
  quotes = [getFiatQuoteMock()],
  transaction = TRANSACTION_MOCK,
}: {
  orderId?: string;
  rampsQuote?: RampsQuote | undefined;
  order?: RampsOrder;
  quotes?: TransactionPayQuote<FiatQuote>[];
  transaction?: TransactionMeta;
} = {}): {
  callMock: jest.Mock;
  request: PayStrategyExecuteRequest<FiatQuote>;
} {
  const callMock = jest.fn((action: string) => {
    if (action === 'TransactionPayController:getState') {
      return {
        transactionData: {
          [transaction.id]: {
            fiatPayment: {
              orderId,
              rampsQuote,
            },
            isLoading: false,
            tokens: [],
          },
        },
      };
    }

    if (action === 'RampsController:getOrder') {
      return order;
    }

    throw new Error(`Unexpected action: ${action}`);
  });

  return {
    callMock,
    request: {
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes,
      transaction,
    },
  };
}

describe('submitFiatQuotes', () => {
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const resolveSourceAmountRawMock = jest.mocked(resolveSourceAmountRaw);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();

    buildCaipAssetTypeMock.mockReturnValue(FIAT_ASSET_CAIP_ID_MOCK);
    deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);
    resolveSourceAmountRawMock.mockResolvedValue('1000000000000000000');
    getRelayQuotesMock.mockResolvedValue([RELAY_QUOTE_RESULT_MOCK]);
    submitRelayQuotesMock.mockResolvedValue({
      transactionHash: '0x1234',
    });
  });

  it('polls completed fiat order then requotes and submits relay', async () => {
    const order = getFiatOrderMock({
      cryptoAmount: '1.2345',
      cryptoCurrency: {
        assetId: FIAT_ASSET_CAIP_ID_MOCK,
        chainId: 'eip155:137',
        symbol: 'POL',
      },
      status: RampsOrderStatus.Completed,
    });
    resolveSourceAmountRawMock.mockResolvedValue('1234500000000000000');
    const { callMock, request } = getRequest({ order });

    const result = await submitFiatQuotes(request);

    expect(callMock).toHaveBeenCalledWith(
      'RampsController:getOrder',
      'transak-native-staging',
      ORDER_ID_MOCK,
      WALLET_ADDRESS_MOCK,
    );
    expect(resolveSourceAmountRawMock).toHaveBeenCalledWith({
      messenger: expect.anything(),
      order,
      fiatAsset: FIAT_ASSET_MOCK,
    });
    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
      expect.objectContaining({
        isMaxAmount: true,
        isPostQuote: false,
        sourceBalanceRaw: '1234500000000000000',
        sourceTokenAmount: '1234500000000000000',
      }),
    ]);
    expect(
      getRelayQuotesMock.mock.calls[0][0].transaction.txParams.data,
    ).toBeUndefined();
    expect(
      getRelayQuotesMock.mock.calls[0][0].transaction.nestedTransactions,
    ).toBeUndefined();
    expect(submitRelayQuotesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [RELAY_QUOTE_RESULT_MOCK],
      }),
    );
    expect(result).toStrictEqual({ transactionHash: '0x1234' });
  });

  it('persists fiat order metadata on the transaction before polling', async () => {
    const { request } = getRequest();

    await submitFiatQuotes(request);

    expect(updateTransactionMock).toHaveBeenCalledWith(
      {
        transactionId: TRANSACTION_ID_MOCK,
        messenger: request.messenger,
        note: 'Persist fiat order metadata',
      },
      expect.any(Function),
    );

    const txDraft = { metamaskPay: undefined } as unknown as TransactionMeta;
    const updateFn = updateTransactionMock.mock.calls[0][1];
    updateFn(txDraft);

    expect(txDraft.metamaskPay).toStrictEqual({
      fiatOrderId: ORDER_ID_MOCK,
      fiatProvider: 'transak-native-staging',
    });
  });

  it('preserves existing metamaskPay fields when persisting fiat order metadata', async () => {
    const { request } = getRequest();

    await submitFiatQuotes(request);

    const txDraft = {
      metamaskPay: { totalFiat: '20.00' },
    } as unknown as TransactionMeta;
    const updateFn = updateTransactionMock.mock.calls[0][1];
    updateFn(txDraft);

    expect(txDraft.metamaskPay).toStrictEqual({
      totalFiat: '20.00',
      fiatOrderId: ORDER_ID_MOCK,
      fiatProvider: 'transak-native-staging',
    });
  });

  it('throws if wallet address is missing', async () => {
    const { request } = getRequest({
      transaction: {
        ...TRANSACTION_MOCK,
        txParams: {},
      } as TransactionMeta,
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing wallet address for fiat submission',
    );
  });

  it('throws if order ID is missing', async () => {
    const { request } = getRequest({ orderId: '' });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing order ID for fiat submission',
    );
  });

  it('throws if ramps quote is missing from fiat payment state', async () => {
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              fiatPayment: {
                orderId: ORDER_ID_MOCK,
              },
              isLoading: false,
              tokens: [],
            },
          },
        };
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    const request: PayStrategyExecuteRequest<FiatQuote> = {
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes: [getFiatQuoteMock()],
      transaction: TRANSACTION_MOCK,
    };

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing provider code for fiat submission',
    );
  });

  it('throws if provider string format is invalid', async () => {
    const { request } = getRequest({
      rampsQuote: { ...RAMPS_QUOTE_MOCK, provider: 'invalid' },
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing provider code for fiat submission',
    );
  });

  it('throws if fiat order status is failed', async () => {
    const { request } = getRequest({
      order: getFiatOrderMock({ status: RampsOrderStatus.Failed }),
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Fiat order failed',
    );
  });

  it('throws if fiat order status is cancelled', async () => {
    const { request } = getRequest({
      order: getFiatOrderMock({ status: RampsOrderStatus.Cancelled }),
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Fiat order cancelled',
    );
  });

  it('throws if fiat order status is id_expired', async () => {
    const { request } = getRequest({
      order: getFiatOrderMock({ status: RampsOrderStatus.IdExpired }),
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Fiat order id_expired',
    );
  });

  it('polls pending orders until completed', async () => {
    jest.useFakeTimers();

    const pendingOrder = getFiatOrderMock({ status: RampsOrderStatus.Pending });
    const completedOrder = getFiatOrderMock({
      cryptoAmount: '1',
      status: RampsOrderStatus.Completed,
    });

    let getOrderCallCount = 0;
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              fiatPayment: {
                orderId: ORDER_ID_MOCK,
                rampsQuote: RAMPS_QUOTE_MOCK,
              },
              isLoading: false,
              tokens: [],
            },
          },
        };
      }

      if (action === 'RampsController:getOrder') {
        getOrderCallCount += 1;
        return getOrderCallCount === 1 ? pendingOrder : completedOrder;
      }

      throw new Error(`Unexpected action: ${action}`);
    });

    const request: PayStrategyExecuteRequest<FiatQuote> = {
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes: [getFiatQuoteMock()],
      transaction: TRANSACTION_MOCK,
    };

    const promise = submitFiatQuotes(request);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toStrictEqual({ transactionHash: '0x1234' });
    expect(getOrderCallCount).toBe(2);
  });

  it('continues polling after transient getOrder error', async () => {
    jest.useFakeTimers();

    const completedOrder = getFiatOrderMock({
      cryptoAmount: '1',
      status: RampsOrderStatus.Completed,
    });

    let getOrderCallCount = 0;
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              fiatPayment: {
                orderId: ORDER_ID_MOCK,
                rampsQuote: RAMPS_QUOTE_MOCK,
              },
              isLoading: false,
              tokens: [],
            },
          },
        };
      }

      if (action === 'RampsController:getOrder') {
        getOrderCallCount += 1;
        if (getOrderCallCount === 1) {
          throw new Error('Network error');
        }
        return completedOrder;
      }

      throw new Error(`Unexpected action: ${action}`);
    });

    const request: PayStrategyExecuteRequest<FiatQuote> = {
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes: [getFiatQuoteMock()],
      transaction: TRANSACTION_MOCK,
    };

    const promise = submitFiatQuotes(request);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toStrictEqual({ transactionHash: '0x1234' });
    expect(getOrderCallCount).toBe(2);
  });

  it('throws if fiat order polling times out and includes last status', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(Number.MAX_SAFE_INTEGER);

    const pendingOrder = getFiatOrderMock({ status: RampsOrderStatus.Pending });
    const { request } = getRequest({ order: pendingOrder });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Fiat order polling timed out (last status: PENDING)',
    );

    dateNowSpy.mockRestore();
  });

  it('throws if token info is unavailable for the fiat asset', async () => {
    resolveSourceAmountRawMock.mockRejectedValue(
      new Error(
        `Unable to resolve token info for fiat asset ${FIAT_ASSET_MOCK.address} on chain ${FIAT_ASSET_MOCK.chainId}`,
      ),
    );
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      `Unable to resolve token info for fiat asset ${FIAT_ASSET_MOCK.address} on chain ${FIAT_ASSET_MOCK.chainId}`,
    );
  });

  it('throws if order asset id mismatches expected fiat asset', async () => {
    const { request } = getRequest({
      order: getFiatOrderMock({
        cryptoCurrency: {
          assetId: 'eip155:137/slip44:60',
          symbol: 'ETH',
        },
      }),
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      `Fiat order asset mismatch for transaction ${TRANSACTION_ID_MOCK}: expected ${FIAT_ASSET_CAIP_ID_MOCK.toLowerCase()}, got eip155:137/slip44:60`,
    );
  });

  it('throws if order chain mismatches expected fiat asset chain', async () => {
    const { request } = getRequest({
      order: getFiatOrderMock({
        cryptoCurrency: {
          chainId: 'eip155:1',
          symbol: 'POL',
        },
      }),
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      `Fiat order chain mismatch for transaction ${TRANSACTION_ID_MOCK}: expected eip155:137, got eip155:1`,
    );
  });

  it('throws if resolveSourceAmountRaw rejects', async () => {
    resolveSourceAmountRawMock.mockRejectedValue(
      new Error('Invalid fiat order crypto amount: 0'),
    );
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Invalid fiat order crypto amount: 0',
    );
  });

  it('throws if request has no fiat quotes', async () => {
    const { request } = getRequest();
    request.quotes = [];

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing fiat quote for relay submission',
    );
  });

  it('throws if request has multiple fiat quotes', async () => {
    const { request } = getRequest();
    request.quotes = [getFiatQuoteMock(), getFiatQuoteMock()];

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Multiple fiat quotes are not supported for submission',
    );
  });

  it('throws if resolveSourceAmountRaw throws for zero amount', async () => {
    resolveSourceAmountRawMock.mockRejectedValue(
      new Error('Computed fiat order source amount is not positive'),
    );
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Computed fiat order source amount is not positive',
    );
  });

  it('skips slippage check when original relay target amount is zero', async () => {
    const { request } = getRequest();
    request.quotes[0].original.relayQuote = {
      details: { currencyOut: { amount: '0' } },
    } as unknown as RelayQuote;

    const result = await submitFiatQuotes(request);

    expect(result).toStrictEqual({ transactionHash: '0x1234' });
  });

  it('throws if relay re-quote slippage exceeds threshold', async () => {
    getRelayQuotesMock.mockResolvedValue([
      {
        ...RELAY_QUOTE_RESULT_MOCK,
        original: {
          details: {
            currencyOut: { amount: '10000000' },
          },
        } as unknown as RelayQuote,
      },
    ]);
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      /Relay re-quote slippage too high/u,
    );
  });

  it('throws if relay re-quote returns no quotes', async () => {
    getRelayQuotesMock.mockResolvedValue([]);
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'No relay quotes returned for completed fiat order',
    );
  });

  it('throws if relay submit fails', async () => {
    submitRelayQuotesMock.mockRejectedValue(new Error('Relay submit failed'));
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Relay submit failed',
    );
  });
});
