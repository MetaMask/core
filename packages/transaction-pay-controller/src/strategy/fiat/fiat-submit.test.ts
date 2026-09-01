import type {
  Quote as RampsQuote,
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayFiatOptions,
  TransactionPayQuote,
} from '../../types.js';
import { buildCaipAssetType } from '../../utils/token.js';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import { submitRelayQuotes } from '../relay/relay-submit.js';
import type { RelayQuote } from '../relay/types.js';
import type { TransactionPayFiatAsset } from './constants.js';
import { MUSD_MONAD_FIAT_ASSET } from './constants.js';
import { submitFiatQuotes } from './fiat-submit.js';
import { fundFiatOrderFromTestSource } from './fiat-test-funding.js';
import type { FiatQuote } from './types.js';
import {
  deriveFiatAssetForFiatPayment,
  resolveSourceAmountRaw,
} from './utils.js';

jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  deriveFiatAssetForFiatPayment: jest.fn(),
  resolveSourceAmountRaw: jest.fn(),
}));
jest.mock('../../utils/token');
jest.mock('../../utils/transaction');
jest.mock('../relay/relay-quotes');
jest.mock('../relay/relay-submit');
jest.mock('./fiat-test-funding');

const TRANSACTION_ID_MOCK = 'tx-id';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const ORDER_ID_MOCK = '/providers/transak/orders/order-123';
const FIAT_TEST_FUNDING_SOURCE_MOCK =
  '0x3333333333333333333333333333333333333333' as Hex;

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
      currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
      currencyOut: {
        amount: '12000000',
        amountUsd: '4.85',
        minimumAmount: '11900000',
      },
      totalImpact: { usd: '-0.15' },
    },
    metamask: { isExecute: true },
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
  includeRelayQuote = true,
  relayQuote = {
    details: {
      currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
      currencyOut: {
        amount: '12000000',
        amountUsd: '4.85',
        minimumAmount: '11900000',
      },
      totalImpact: { usd: '-0.15' },
    },
    metamask: { isExecute: true },
  } as unknown as RelayQuote,
  request = BASE_QUOTE_REQUEST_MOCK,
}: {
  includeRelayQuote?: boolean;
  relayQuote?: RelayQuote;
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
      relayQuote: includeRelayQuote ? relayQuote : undefined,
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
  fiatOptionsError,
  fiatOptions,
  orderId = ORDER_ID_MOCK,
  rampsQuote = RAMPS_QUOTE_MOCK,
  order = getFiatOrderMock(),
  quotes = [getFiatQuoteMock()],
  transaction = TRANSACTION_MOCK,
}: {
  fiatOptionsError?: Error;
  fiatOptions?: TransactionPayFiatOptions;
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

    if (action === 'KeyringController:getState') {
      return { isUnlocked: true };
    }

    if (action === 'TransactionPayController:getFiatOptions') {
      if (fiatOptionsError) {
        throw fiatOptionsError;
      }

      return fiatOptions;
    }

    if (action === 'RampsController:getOrder') {
      return order;
    }

    if (action === 'TransactionPayController:getAmountData') {
      return Promise.resolve({
        updates: [
          { nestedTransactionIndex: 0, data: '0xapprove' },
          { nestedTransactionIndex: 1, data: '0xdeposit' },
        ],
      });
    }

    if (action === 'TransactionController:addTransactionBatch') {
      return Promise.resolve({ batchId: 'direct-batch' });
    }

    if (action === 'NetworkController:findNetworkClientIdByChainId') {
      return 'network-client-id-mock';
    }

    if (action === 'RemoteFeatureFlagController:getState') {
      return { remoteFeatureFlags: {} };
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
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getTransactionMock = jest.mocked(getTransaction);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
  const fundFiatOrderFromTestSourceMock = jest.mocked(
    fundFiatOrderFromTestSource,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();

    buildCaipAssetTypeMock.mockReturnValue(FIAT_ASSET_CAIP_ID_MOCK);
    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, onTransaction) => {
        onTransaction('direct-child-1');
        onTransaction('direct-child-2');

        return { end: jest.fn() };
      },
    );
    getTransactionMock.mockImplementation((transactionId) =>
      transactionId === 'direct-child-2'
        ? ({ hash: '0xdirect' } as TransactionMeta)
        : undefined,
    );
    waitForTransactionConfirmedMock.mockResolvedValue();
    deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);
    resolveSourceAmountRawMock.mockResolvedValue({
      amountRaw: '1000000000000000000',
      fromBlock: undefined,
    });
    fundFiatOrderFromTestSourceMock.mockResolvedValue(
      getFiatOrderMock({
        cryptoAmount: '1',
        cryptoCurrency: {
          assetId: FIAT_ASSET_CAIP_ID_MOCK,
          chainId: 'eip155:137',
          symbol: 'POL',
        },
      }),
    );
    getRelayQuotesMock.mockResolvedValue([RELAY_QUOTE_RESULT_MOCK]);
    submitRelayQuotesMock.mockResolvedValue({
      transactionHash: '0x1234',
    });
  });

  it('polls completed fiat order then submits single EXACT_INPUT relay for simple deposits', async () => {
    const order = getFiatOrderMock({
      cryptoAmount: '1.2345',
      cryptoCurrency: {
        assetId: FIAT_ASSET_CAIP_ID_MOCK,
        chainId: 'eip155:137',
        symbol: 'POL',
      },
      status: RampsOrderStatus.Completed,
    });
    resolveSourceAmountRawMock.mockResolvedValue({
      amountRaw: '1234500000000000000',
      fromBlock: undefined,
    });
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
      walletAddress: WALLET_ADDRESS_MOCK,
    });
    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
      expect.objectContaining({
        isMaxAmount: false,
        isPostQuote: true,
        skipProcessTransactions: false,
        sourceBalanceRaw: '1234500000000000000',
        sourceTokenAmount: '1234500000000000000',
      }),
    ]);
    expect(submitRelayQuotesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [RELAY_QUOTE_RESULT_MOCK],
      }),
    );
    expect(result).toStrictEqual({ transactionHash: '0x1234' });
  });

  it('waits for keyring unlock before submitting the post-ramp leg', async () => {
    let unlockHandler: (() => void) | undefined;

    const order = getFiatOrderMock({
      cryptoAmount: '1.2345',
      cryptoCurrency: {
        assetId: FIAT_ASSET_CAIP_ID_MOCK,
        chainId: 'eip155:137',
        symbol: 'POL',
      },
      status: RampsOrderStatus.Completed,
    });
    resolveSourceAmountRawMock.mockResolvedValue({
      amountRaw: '1234500000000000000',
      fromBlock: undefined,
    });

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
      if (action === 'KeyringController:getState') {
        return { isUnlocked: false };
      }
      if (action === 'TransactionPayController:getFiatOptions') {
        return undefined;
      }
      if (action === 'RampsController:getOrder') {
        return order;
      }
      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    const subscribeMock = jest.fn((_event: string, handler: () => void) => {
      unlockHandler = handler;
    });

    const unsubscribeMock = jest.fn();

    const request: PayStrategyExecuteRequest<FiatQuote> = {
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
        subscribe: subscribeMock,
        unsubscribe: unsubscribeMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes: [getFiatQuoteMock()],
      transaction: TRANSACTION_MOCK,
    };

    const submitPromise = submitFiatQuotes(request);

    // Flush microtasks until waitForKeyringUnlock subscribes (order polling
    // resolves in one tick; submitRelayAfterFiatCompletion starts in the next)
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    // Relay must not have been called yet — still waiting for unlock
    expect(submitRelayQuotesMock).not.toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledWith(
      'KeyringController:unlock',
      expect.any(Function),
    );

    // Simulate the user unlocking the wallet
    unlockHandler?.();

    const result = await submitPromise;

    expect(unsubscribeMock).toHaveBeenCalledWith(
      'KeyringController:unlock',
      expect.any(Function),
    );
    expect(submitRelayQuotesMock).toHaveBeenCalled();
    expect(result).toStrictEqual({ transactionHash: '0x1234' });
  });

  it('uses fiat test funding source instead of polling ramps order', async () => {
    const fiatOptions = { testFundingSource: FIAT_TEST_FUNDING_SOURCE_MOCK };
    const { callMock, request } = getRequest({ fiatOptions });

    await submitFiatQuotes(request);

    expect(fundFiatOrderFromTestSourceMock).toHaveBeenCalledWith({
      fiat: fiatOptions,
      messenger: request.messenger,
      quote: request.quotes[0],
      transaction: request.transaction,
    });
    expect(
      callMock.mock.calls.some(
        ([action]: [string]) => action === 'RampsController:getOrder',
      ),
    ).toBe(false);
    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('polls ramps order if retrieving fiat options fails', async () => {
    const { callMock, request } = getRequest({
      fiatOptionsError: new Error('No handler'),
    });

    await submitFiatQuotes(request);

    expect(fundFiatOrderFromTestSourceMock).not.toHaveBeenCalled();
    expect(callMock).toHaveBeenCalledWith(
      'RampsController:getOrder',
      'transak-native-staging',
      ORDER_ID_MOCK,
      WALLET_ADDRESS_MOCK,
    );
    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('uses three-phase flow with discovery and delegation for nested calldata transactions', async () => {
    const nestedTransaction = {
      ...TRANSACTION_MOCK,
      nestedTransactions: [
        { to: '0xaaa' as Hex, data: '0x1111' as Hex },
        { to: '0xbbb' as Hex, data: '0x2222' as Hex },
      ],
    } as unknown as TransactionMeta;

    resolveSourceAmountRawMock.mockResolvedValue({
      amountRaw: '1234500000000000000',
      fromBlock: undefined,
    });

    const { callMock, request } = getRequest({
      transaction: nestedTransaction,
    });

    callMock.mockImplementation((action: string) => {
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
      if (action === 'KeyringController:getState') {
        return { isUnlocked: true };
      }
      if (action === 'TransactionPayController:getFiatOptions') {
        return undefined;
      }
      if (action === 'RampsController:getOrder') {
        return getFiatOrderMock();
      }
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [
            { nestedTransactionIndex: 0, data: '0xNewApprove' },
            { nestedTransactionIndex: 1, data: '0xNewDeposit' },
          ],
        });
      }
      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    const result = await submitFiatQuotes(request);

    expect(getRelayQuotesMock).toHaveBeenCalledTimes(2);
    expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
      expect.objectContaining({
        isMaxAmount: false,
        isPostQuote: true,
        sourceBalanceRaw: '1234500000000000000',
        sourceTokenAmount: '1198500000000000000',
      }),
    ]);
    expect(getRelayQuotesMock.mock.calls[1][0].requests).toStrictEqual([
      expect.objectContaining({
        isMaxAmount: false,
        isPostQuote: false,
        sourceBalanceRaw: '1234500000000000000',
        sourceTokenAmount: '1234500000000000000',
        targetAmountMinimum: '12268041',
      }),
    ]);
    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:getAmountData',
      expect.objectContaining({ amount: '12268041' }),
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
      fiat: { orderId: ORDER_ID_MOCK, provider: 'transak-native-staging' },
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
      fiat: { orderId: ORDER_ID_MOCK, provider: 'transak-native-staging' },
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
      'Missing wallet address',
    );
  });

  it('throws if order ID is missing', async () => {
    const { request } = getRequest({ orderId: '' });

    await expect(submitFiatQuotes(request)).rejects.toThrow('Missing order ID');
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
      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
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
      'Missing provider code',
    );
  });

  it('throws if provider string format is invalid', async () => {
    const { request } = getRequest({
      rampsQuote: { ...RAMPS_QUOTE_MOCK, provider: '/unexpected/path' },
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing provider code',
    );
  });

  it('throws if the legacy providers path prefix has no provider code', async () => {
    const { request } = getRequest({
      rampsQuote: { ...RAMPS_QUOTE_MOCK, provider: '/providers' },
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Missing provider code',
    );
  });

  it('accepts the canonical provider code without the legacy providers path prefix', async () => {
    const { callMock, request } = getRequest({
      rampsQuote: { ...RAMPS_QUOTE_MOCK, provider: 'transak-native-staging' },
    });

    await submitFiatQuotes(request);

    expect(callMock).toHaveBeenCalledWith(
      'RampsController:getOrder',
      'transak-native-staging',
      ORDER_ID_MOCK,
      WALLET_ADDRESS_MOCK,
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

      if (action === 'KeyringController:getState') {
        return { isUnlocked: true };
      }

      if (action === 'TransactionPayController:getFiatOptions') {
        return undefined;
      }

      if (action === 'RampsController:getOrder') {
        getOrderCallCount += 1;
        return getOrderCallCount === 1 ? pendingOrder : completedOrder;
      }

      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({ updates: [] });
      }

      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
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

      if (action === 'KeyringController:getState') {
        return { isUnlocked: true };
      }

      if (action === 'TransactionPayController:getFiatOptions') {
        return undefined;
      }

      if (action === 'RampsController:getOrder') {
        getOrderCallCount += 1;
        if (getOrderCallCount === 1) {
          throw new Error('Network error');
        }
        return completedOrder;
      }

      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({ updates: [] });
      }

      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
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

  it('uses configurable poll timeout from feature flag', async () => {
    const customTimeoutMs = 30000;

    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(customTimeoutMs);

    const pendingOrder = getFiatOrderMock({ status: RampsOrderStatus.Pending });
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
      if (action === 'TransactionPayController:getFiatOptions') {
        return undefined;
      }
      if (action === 'RampsController:getOrder') {
        return pendingOrder;
      }
      if (action === 'RemoteFeatureFlagController:getState') {
        return {
          remoteFeatureFlags: {
            confirmations_pay_fiat: { orderPollTimeoutMs: customTimeoutMs },
          },
        };
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    const request: PayStrategyExecuteRequest<FiatQuote> = {
      accountSupports7702: false,
      isSmartTransaction: () => false,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
      quotes: [getFiatQuoteMock()],
      transaction: TRANSACTION_MOCK,
    };

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
      `Post-Ramp: Unable to resolve token info for fiat asset ${FIAT_ASSET_MOCK.address} on chain ${FIAT_ASSET_MOCK.chainId}`,
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
      `Post-Ramp: Order asset mismatch for transaction ${TRANSACTION_ID_MOCK}: expected ${FIAT_ASSET_CAIP_ID_MOCK.toLowerCase()}, got eip155:137/slip44:60`,
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
      `Post-Ramp: Order chain mismatch for transaction ${TRANSACTION_ID_MOCK}: expected eip155:137, got eip155:1`,
    );
  });

  it('throws if resolveSourceAmountRaw rejects', async () => {
    resolveSourceAmountRawMock.mockRejectedValue(
      new Error('Invalid fiat order crypto amount: 0'),
    );
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Post-Ramp: Invalid fiat order crypto amount: 0',
    );
  });

  it('throws if request has no fiat quotes', async () => {
    const { request } = getRequest();
    request.quotes = [];

    await expect(submitFiatQuotes(request)).rejects.toThrow('Missing quote');
  });

  it('throws if request has multiple fiat quotes', async () => {
    const { request } = getRequest();
    request.quotes = [getFiatQuoteMock(), getFiatQuoteMock()];

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Post-Ramp: Multiple fiat quotes are not supported for submission',
    );
  });

  it('throws if non-direct fiat quote is missing a Relay quote', async () => {
    const { request } = getRequest({
      quotes: [getFiatQuoteMock({ includeRelayQuote: false })],
    });

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Post-Ramp: Missing Relay quote',
    );
  });

  it('throws if resolveSourceAmountRaw throws for zero amount', async () => {
    resolveSourceAmountRawMock.mockRejectedValue(
      new Error('Computed fiat order source amount is not positive'),
    );
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Post-Ramp: Computed fiat order source amount is not positive',
    );
  });

  it('throws if post-Ramp submission returns no transaction hash', async () => {
    submitRelayQuotesMock.mockResolvedValue({ transactionHash: undefined });
    const { request } = getRequest();

    await expect(submitFiatQuotes(request)).rejects.toThrow(
      'Post-Ramp: Missing transaction hash',
    );
  });

  describe('direct mUSD to money account flow', () => {
    const MONEY_ACCOUNT_ADDRESS =
      '0x3333333333333333333333333333333333333333' as Hex;

    const MUSD_QUOTE_REQUEST: QuoteRequest = {
      from: WALLET_ADDRESS_MOCK,
      isDirectMusdMoneyAccount: true,
      sourceBalanceRaw: '10000000',
      sourceChainId: MUSD_MONAD_FIAT_ASSET.chainId,
      sourceTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
      sourceTokenAmount: '10000000',
      targetAmountMinimum: '10000000',
      targetChainId: MUSD_MONAD_FIAT_ASSET.chainId,
      targetTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
    };

    const MUSD_TRANSACTION_MOCK = {
      id: TRANSACTION_ID_MOCK,
      nestedTransactions: [
        { data: '0xoldApprove' as Hex, to: '0xapprove' as Hex },
        { data: '0xoldDeposit' as Hex, to: '0xdeposit' as Hex },
      ],
      txParams: { from: MONEY_ACCOUNT_ADDRESS },
      type: 'batch',
    } as TransactionMeta;

    it('uses txParams.from as walletAddress when quote is direct mUSD', async () => {
      const order = getFiatOrderMock({
        status: RampsOrderStatus.Completed,
      });
      const { callMock, request } = getRequest({
        order,
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: MUSD_TRANSACTION_MOCK,
      });

      await submitFiatQuotes(request);

      const getOrderCall = callMock.mock.calls.find(
        ([action]: [string]) => action === 'RampsController:getOrder',
      );
      expect(getOrderCall?.[3]).toBe(MONEY_ACCOUNT_ADDRESS);
    });

    it('uses MUSD_MONAD_FIAT_ASSET for order validation when quote is direct mUSD', async () => {
      const order = getFiatOrderMock({
        cryptoCurrency: {
          assetId:
            'eip155:143/erc20:0xaca92e438df0b2401ff60da7e4337b687a2435da',
          chainId: 'eip155:143',
          symbol: 'MUSD',
        },
        status: RampsOrderStatus.Completed,
      });
      buildCaipAssetTypeMock.mockReturnValue(
        'eip155:143/erc20:0xaca92e438df0b2401ff60da7e4337b687a2435da',
      );
      const { request } = getRequest({
        order,
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: MUSD_TRANSACTION_MOCK,
      });

      await submitFiatQuotes(request);
      expect(deriveFiatAssetForFiatPaymentMock).not.toHaveBeenCalled();
    });

    it('submits a sponsored Money Account vault batch for direct pure-fiat mUSD', async () => {
      const { callMock, request } = getRequest({
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: {
          ...MUSD_TRANSACTION_MOCK,
          nestedTransactions: [
            { data: '0xapprove' as Hex, to: '0xapprove' as Hex },
            { data: '0xdeposit' as Hex, to: '0xdeposit' as Hex },
          ],
        } as TransactionMeta,
      });

      const result = await submitFiatQuotes(request);

      expect(getRelayQuotesMock).not.toHaveBeenCalled();
      expect(submitRelayQuotesMock).not.toHaveBeenCalled();
      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getAmountData',
        expect.objectContaining({
          amount: '1000000000000000000',
          transaction: expect.objectContaining({ id: TRANSACTION_ID_MOCK }),
        }),
      );
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Money Account vault deposit: update vault amount',
          transactionId: TRANSACTION_ID_MOCK,
        }),
        expect.any(Function),
      );
      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({
          from: MONEY_ACCOUNT_ADDRESS,
          isGasFeeSponsored: true,
          isInternal: true,
          networkClientId: 'network-client-id-mock',
          origin: 'metamask',
          requireApproval: false,
          transactions: [
            {
              params: { data: '0xapprove', to: '0xapprove', value: '0x0' },
              type: TransactionType.tokenMethodApprove,
            },
            {
              params: { data: '0xdeposit', to: '0xdeposit', value: '0x0' },
              type: TransactionType.contractInteraction,
            },
          ],
        }),
      );
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Add required transaction ID from Money Account vault submission',
          transactionId: TRANSACTION_ID_MOCK,
        }),
        expect.any(Function),
      );
      expect(result).toStrictEqual({ transactionHash: '0xdirect' });
      expect(
        callMock.mock.calls.some(
          ([action]: [string]) =>
            action === 'TransactionPayController:getPaymentOverrideData',
        ),
      ).toBe(false);
    });

    it('prefixes direct mUSD vault errors', async () => {
      getTransactionMock.mockImplementation((transactionId) =>
        transactionId === TRANSACTION_ID_MOCK
          ? MUSD_TRANSACTION_MOCK
          : undefined,
      );
      const { request } = getRequest({
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: MUSD_TRANSACTION_MOCK,
      });

      await expect(submitFiatQuotes(request)).rejects.toThrow(
        'Post-Ramp: Direct mUSD: Missing transaction hash',
      );
    });

    it('prefixes direct mUSD addTransactionBatch errors as Vault errors', async () => {
      const { callMock, request } = getRequest({
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: MUSD_TRANSACTION_MOCK,
      });

      callMock.mockImplementation((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [MUSD_TRANSACTION_MOCK.id]: {
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

        if (action === 'KeyringController:getState') {
          return { isUnlocked: true };
        }

        if (action === 'TransactionPayController:getFiatOptions') {
          return undefined;
        }

        if (action === 'RampsController:getOrder') {
          return getFiatOrderMock();
        }

        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ nestedTransactionIndex: 0, data: '0xapprove' }],
          });
        }

        if (action === 'NetworkController:findNetworkClientIdByChainId') {
          return 'network-client-id-mock';
        }

        if (action === 'TransactionController:addTransactionBatch') {
          throw new Error('batch failed');
        }

        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      await expect(submitFiatQuotes(request)).rejects.toThrow(
        'Post-Ramp: Direct mUSD: Vault: batch failed',
      );
    });

    it('skips the vault batch and returns an empty hash when vaultDisabled is enabled', async () => {
      const { callMock, request } = getRequest({
        quotes: [
          getFiatQuoteMock({
            includeRelayQuote: false,
            request: MUSD_QUOTE_REQUEST,
          }),
        ],
        transaction: MUSD_TRANSACTION_MOCK,
      });

      callMock.mockImplementation((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [MUSD_TRANSACTION_MOCK.id]: {
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

        if (action === 'KeyringController:getState') {
          return { isUnlocked: true };
        }

        if (action === 'TransactionPayController:getFiatOptions') {
          return undefined;
        }

        if (action === 'RampsController:getOrder') {
          return getFiatOrderMock();
        }

        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              confirmations_pay_fiat: { vaultDisabled: true },
            },
          };
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      const result = await submitFiatQuotes(request);

      expect(result).toStrictEqual({ transactionHash: '0x' });
      expect(callMock).not.toHaveBeenCalledWith(
        'TransactionPayController:getAmountData',
        expect.anything(),
      );
      expect(callMock).not.toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.anything(),
      );
      expect(updateTransactionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Add required transaction ID from Money Account vault submission',
        }),
        expect.any(Function),
      );
    });

    it('falls back to deriveFiatAssetForFiatPayment when quote is not direct mUSD', async () => {
      const order = getFiatOrderMock({
        cryptoCurrency: {
          assetId: FIAT_ASSET_CAIP_ID_MOCK,
          chainId: 'eip155:137',
          symbol: 'POL',
        },
        status: RampsOrderStatus.Completed,
      });
      const { request } = getRequest({ order });

      await submitFiatQuotes(request);

      expect(deriveFiatAssetForFiatPaymentMock).toHaveBeenCalledTimes(1);
    });
  });
});
