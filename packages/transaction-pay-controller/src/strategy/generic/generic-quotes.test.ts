import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_HYPERCORE, TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
} from '../../types';
import {
  getGenericProviderPriority,
  getSlippage,
} from '../../utils/feature-flags';
import { fetchGenericQuote } from './generic-api';
import { getGenericQuotes } from './generic-quotes';
import { GenericProviderName, GenericTradeType } from './types';

jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  getGenericProviderPriority: jest.fn(),
  getSlippage: jest.fn(),
}));
jest.mock('./generic-api');

const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;
const SOURCE_TOKEN_ADDRESS_MOCK =
  '0xabc0000000000000000000000000000000000000' as Hex;
const TARGET_TOKEN_ADDRESS_MOCK =
  '0x1234567890123456789012345678901234567890' as Hex;
const TOKEN_TRANSFER_RECIPIENT_MOCK =
  '0x5678901234567890123456789012345678901234' as Hex;
const TOKEN_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000005678901234567890123456789012345678901234000000000000000000000000000000000000000000000000000000000000007b' as Hex;
const SOURCE_ACCOUNT_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b' as Hex;

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;
const COMPLEX_TRANSACTION_META_MOCK = {
  txParams: { data: '0x1234' as Hex },
} as TransactionMeta;

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: SOURCE_TOKEN_ADDRESS_MOCK,
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: TARGET_TOKEN_ADDRESS_MOCK,
};

const FULFILLED_RESULT_MOCK = {
  duration: 42,
  id: 'quote-id',
  input: { formatted: '1.0', raw: '1000000000000000000' },
  output: { formatted: '0.123', raw: '123' },
  provider: GenericProviderName.Relay,
  providerFeeUsd: '0.25',
  status: 'fulfilled' as const,
  steps: [
    {
      chainId: 1,
      data: '0xdef' as Hex,
      to: '0x4560000000000000000000000000000000000000' as Hex,
      value: '0',
    },
  ],
};

const REJECTED_RESULT_MOCK = {
  error: { message: 'no route' },
  provider: GenericProviderName.Relay,
  status: 'rejected' as const,
};

