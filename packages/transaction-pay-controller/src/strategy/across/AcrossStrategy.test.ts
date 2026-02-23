import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';
import { AcrossStrategy } from './AcrossStrategy';
import type { AcrossQuote } from './types';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';

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

  beforeEach(() => {
    jest.resetAllMocks();
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        allowSameChain: false,
        apiBase: 'https://across.test',
        enabled: true,
      },
      relay: {
        enabled: true,
      },
    });
  });

  it('returns false when across is disabled', () => {
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        allowSameChain: false,
        apiBase: 'https://across.test',
        enabled: false,
      },
      relay: {
        enabled: true,
      },
    });

    const strategy = new AcrossStrategy();
    expect(strategy.supports(baseRequest)).toBe(false);
  });

  it('returns true for perps deposits when other constraints are met', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        } as TransactionMeta,
      }),
    ).toBe(true);
  });

  it('returns false for perps across deposits', () => {
    const strategy = new AcrossStrategy();
    expect(
      strategy.supports({
        ...baseRequest,
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsAcrossDeposit,
        } as TransactionMeta,
      }),
    ).toBe(false);
  });

  it('returns true when same-chain swaps are allowed', () => {
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        allowSameChain: true,
        apiBase: 'https://across.test',
        enabled: true,
      },
      relay: {
        enabled: true,
      },
    });

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
    ).toBe(true);
  });

  it('returns false when same-chain swaps are not allowed', () => {
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
