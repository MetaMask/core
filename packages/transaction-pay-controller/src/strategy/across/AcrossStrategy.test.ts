import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { ARBITRUM_USDC_ADDRESS, CHAIN_ID_ARBITRUM } from '../../constants.js';
import type {
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getAcrossQuotes } from './across-quotes.js';
import { submitAcrossQuotes } from './across-submit.js';
import { AcrossStrategy } from './AcrossStrategy.js';
import type { AcrossQuote } from './types.js';

jest.mock('./across-quotes');
jest.mock('./across-submit');
jest.mock('../../utils/feature-flags');

describe('AcrossStrategy', () => {
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);
  const getAcrossQuotesMock = jest.mocked(getAcrossQuotes);
  const submitAcrossQuotesMock = jest.mocked(submitAcrossQuotes);

  const messenger = {} as never;

  const TRANSACTION_META_MOCK = {
    id: 'tx-1',
    chainId: '0x1',
    networkClientId: 'mainnet',
    status: TransactionStatus.unapproved,
    time: Date.now(),
    txParams: {
      from: '0xabc',
    },
  } as TransactionMeta;

  const baseRequest = {
    messenger,
    transaction: TRANSACTION_META_MOCK,
    requests: [
      {
        from: '0xabc' as Hex,
        sourceBalanceRaw: '100',
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
        sourceTokenAmount: '100',
        targetAmountMinimum: '100',
        targetChainId: '0x2' as Hex,
        targetTokenAddress: '0xdef' as Hex,
      },
    ],
  } as PayStrategyGetQuotesRequest;

  const quoteWithAuthorizationList = {
    request: {
      ...baseRequest.requests[0],
    },
    original: {
      metamask: {
        gasLimits: [],
        is7702: true,
        requiresAuthorizationList: true,
      },
      quote: {},
      request: {
        actions: [],
        amount: '100',
        tradeType: 'exactInput',
      },
    },
  } as TransactionPayQuote<AcrossQuote>;

  beforeEach(() => {
    jest.resetAllMocks();
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        apiBase: 'https://across.test',
        enabled: true,
        fallbackGas: {
          estimate: 900000,
          max: 1500000,
        },
      },
      relay: {
        enabled: true,
      },
    });
  });

  it('returns false when across is disabled', () => {
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        apiBase: 'https://across.test',
        enabled: false,
        fallbackGas: {
          estimate: 900000,
          max: 1500000,
        },
      },
      relay: {
        enabled: true,
      },
    });

    const strategy = new AcrossStrategy();
    expect(strategy.supports(baseRequest)).toBe(false);
  });

  it('returns true for supported perps direct deposits', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        } as TransactionMeta,
        requests: [
          {
            from: '0xabc' as Hex,
            sourceBalanceRaw: '100',
            sourceChainId: CHAIN_ID_ARBITRUM,
            sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
            sourceTokenAmount: '100',
            targetAmountMinimum: '100',
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS,
          },
        ],
      }),
    ).toBe(true);
  });

  it('ignores synthetic gas legs for supported perps direct deposits', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        } as TransactionMeta,
        requests: [
          {
            from: '0xabc' as Hex,
            sourceBalanceRaw: '100',
            sourceChainId: CHAIN_ID_ARBITRUM,
            sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
            sourceTokenAmount: '100',
            targetAmountMinimum: '100',
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS,
          },
          {
            from: '0xabc' as Hex,
            sourceBalanceRaw: '100',
            sourceChainId: CHAIN_ID_ARBITRUM,
            sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
            sourceTokenAmount: '100',
            targetAmountMinimum: '0',
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress:
              '0x0000000000000000000000000000000000000000' as Hex,
          },
        ],
      }),
    ).toBe(true);
  });

  it('returns false when all requests are synthetic zero-minimum legs', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        requests: [
          {
            from: '0xabc' as Hex,
            sourceBalanceRaw: '100',
            sourceChainId: CHAIN_ID_ARBITRUM,
            sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
            sourceTokenAmount: '100',
            targetAmountMinimum: '0',
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress:
              '0x0000000000000000000000000000000000000000' as Hex,
          },
        ],
      }),
    ).toBe(false);
  });

  it('treats max-amount requests as actionable even with zero minimums', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        requests: [
          {
            from: '0xabc' as Hex,
            isMaxAmount: true,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1' as Hex,
            sourceTokenAddress: '0xabc' as Hex,
            sourceTokenAmount: '100',
            targetAmountMinimum: '0',
            targetChainId: '0x2' as Hex,
            targetTokenAddress: '0xdef' as Hex,
          },
        ],
      }),
    ).toBe(true);
  });

  it('supports post-quote predict withdraw requests with source-chain authorization lists', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [{ type: TransactionType.predictWithdraw }],
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: [{ address: '0xabc' as Hex }],
            data: '0x12345678' as Hex,
            to: '0xdef' as Hex,
          },
        } as TransactionMeta,
        requests: [
          {
            from: '0xabc' as Hex,
            isPostQuote: true,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1' as Hex,
            sourceTokenAddress: '0xabc' as Hex,
            sourceTokenAmount: '100',
            targetAmountMinimum: '0',
            targetChainId: '0x2' as Hex,
            targetTokenAddress: '0xdef' as Hex,
          },
        ],
      }),
    ).toBe(true);
  });

  it('does not support post-quote requests outside predict withdraw', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        requests: [
          {
            from: '0xabc' as Hex,
            isPostQuote: true,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1' as Hex,
            sourceTokenAddress: '0xabc' as Hex,
            sourceTokenAmount: '100',
            targetAmountMinimum: '0',
            targetChainId: '0x2' as Hex,
            targetTokenAddress: '0xdef' as Hex,
          },
        ],
      }),
    ).toBe(false);
  });

  it('returns false for unsupported perps deposits', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        } as TransactionMeta,
      }),
    ).toBe(false);
  });

  it('applies generic cross-chain handling to perps across deposits', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsAcrossDeposit,
        } as TransactionMeta,
      }),
    ).toBe(true);
  });

  it('returns false for same-chain swaps', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        requests: [
          {
            from: '0xabc' as Hex,
            sourceBalanceRaw: '100',
            sourceChainId: '0x1' as Hex,
            sourceTokenAddress: '0xabc' as Hex,
            sourceTokenAmount: '100',
            targetAmountMinimum: '100',
            targetChainId: '0x1' as Hex,
            targetTokenAddress: '0xdef' as Hex,
          },
        ],
      }),
    ).toBe(false);
  });

  it('returns false when the transaction has an authorization list', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: [{ address: '0xabc' as Hex }],
          },
        } as TransactionMeta,
      }),
    ).toBe(false);
  });

  it('does not support authorization lists during request support checks', () => {
    const strategy = new AcrossStrategy();
    const result = strategy.supports({
      ...baseRequest,
      transaction: {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          authorizationList: [{ address: '0xabc' as Hex }],
        },
      } as TransactionMeta,
    });

    expect(result).toBe(false);
  });

  it('does not support quotes that require first-time 7702 upgrades', () => {
    const strategy = new AcrossStrategy();
    const quote = {
      original: {
        metamask: {
          gasLimits: [],
          is7702: true,
          requiresAuthorizationList: true,
        },
      },
    } as TransactionPayQuote<AcrossQuote>;

    const result = strategy.checkQuoteSupport({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result).toBe(false);
  });

  it('supports source 7702 authorization lists for Predict withdraw post-quote quotes without Across actions', () => {
    const strategy = new AcrossStrategy();
    const request = {
      messenger,
      quotes: [
        {
          ...quoteWithAuthorizationList,
          request: {
            ...quoteWithAuthorizationList.request,
            isPostQuote: true,
          },
        },
      ],
      transaction: {
        ...TRANSACTION_META_MOCK,
        type: TransactionType.predictWithdraw,
      } as TransactionMeta,
    } as PayStrategyCheckQuoteSupportRequest<AcrossQuote>;

    expect(strategy.checkQuoteSupport(request)).toBe(true);
  });

  it('does not support first-time 7702 authorization lists for non-post-quote Across quotes', () => {
    const strategy = new AcrossStrategy();
    const request = {
      messenger,
      quotes: [quoteWithAuthorizationList],
      transaction: {
        ...TRANSACTION_META_MOCK,
        type: TransactionType.predictWithdraw,
      } as TransactionMeta,
    } as PayStrategyCheckQuoteSupportRequest<AcrossQuote>;

    expect(strategy.checkQuoteSupport(request)).toBe(false);
  });

  it('does not support first-time 7702 authorization lists when the Across quote has embedded destination actions', () => {
    const strategy = new AcrossStrategy();
    const request = {
      messenger,
      quotes: [
        {
          ...quoteWithAuthorizationList,
          request: {
            ...quoteWithAuthorizationList.request,
            isPostQuote: true,
          },
          original: {
            ...quoteWithAuthorizationList.original,
            request: {
              ...quoteWithAuthorizationList.original.request,
              actions: [
                {
                  args: [],
                  functionSignature: 'function transfer(address,uint256)',
                  isNativeTransfer: false,
                  target: '0xdef' as Hex,
                  value: '0',
                },
              ],
            },
          },
        },
      ],
      transaction: {
        ...TRANSACTION_META_MOCK,
        type: TransactionType.predictWithdraw,
      } as TransactionMeta,
    } as PayStrategyCheckQuoteSupportRequest<AcrossQuote>;

    expect(strategy.checkQuoteSupport(request)).toBe(false);
  });

  it('supports 7702 quotes that do not require an authorization list', () => {
    const strategy = new AcrossStrategy();
    const quote = {
      original: {
        metamask: {
          gasLimits: [],
          is7702: true,
        },
      },
    } as TransactionPayQuote<AcrossQuote>;

    expect(
      strategy.checkQuoteSupport({
        messenger,
        quotes: [quote],
        transaction: TRANSACTION_META_MOCK,
      }),
    ).toBe(true);
  });

  it('returns false for unsupported destination actions', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            data: '0x12345678' as Hex,
            to: '0xdef' as Hex,
          },
        } as TransactionMeta,
      }),
    ).toBe(false);
  });

  it('returns true when all requests are cross-chain', () => {
    const strategy = new AcrossStrategy();
    expect(strategy.supports(baseRequest)).toBe(true);
  });

  it('delegates getQuotes to across quotes', async () => {
    const strategy = new AcrossStrategy();
    const quote = { strategy: 'across' } as TransactionPayQuote<AcrossQuote>;
    getAcrossQuotesMock.mockResolvedValue([quote]);

    const result = await strategy.getQuotes(baseRequest);

    expect(result).toStrictEqual([quote]);
    expect(getAcrossQuotesMock).toHaveBeenCalledWith(baseRequest);
  });

  it('delegates execute to across submit', async () => {
    const strategy = new AcrossStrategy();
    const request = {
      messenger,
      quotes: [],
      transaction: TRANSACTION_META_MOCK,
      isSmartTransaction: jest.fn(),
    } as PayStrategyExecuteRequest<AcrossQuote>;

    submitAcrossQuotesMock.mockResolvedValue({ transactionHash: '0xhash' });

    const result = await strategy.execute(request);

    expect(result).toStrictEqual({
      transactionHash: '0xhash',
    });
    expect(submitAcrossQuotesMock).toHaveBeenCalledWith(request);
  });
});