const DELEGATION_RESULT_MOCK = {
  authorizationList: [
    {
      address: '0x9990000000000000000000000000000000000000' as Hex,
      chainId: '0x1' as Hex,
      nonce: '0x2' as Hex,
      r: '0x3' as Hex,
      s: '0x4' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0x111' as Hex,
  to: '0x2220000000000000000000000000000000000000' as Hex,
  value: '0x333' as Hex,
} as Awaited<ReturnType<GetDelegationTransactionCallback>>;

describe('generic-quotes', () => {
  const fetchGenericQuoteMock = jest.mocked(fetchGenericQuote);
  const getGenericProviderPriorityMock = jest.mocked(
    getGenericProviderPriority,
  );
  const getSlippageMock = jest.mocked(getSlippage);
  const { getDelegationTransactionMock, messenger } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    fetchGenericQuoteMock.mockResolvedValue({
      results: [FULFILLED_RESULT_MOCK],
    });
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGenericProviderPriorityMock.mockReturnValue([GenericProviderName.Relay]);
    getSlippageMock.mockReturnValue(0.005);
  });

  it('maps standard transactions to EXPECTED_OUTPUT quote requests with relay provider', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      {
        amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
        destinationChainId: 2,
        destinationToken: TARGET_TOKEN_ADDRESS_MOCK,
        originChainId: 1,
        originToken: SOURCE_TOKEN_ADDRESS_MOCK,
        provider: GenericProviderName.Relay,
        recipient: FROM_MOCK,
        sender: FROM_MOCK,
        slippageBps: 50,
        tradeType: GenericTradeType.ExpectedOutput,
      },
      undefined,
    );
  });

  it('maps max-amount transactions to EXACT_INPUT quote requests', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({
        amount: QUOTE_REQUEST_MOCK.sourceTokenAmount,
        tradeType: GenericTradeType.ExactInput,
      }),
      undefined,
    );
  });

  it('decodes ERC-20 transfer calldata and uses the transfer recipient', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: {
        txParams: { data: TOKEN_TRANSFER_DATA_MOCK },
      } as TransactionMeta,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ recipient: TOKEN_TRANSFER_RECIPIENT_MOCK }),
      undefined,
    );
    expect(getDelegationTransactionMock).not.toHaveBeenCalled();
  });

  it('builds calls from delegation for complex non-transfer transactions', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: COMPLEX_TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({
        authorizationList: [
          {
            address: DELEGATION_RESULT_MOCK.authorizationList?.[0].address,
            chainId: 1,
            nonce: 2,
            r: '0x3',
            s: '0x4',
            yParity: 1,
          },
        ],
        calls: [
          {
            data: SOURCE_ACCOUNT_TRANSFER_DATA_MOCK,
            to: TARGET_TOKEN_ADDRESS_MOCK,
            value: '0x0',
          },
          {
            data: DELEGATION_RESULT_MOCK.data,
            to: DELEGATION_RESULT_MOCK.to,
            value: DELEGATION_RESULT_MOCK.value,
          },
        ],
      }),
      undefined,
    );
  });

  it('does not build delegation calls for Hypercore transactions', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          targetChainId: CHAIN_ID_HYPERCORE,
        },
      ],
      transaction: COMPLEX_TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.not.objectContaining({ calls: expect.any(Array) }),
      undefined,
    );
    expect(getDelegationTransactionMock).not.toHaveBeenCalled();
  });

  it('returns an empty array when all providers return only rejected results', async () => {
    fetchGenericQuoteMock.mockResolvedValue({
      results: [REJECTED_RESULT_MOCK],
    });

    const result = await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result).toStrictEqual([]);
  });

  it('stops at the first provider with a fulfilled result', async () => {
    getGenericProviderPriorityMock.mockReturnValue([
      GenericProviderName.Relay,
      GenericProviderName.Across,
    ]);

    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledTimes(1);
    expect(fetchGenericQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ provider: GenericProviderName.Relay }),
      undefined,
    );
  });

  it('tries providers in priority order and falls back when the first provider has no fulfilled result', async () => {
    getGenericProviderPriorityMock.mockReturnValue([
      GenericProviderName.Relay,
      GenericProviderName.Across,
    ]);
    fetchGenericQuoteMock
      .mockResolvedValueOnce({ results: [REJECTED_RESULT_MOCK] })
      .mockResolvedValueOnce({
        results: [
          {
            ...FULFILLED_RESULT_MOCK,
            provider: GenericProviderName.Across,
          },
        ],
      });

    const result = await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenNthCalledWith(
      1,
      messenger,
      expect.objectContaining({ provider: GenericProviderName.Relay }),
      undefined,
    );
    expect(fetchGenericQuoteMock).toHaveBeenNthCalledWith(
      2,
      messenger,
      expect.objectContaining({ provider: GenericProviderName.Across }),
      undefined,
    );
    expect(result[0].original.provider).toBe(GenericProviderName.Across);
  });

  it('normalizes network fees to zero and uses the generic strategy', async () => {
    const result = await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result).toStrictEqual([
      {
        dust: { fiat: '0', usd: '0' },
        estimatedDuration: FULFILLED_RESULT_MOCK.duration,
        fees: {
          metaMask: { fiat: '0', usd: '0' },
          provider: { fiat: '0', usd: FULFILLED_RESULT_MOCK.providerFeeUsd },
          sourceNetwork: {
            estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
            max: { fiat: '0', human: '0', raw: '0', usd: '0' },
          },
          targetNetwork: { fiat: '0', usd: '0' },
        },
        original: {
          duration: FULFILLED_RESULT_MOCK.duration,
          id: FULFILLED_RESULT_MOCK.id,
          input: FULFILLED_RESULT_MOCK.input,
          output: FULFILLED_RESULT_MOCK.output,
          provider: FULFILLED_RESULT_MOCK.provider,
          providerFeeUsd: FULFILLED_RESULT_MOCK.providerFeeUsd,
          steps: FULFILLED_RESULT_MOCK.steps,
        },
        request: QUOTE_REQUEST_MOCK,
        sourceAmount: {
          fiat: '0',
          human: FULFILLED_RESULT_MOCK.input.formatted,
          raw: FULFILLED_RESULT_MOCK.input.raw,
          usd: '0',
        },
        strategy: TransactionPayStrategy.Generic,
        targetAmount: { fiat: '0', usd: '0' },
      },
    ]);
  });

  it('filters zero target amount requests unless they are post-quote or max amount requests', async () => {
    await getGenericQuotes({
      accountSupports7702: true,
      messenger,
      requests: [
        { ...QUOTE_REQUEST_MOCK, targetAmountMinimum: '0' },
        { ...QUOTE_REQUEST_MOCK, isPostQuote: true, targetAmountMinimum: '0' },
        { ...QUOTE_REQUEST_MOCK, isMaxAmount: true, targetAmountMinimum: '0' },
      ],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchGenericQuoteMock).toHaveBeenCalledTimes(2);
  });
});
