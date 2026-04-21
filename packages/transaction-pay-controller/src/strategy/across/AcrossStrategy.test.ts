import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { ARBITRUM_USDC_ADDRESS, CHAIN_ID_ARBITRUM } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';
import { AcrossStrategy } from './AcrossStrategy';
import type { AcrossQuote } from './types';

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
