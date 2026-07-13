import { toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  PaymentOverride,
  POLYGON_USDCE_ADDRESS,
} from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
} from '../../types';
import {
  DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD,
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  isEIP7702Chain,
  isRelayExecuteEnabled,
  getGasBuffer,
  getSlippage,
} from '../../utils/feature-flags';
import { calculateGasCost, calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';
import { getRelayQuotes } from './relay-quotes';
import type { RelayQuote, RelayTransactionStep } from './types';

jest.mock('../../utils/token', () => ({
  ...jest.createMockFromModule<typeof import('../../utils/token')>(
    '../../utils/token',
  ),
  normalizeTokenAddress:
    jest.requireActual<typeof import('../../utils/token')>('../../utils/token')
      .normalizeTokenAddress,
}));
jest.mock('../../utils/gas', () => ({
  ...jest.requireActual('../../utils/gas'),
  calculateGasCost: jest.fn(),
  calculateGasFeeTokenCost: jest.fn(),
}));
jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  isEIP7702Chain: jest.fn(),
  isRelayExecuteEnabled: jest.fn(),
  getGasBuffer: jest.fn(),
  getSlippage: jest.fn(),
}));

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;
const PREDICT_WITHDRAW_TRANSACTION_MOCK = {
  txParams: {},
  nestedTransactions: [{ type: TransactionType.predictWithdraw }],
} as TransactionMeta;
const TOKEN_TRANSFER_RECIPIENT_MOCK =
  '0x5678901234567890123456789012345678901234';
const NESTED_TRANSACTION_DATA_MOCK = '0xdef' as Hex;
const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const CHAIN_ID_LINEA = '0xe708' as Hex;

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
};

const STEP_MOCK: RelayTransactionStep = {
  id: 'deposit',
  requestId: '0x1',
  kind: 'transaction',
  items: [
    {
      check: {
        endpoint: '/test',
        method: 'GET',
      },
      data: {
        chainId: 1,
        data: '0x123' as Hex,
        from: FROM_MOCK,
        gas: '21000',
        maxFeePerGas: '1000000000',
        maxPriorityFeePerGas: '2000000000',
        to: '0x2' as Hex,
        value: '300000',
      },
      status: 'complete',
    },
  ],
};

const QUOTE_MOCK = {
  details: {
    currencyIn: {
      amount: '1240000000000000000',
      amountFormatted: '1.24',
      amountUsd: '1.24',
    },
    currencyOut: {
      amount: '100',
      amountFormatted: '1.0',
      amountUsd: '1.23',
      currency: {
        decimals: 2,
      },
      minimumAmount: '125',
    },
    timeEstimate: 300,
    totalImpact: {
      usd: '1.11',
    },
  },
  fees: {
    relayer: {
      amountUsd: '1.11',
    },
  },
  metamask: {
    gasLimits: [21000],
    is7702: false,
  },
  steps: [STEP_MOCK],
} as RelayQuote & { steps: RelayTransactionStep[] };

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

const TOKEN_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000005678901234567890123456789012345678901234000000000000000000000000000000000000000000000000000000000000007b' as Hex;

describe('Relay Quotes Utils', () => {
  let successfulFetchMock: jest.SpyInstance;
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const isEIP7702ChainMock = jest.mocked(isEIP7702Chain);
  const isRelayExecuteEnabledMock = jest.mocked(isRelayExecuteEnabled);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const getSlippageMock = jest.mocked(getSlippage);

  const {
    messenger,
    estimateGasMock,
    estimateGasBatchMock,
    findNetworkClientIdByChainIdMock,
    getControllerStateMock,
    getDelegationTransactionMock,
    getGasFeeTokensMock,
    getKeyringControllerStateMock,
    getPaymentOverrideDataMock,
    getRemoteFeatureFlagControllerStateMock,
    polymarketGetDepositWalletAddressMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    successfulFetchMock = jest.spyOn(global, 'fetch');

    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'HD Key Tree',
          accounts: ['0x1234567890123456789012345678901234567891'],
          metadata: { id: 'hd-keyring', name: 'HD Key Tree' },
        },
      ],
    });

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '4.0',
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
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    getNativeTokenMock.mockReturnValue(NATIVE_TOKEN_ADDRESS);
    isEIP7702ChainMock.mockReturnValue(true);
    isRelayExecuteEnabledMock.mockReturnValue(false);
    getGasBufferMock.mockReturnValue(1.0);
    getSlippageMock.mockReturnValue(DEFAULT_SLIPPAGE);
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGasFeeTokensMock.mockResolvedValue([]);
    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
  });

  afterEach(() => {
    successfulFetchMock.mockRestore();
  });

  describe('getRelayQuotes', () => {
    it('returns quotes from Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
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
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        DEFAULT_RELAY_QUOTE_URL,
        expect.anything(),
      );

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
          destinationChainId: 2,
          destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
          originChainId: 1,
          originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
          recipient: QUOTE_REQUEST_MOCK.from,
          tradeType: 'EXPECTED_OUTPUT',
          user: QUOTE_REQUEST_MOCK.from,
        }),
      );

      expect(body.originGasOverhead).toBeUndefined();
      expect(body.metamask).toBeUndefined();
    });

    it('includes originGasOverhead when relay execute is enabled on EIP-7702 chain', async () => {
      isRelayExecuteEnabledMock.mockReturnValue(true);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.originGasOverhead).toBe(DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD);
      expect(body.metamask).toStrictEqual({ executeVersion: 2 });
    });

    it('omits originGasOverhead when relay execute is enabled but chain does not support EIP-7702', async () => {
      isRelayExecuteEnabledMock.mockReturnValue(true);
      isEIP7702ChainMock.mockReturnValue(false);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.originGasOverhead).toBeUndefined();
    });

    it('omits originGasOverhead when account does not support 7702 even on EIP-7702 chain with relay execute enabled', async () => {
      isRelayExecuteEnabledMock.mockReturnValue(true);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: false,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.originGasOverhead).toBeUndefined();
    });

    it('sends request with EXACT_INPUT trade type when isMaxAmount is true', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: QUOTE_REQUEST_MOCK.sourceTokenAmount,
          tradeType: 'EXACT_INPUT',
        }),
      );
    });

    it('throws if isMaxAmount is true and transaction includes data', async () => {
      await expect(
        getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              data: '0xabc' as Hex,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(
        'Max amount quotes do not support included transactions',
      );
    });

    it('includes transactions in request', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
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

    it('funds the delegator (transaction.txParams.from) rather than request.from when they differ', async () => {
      const delegatorAddress =
        '0xabcdef0000000000000000000000000000000001' as Hex;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: delegatorAddress,
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.txs[0]).toStrictEqual({
        to: QUOTE_REQUEST_MOCK.targetTokenAddress,
        data: '0xa9059cbb000000000000000000000000abcdef0000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b',
        value: '0x0',
      });
    });

    it('falls back to request.from for the funding recipient when transaction.txParams.from is unset', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
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

      expect(body.txs[0]).toStrictEqual({
        to: QUOTE_REQUEST_MOCK.targetTokenAddress,
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b',
        value: '0x0',
      });
    });

    it('includes request in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.request).toStrictEqual({
        amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
        destinationChainId: 2,
        destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
        originChainId: 1,
        originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
        recipient: QUOTE_REQUEST_MOCK.from,
        slippageTolerance: '50',
        tradeType: 'EXPECTED_OUTPUT',
        user: QUOTE_REQUEST_MOCK.from,
      });
    });

    it('skips delegation for token transfers', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('extracts recipient from token transfer', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK.toLowerCase());
    });

    it('includes transactions from nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: NESTED_TRANSACTION_DATA_MOCK,
            },
          ],
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
          recipient: QUOTE_REQUEST_MOCK.from,
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

    it('skips delegation for token transfers in nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('extracts recipient from token transfer in nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK.toLowerCase());
    });

    it('extracts recipient and sets refundTo when nested transactions include token transfer with delegation', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: NESTED_TRANSACTION_DATA_MOCK,
            },
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK);
      expect(body.refundTo).toBe(QUOTE_REQUEST_MOCK.from);
    });

    it('skips delegation for Hypercore deposits', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_HYPERCORE,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('does not extract recipient for Hypercore deposits with token transfer signature', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_HYPERCORE,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(QUOTE_REQUEST_MOCK.from);
    });

    it('sends request to url from feature flag', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const relayQuoteUrl = 'https://test.com/quote';

      isEIP7702ChainMock.mockReturnValue(false);

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            relayQuoteUrl,
          },
        },
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        relayQuoteUrl,
        expect.anything(),
      );
    });

    it('ignores gas fee token requests (target=0 and source=0)', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            sourceTokenAmount: '0',
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('processes post-quote requests', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalled();

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.tradeType).toBe('EXACT_INPUT');
      expect(body.amount).toBe(QUOTE_REQUEST_MOCK.sourceTokenAmount);
    });

    it('sets refundTo in request body for post-quote when provided', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const refundTo = '0xsafe000000000000000000000000000000000001' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.refundTo).toBe(refundTo);
    });

    it('uses request.recipient as body recipient when provided', async () => {
      const recipientOverride =
        '0xrecipient0000000000000000000000000000001' as Hex;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            recipient: recipientOverride,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(recipientOverride);
      expect(body.user).toBe(FROM_MOCK);
    });

    it('does not set refundTo in request body for post-quote when not provided', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.refundTo).toBeUndefined();
    });

    it('includes original transaction in batch gas estimation for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [100000],
        totalGasEstimate: 100000,
        totalGasLimit: 100000,
      });

      const postQuoteTransaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x1' as Hex,
        txParams: {
          from: FROM_MOCK,
          to: '0x9' as Hex,
          data: '0xaaa' as Hex,
          gas: '79000',
          value: '0',
        },
      } as TransactionMeta;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: postQuoteTransaction,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({ data: '0xaaa' }),
          ]),
        }),
      );
    });

    it('returns combined 7702 gas limit for post-quote with original tx', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [100000],
        totalGasEstimate: 100000,
        totalGasLimit: 100000,
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(result[0].original.metamask.gasLimits).toStrictEqual([100000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('prefers nestedTransactions gas over txParams.gas for post-quote batch estimation', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [71000],
        totalGasEstimate: 71000,
        totalGasLimit: 71000,
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
          nestedTransactions: [{ gas: '0xC350' }],
        } as TransactionMeta,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({ gas: '0xC350' }),
          ]),
        }),
      );

      expect(result[0].original.metamask.gasLimits).toStrictEqual([71000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('returns combined 7702 gas limit for post-quote with multi-step relay', async () => {
      const multiStepQuote = {
        ...QUOTE_MOCK,
        steps: [
          {
            ...STEP_MOCK,
            items: [
              STEP_MOCK.items[0],
              {
                ...STEP_MOCK.items[0],
                data: {
                  ...STEP_MOCK.items[0].data,
                  gas: '30000',
                },
              },
            ],
          },
        ],
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => multiStepQuote,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 130000,
        gasLimits: [130000],
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(result[0].original.metamask.gasLimits).toStrictEqual([130000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('returns per-tx gas limits for post-quote with multi-step non-7702 relay', async () => {
      const multiStepQuote = {
        ...QUOTE_MOCK,
        steps: [
          {
            ...STEP_MOCK,
            items: [
              STEP_MOCK.items[0],
              {
                ...STEP_MOCK.items[0],
                data: {
                  ...STEP_MOCK.items[0].data,
                  gas: '30000',
                },
              },
            ],
          },
        ],
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => multiStepQuote,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 130000,
        gasLimits: [79000, 21000, 30000],
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(result[0].original.metamask.gasLimits).toStrictEqual([
        79000, 21000, 30000,
      ]);
      expect(result[0].original.metamask.is7702).toBe(false);
    });

    it('includes original tx without gas in batch estimation for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [80000],
        totalGasEstimate: 80000,
        totalGasLimit: 80000,
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(estimateGasBatchMock).toHaveBeenCalled();
      expect(result[0].original.metamask.gasLimits).toStrictEqual([80000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('uses batch estimation with original tx for post-quote even when relay step has no gas', async () => {
      const noGasQuote = cloneDeep(QUOTE_MOCK);
      delete noGasQuote.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => noGasQuote,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [1000000],
        totalGasEstimate: 1000000,
        totalGasLimit: 1000000,
      });

      getGasBufferMock.mockReturnValue(1);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(estimateGasBatchMock).toHaveBeenCalled();
      expect(result[0].original.metamask.gasLimits).toStrictEqual([1000000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('defaults data and value for original tx when not present on txParams', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        gasLimits: [80000],
        totalGasEstimate: 80000,
        totalGasLimit: 80000,
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
          },
        } as TransactionMeta,
      });

      const batchCall = estimateGasBatchMock.mock.calls[0][0];
      const originalTxParams = batchCall.transactions[0];
      expect(originalTxParams.data).toBe('0x');
      expect(originalTxParams.value).toBe('0x0');
    });

    it('skips original tx in batch estimation when accountOverride diverges from txParams.from', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            from: '0xOverrideEOA' as Hex,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: '0xMoneyAccount' as Hex,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      expect(estimateGasBatchMock).not.toHaveBeenCalled();
    });

    it('does not prepend original transaction for post-quote when txParams.to is missing', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasBatchMock).not.toHaveBeenCalled();
    });

    it('falls back to legacy gas combining when txParams.to is missing but gas is present for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            gas: '0x13498',
          },
        } as TransactionMeta,
      });

      expect(estimateGasBatchMock).not.toHaveBeenCalled();
      expect(result[0].original.metamask.gasLimits).toStrictEqual([
        79000, 21000,
      ]);
      expect(result[0].original.metamask.is7702).toBe(false);
    });

    it('falls back to legacy 7702 gas combining when txParams.to is missing for post-quote with multi-step relay', async () => {
      const multiStepQuote = {
        ...QUOTE_MOCK,
        steps: [
          {
            ...STEP_MOCK,
            items: [
              STEP_MOCK.items[0],
              {
                ...STEP_MOCK.items[0],
                data: {
                  ...STEP_MOCK.items[0].data,
                  gas: '30000',
                },
              },
            ],
          },
        ],
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => multiStepQuote,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 51000,
        gasLimits: [51000],
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            gas: '0x13498',
          },
        } as TransactionMeta,
      });

      expect(result[0].original.metamask.gasLimits).toStrictEqual([130000]);
      expect(result[0].original.metamask.is7702).toBe(true);
    });

    it('uses refundTo as from for single gas estimation in predictWithdraw post-quote', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: proxyAddress,
        }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('ignores relay params.gas and estimates when fromOverride is set for single path', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: proxyAddress,
        }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('clears relay gas values in batch estimation when fromOverride is set', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items[0].data.gas = '2500000';
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
          gas: '2500000',
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: proxyAddress,
          transactions: expect.arrayContaining([
            expect.objectContaining({ gas: undefined }),
          ]),
        }),
      );
    });

    it('uses refundTo as from for batch gas estimation in predictWithdraw post-quote', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: proxyAddress,
        }),
      );
    });

    it('uses original from for non-predictWithdraw post-quote gas estimation', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: FROM_MOCK,
        }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('uses original from for gas estimation when not post-quote', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: FROM_MOCK,
        }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('uses original from for batch gas estimation when not post-quote', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: FROM_MOCK,
        }),
      );
    });

    it('uses original (EOA) from for predictWithdraw post-quote when route has no deposit step', async () => {
      // Same-chain swap routes (e.g. Polygon pUSD -> Polygon USDC) only emit
      // `approve` + `swap` steps. Simulating from the Safe proxy reverts in
      // the swap step because DEX aggregators reject contract callers, so the
      // override must be skipped and the relay params' EOA `from` used instead.
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps = [
        { ...STEP_MOCK, id: 'approve' },
        { ...STEP_MOCK, id: 'swap' },
      ];

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: FROM_MOCK,
        }),
      );
    });

    it('still uses Safe proxy for gas-fee-token lookup on swap-only predictWithdraw routes', async () => {
      // The gas-fee-token lookup must always use the Safe proxy for Predict
      // withdraws (because the source token lives in the Safe, not the EOA),
      // even when the gas-estimation path falls back to the EOA `from`.
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps = [
        { ...STEP_MOCK, id: 'approve' },
        { ...STEP_MOCK, id: 'swap' },
      ];

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

      const proxyAddress = '0xproxyAddress1234567890123456789012345678' as Hex;

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: proxyAddress,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(getGasFeeTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: proxyAddress }),
      );
      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('sets isSourceGasFeeToken for predictWithdraw post-quote when insufficient native balance', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('simulates with proxy address and scales gas fee token for predictWithdraw post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(getGasFeeTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '0xproxy',
        }),
      );
      calculateGasFeeTokenCostMock.mock.calls.forEach(([params]) => {
        expect(Number(params.gasFeeToken.amount)).toBeGreaterThan(
          Number(GAS_FEE_TOKEN_MOCK.amount),
        );
      });
    });

    it('falls back to native gas cost for predictWithdraw post-quote when simulation returns no matching token', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([]);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
    });

    it('skips proxy simulation for non-predictWithdraw post-quote even with refundTo', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
    });

    it('skips gas subtraction phase 2 for post-quote execute flows', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.metamask.isExecute = true;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    });

    it('subtracts gas cost and fetches phase 2 quote for post-quote flows', async () => {
      const phase2Mock = {
        ...QUOTE_MOCK,
        details: {
          ...QUOTE_MOCK.details,
          currencyOut: {
            ...QUOTE_MOCK.details.currencyOut,
            amountFormatted: '0.8',
            amountUsd: '0.80',
          },
        },
      };

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => phase2Mock,
        } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
      calculateGasFeeTokenCostMock.mockReturnValue({
        fiat: '5.56',
        human: '2.725',
        isGasFeeToken: true,
        raw: '2725000000000000',
        usd: '4.45',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);

      const secondCall = successfulFetchMock.mock.calls[1];
      const secondBody = JSON.parse(
        (secondCall[1] as RequestInit).body as string,
      );
      // Gas cost is buffered by the default postQuoteGasBuffer (1.1)
      // ceil(2725000000000000 * 1.1) = 2997500000000000
      const bufferedGas = BigInt('2997500000000000');
      const adjustedAmount = (
        BigInt(QUOTE_REQUEST_MOCK.sourceTokenAmount) - bufferedGas
      ).toString();
      expect(secondBody.amount).toBe(adjustedAmount);

      expect(result[0].targetAmount).toStrictEqual(
        expect.objectContaining({ usd: expect.any(String) }),
      );
    });

    it('subtracts gas for Polygon native token address (0x1010) in post-quote flows', async () => {
      const phase2Mock = {
        ...QUOTE_MOCK,
        details: {
          ...QUOTE_MOCK.details,
          currencyOut: {
            ...QUOTE_MOCK.details.currencyOut,
            amountFormatted: '0.8',
            amountUsd: '0.80',
          },
        },
      };

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => phase2Mock,
        } as never);

      calculateGasCostMock.mockReturnValue({
        fiat: '0.50',
        human: '0.5',
        raw: '500000000000000',
        usd: '0.50',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            sourceChainId: '0x89' as Hex,
            sourceTokenAddress:
              '0x0000000000000000000000000000000000001010' as Hex,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(result[0].targetAmount).toStrictEqual(
        expect.objectContaining({ usd: expect.any(String) }),
      );
    });

    it('subtracts gas for Polygon native zero address (0x0) in post-quote flows', async () => {
      const phase2Mock = {
        ...QUOTE_MOCK,
        details: {
          ...QUOTE_MOCK.details,
          currencyOut: {
            ...QUOTE_MOCK.details.currencyOut,
            amountFormatted: '0.8',
            amountUsd: '0.80',
          },
        },
      };

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => phase2Mock,
        } as never);

      calculateGasCostMock.mockReturnValue({
        fiat: '0.50',
        human: '0.5',
        raw: '500000000000000',
        usd: '0.50',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            sourceChainId: '0x89' as Hex,
            sourceTokenAddress:
              '0x0000000000000000000000000000000000000000' as Hex,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(result[0].targetAmount).toStrictEqual(
        expect.objectContaining({ usd: expect.any(String) }),
      );
    });

    it('returns phase 1 quote when gas cost exceeds source amount for post-quote flows', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
      calculateGasFeeTokenCostMock.mockReturnValue({
        fiat: '999',
        human: '999',
        isGasFeeToken: true,
        raw: '999000000000000000000',
        usd: '999',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceTokenAmount: '1',
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('falls back to native cost when gas station simulation fails for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockRejectedValue(new Error('Simulation failed'));

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
    });

    it('falls back to phase 1 quote when phase 2 fetch fails for post-quote flows', async () => {
      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never)
        .mockRejectedValueOnce(new Error('Relay API error'));

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
      calculateGasFeeTokenCostMock.mockReturnValue({
        fiat: '5.56',
        human: '2.725',
        isGasFeeToken: true,
        raw: '2725000000000000',
        usd: '4.45',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('falls back to phase 1 when phase 2 loses gas fee token for post-quote flows', async () => {
      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

      getTokenBalanceMock
        .mockReturnValueOnce('0')
        .mockReturnValueOnce('1000000000000000000');

      getGasFeeTokensMock
        .mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK])
        .mockResolvedValueOnce([]);

      calculateGasFeeTokenCostMock.mockReturnValue({
        fiat: '5.56',
        human: '2.725',
        isGasFeeToken: true,
        raw: '2725000000000000',
        usd: '4.45',
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            sourceBalanceRaw: QUOTE_REQUEST_MOCK.sourceTokenAmount,
            targetAmountMinimum: '0',
            isPostQuote: true,
            refundTo: '0xproxy' as Hex,
          },
        ],
        transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('includes duration in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].estimatedDuration).toBe(300);
    });

    it('includes zero metaMask fee when app fee is absent', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.metaMask).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes metaMask fee from app fee in quote', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.details.totalImpact.usd = '1.86';
      quoteMock.fees.app = { amountUsd: '0.75' };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.metaMask).toStrictEqual({
        usd: '0.75',
        fiat: '1.5',
      });
    });

    it('subtracts app fee from provider fee', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.details.totalImpact.usd = '1.86';
      quoteMock.fees.app = { amountUsd: '0.75' };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.11',
        fiat: '2.22',
      });
    });

    it('includes provider fee', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.11',
        fiat: '2.22',
      });
    });

    it('sets provider fee to zero when subsidized fee is present', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000',
        amountFormatted: '0.50',
        amountUsd: '0.50',
        currency: {
          address: '0xdef' as Hex,
          chainId: 1,
          decimals: 6,
        },
        minimumAmount: '500000',
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('uses amountFormatted for subsidized fee when fee token is a stablecoin', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000',
        amountFormatted: '0.50',
        amountUsd: '0.49',
        currency: {
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Hex,
          chainId: 1,
          decimals: 6,
        },
        minimumAmount: '500000',
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes dust in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
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
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
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
          ok: true,
          json: async () => quoteMock,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 900000 }),
        );
      });

      it('zeroes source network fees and gas limits when parent sponsorship applies', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...QUOTE_REQUEST_MOCK,
              targetChainId: QUOTE_REQUEST_MOCK.sourceChainId,
            },
          ],
          transaction: {
            ...TRANSACTION_META_MOCK,
            chainId: QUOTE_REQUEST_MOCK.sourceChainId,
            isGasFeeSponsored: true,
          },
        });

        const zeroAmount = { fiat: '0', human: '0', raw: '0', usd: '0' };

        expect(result[0].fees.sourceNetwork.estimate).toStrictEqual(zeroAmount);
        expect(result[0].fees.sourceNetwork.max).toStrictEqual(zeroAmount);
        expect(result[0].original.metamask.gasLimits).toStrictEqual([0]);
      });

      it('does not zero source network fees when parent sponsorship is missing', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...QUOTE_REQUEST_MOCK,
              targetChainId: QUOTE_REQUEST_MOCK.sourceChainId,
            },
          ],
          transaction: {
            ...TRANSACTION_META_MOCK,
            chainId: QUOTE_REQUEST_MOCK.sourceChainId,
          },
        });

        expect(result[0].fees.sourceNetwork.estimate).toStrictEqual({
          fiat: '4.56',
          human: '1.725',
          raw: '1725000000000000',
          usd: '3.45',
        });
      });

      it('using gas total from multiple transactions', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);

        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            data: '0x456' as Hex,
            from: FROM_MOCK,
            gas: '480000',
            to: '0x3' as Hex,
          },
        } as never);

        quoteMock.steps.push({
          items: [
            {
              data: {
                chainId: 1,
                data: '0x789' as Hex,
                from: FROM_MOCK,
                gas: '1000',
                to: '0x4' as Hex,
              },
            },
            {
              data: {
                chainId: 1,
                data: '0xabc' as Hex,
                from: FROM_MOCK,
                gas: '2000',
                to: '0x5' as Hex,
              },
            },
          ],
          kind: 'transaction',
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);
        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 504000,
          gasLimits: [21000, 480000, 1000, 2000],
        });

        await getRelayQuotes({
          accountSupports7702: true,
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
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          accountSupports7702: true,
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
            chainId: 1,
            data: '0x456' as Hex,
            from: FROM_MOCK,
            gas: '21000',
            to: '0x3' as Hex,
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quote,
        } as never);
        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 42000,
          gasLimits: [21000, 21000],
        });

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          accountSupports7702: true,
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

      it('uses proxy simulation and scales gas fee token amount for post-quote with a single relay param', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          gasLimits: [42000],
          totalGasEstimate: 42000,
          totalGasLimit: 42000,
        });

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...QUOTE_REQUEST_MOCK,
              targetAmountMinimum: '0',
              isPostQuote: true,
              refundTo: '0xproxy' as Hex,
            },
          ],
          transaction: {
            ...PREDICT_WITHDRAW_TRANSACTION_MOCK,
            chainId: '0x1' as Hex,
            txParams: {
              from: FROM_MOCK,
              to: '0x9' as Hex,
              data: '0xaaa' as Hex,
              gas: '0x5208',
              value: '0',
            },
          } as TransactionMeta,
        });

        expect(getGasFeeTokensMock).toHaveBeenCalledWith(
          expect.objectContaining({
            from: '0xproxy',
          }),
        );
        calculateGasFeeTokenCostMock.mock.calls.forEach(([params]) => {
          expect(Number(params.gasFeeToken.amount)).toBeGreaterThan(
            Number(GAS_FEE_TOKEN_MOCK.amount),
          );
        });
      });

      it('not using gas fee token if sufficient native balance', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1725000000000000');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          accountSupports7702: true,
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
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([
          { ...GAS_FEE_TOKEN_MOCK, tokenAddress: '0xdef' as Hex },
        ]);

        const result = await getRelayQuotes({
          accountSupports7702: true,
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
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
        calculateGasFeeTokenCostMock.mockReturnValue(undefined);

        const result = await getRelayQuotes({
          accountSupports7702: true,
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
          ok: true,
          json: async () => quote,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          accountSupports7702: true,
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

      it('not using gas fee token cost if chain disabled in feature flag', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        getRemoteFeatureFlagControllerStateMock.mockReturnValue({
          ...getDefaultRemoteFeatureFlagControllerState(),
          remoteFeatureFlags: {
            confirmations_pay: {
              relayDisabledGasStationChains: [QUOTE_REQUEST_MOCK.sourceChainId],
            },
          },
        });

        const result = await getRelayQuotes({
          accountSupports7702: true,
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

      it('not using gas fee token if insufficient native balance and chain does not support EIP-7702', async () => {
        const lineaQuoteRequest: QuoteRequest = {
          ...QUOTE_REQUEST_MOCK,
          sourceChainId: CHAIN_ID_LINEA,
        };

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        isEIP7702ChainMock.mockReturnValue(true);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [lineaQuoteRequest],
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
    });

    describe('zeroes source network fees for execute flow', () => {
      const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };

      it('sets source network fees to zero when quote has isExecute', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.metamask.isExecute = true;

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: ZERO_AMOUNT,
          max: ZERO_AMOUNT,
        });
      });

      it('preserves isExecute from quote response on normalized quote', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.metamask.isExecute = true;

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].original.metamask.isExecute).toBe(true);
      });

      it('does not zero source network fees when quote does not have isExecute', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.sourceNetwork).not.toStrictEqual({
          estimate: ZERO_AMOUNT,
          max: ZERO_AMOUNT,
        });
      });

      it('returns empty gas limits when quote has isExecute', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.metamask.isExecute = true;

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].original.metamask.gasLimits).toStrictEqual([]);
      });

      it('adds extra gas when paymentOverride is set', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...QUOTE_REQUEST_MOCK,
              paymentOverride: PaymentOverride.MoneyAccount,
            },
          ],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 21000 + 75000 }),
        );

        expect(result[0].original.metamask.gasLimits).toStrictEqual([
          75000, 21000,
        ]);
      });

      it('adds extra gas to combined 7702 limit when paymentOverride is set', async () => {
        const multiStepQuote = {
          ...QUOTE_MOCK,
          steps: [
            {
              ...STEP_MOCK,
              items: [
                STEP_MOCK.items[0],
                {
                  ...STEP_MOCK.items[0],
                  data: { ...STEP_MOCK.items[0].data, gas: '30000' },
                },
              ],
            },
          ],
        };

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => multiStepQuote,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 51000,
          gasLimits: [51000],
        });

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...QUOTE_REQUEST_MOCK,
              paymentOverride: PaymentOverride.MoneyAccount,
            },
          ],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].original.metamask.gasLimits).toStrictEqual([
          51000 + 75000,
        ]);
        expect(result[0].original.metamask.is7702).toBe(true);
      });
    });

    describe('Money Account post-quote (processMoneyAccountPostQuote)', () => {
      const TRANSACTION_ID_MOCK = 'money-account-tx-1';
      const MONEY_ACCOUNT_RECIPIENT_MOCK =
        '0xaa00000000000000000000000000000000000001' as Hex;
      const AMOUNT_HUMAN_MOCK = '100.5';
      const AMOUNT_RAW_MOCK = '100500000';
      const OVERRIDE_CALL_MOCK = {
        to: '0xbb00000000000000000000000000000000000001' as Hex,
        data: '0xcc' as Hex,
        value: '0x0' as Hex,
      };

      const MONEY_ACCOUNT_TX_MOCK = {
        ...TRANSACTION_META_MOCK,
        id: TRANSACTION_ID_MOCK,
      } as TransactionMeta;

      const MONEY_ACCOUNT_REQUEST_MOCK: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        isPostQuote: true,
        paymentOverride: PaymentOverride.MoneyAccount,
      };

      function setupMoneyAccountMocks({
        amountHuman = AMOUNT_HUMAN_MOCK,
        amountRaw = AMOUNT_RAW_MOCK,
        overrideCalls = [OVERRIDE_CALL_MOCK],
        recipient,
        authorizationList = DELEGATION_RESULT_MOCK.authorizationList,
      }: {
        amountHuman?: string;
        amountRaw?: string;
        overrideCalls?: { to: Hex; data: Hex; value: Hex }[];
        recipient?: Hex;
        authorizationList?: typeof DELEGATION_RESULT_MOCK.authorizationList;
      } = {}): void {
        getControllerStateMock.mockReturnValue({
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              tokens: [{ amountHuman, amountRaw }],
            },
          },
        } as never);

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: overrideCalls,
          ...(recipient ? { recipient } : {}),
          ...(authorizationList ? { authorizationList } : {}),
        });
      }

      it('sets tradeType to EXACT_OUTPUT and amount from transactionData amountRaw', async () => {
        setupMoneyAccountMocks();
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.tradeType).toBe('EXACT_OUTPUT');
        expect(body.amount).toBe(AMOUNT_RAW_MOCK);
      });

      it('uses amountRaw rather than sourceTokenAmount when decimals differ', async () => {
        const destinationAmountRaw = '100000';
        const sourceTokenAmountWithDifferentDecimals = '10000000';

        setupMoneyAccountMocks({ amountRaw: destinationAmountRaw });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [
            {
              ...MONEY_ACCOUNT_REQUEST_MOCK,
              sourceTokenAmount: sourceTokenAmountWithDifferentDecimals,
            },
          ],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.amount).toBe(destinationAmountRaw);
        expect(body.amount).not.toBe(sourceTokenAmountWithDifferentDecimals);
      });

      it('defaults amount to 0 when transactionData has no tokens', async () => {
        getControllerStateMock.mockReturnValue({
          transactionData: {
            [TRANSACTION_ID_MOCK]: {},
          },
        } as never);

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [OVERRIDE_CALL_MOCK],
        });

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.amount).toBe('0');
      });

      it('defaults amount to 0 when transactionData is missing', async () => {
        getControllerStateMock.mockReturnValue({
          transactionData: {},
        } as never);

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [OVERRIDE_CALL_MOCK],
        });

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.amount).toBe('0');
      });

      it('includes token transfer and override calls in txs', async () => {
        setupMoneyAccountMocks({ recipient: MONEY_ACCOUNT_RECIPIENT_MOCK });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.txs).toHaveLength(2);
        expect(body.txs[0].to).toBe(QUOTE_REQUEST_MOCK.targetTokenAddress);
        expect(body.txs[1].to).toBe(OVERRIDE_CALL_MOCK.to);
        expect(body.txs[1].data).toBe(OVERRIDE_CALL_MOCK.data);
      });

      it('uses request.from as funding recipient when override provides no recipient', async () => {
        setupMoneyAccountMocks();
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.txs[0].data).toContain(
          QUOTE_REQUEST_MOCK.from.slice(2).toLowerCase(),
        );
      });

      it('uses override recipient as funding recipient when provided', async () => {
        setupMoneyAccountMocks({ recipient: MONEY_ACCOUNT_RECIPIENT_MOCK });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.txs[0].data).toContain(
          MONEY_ACCOUNT_RECIPIENT_MOCK.slice(2).toLowerCase(),
        );
      });

      it('does not set txs when payment override returns no calls', async () => {
        setupMoneyAccountMocks({ overrideCalls: [] });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.txs).toBeUndefined();
        expect(body.tradeType).not.toBe('EXACT_OUTPUT');
      });

      it('normalizes authorization list from payment override data', async () => {
        setupMoneyAccountMocks();
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.authorizationList).toStrictEqual([
          expect.objectContaining({
            chainId: 1,
            nonce: 2,
            yParity: 1,
          }),
        ]);
      });

      it('passes amountHuman and transactionData to getPaymentOverrideData', async () => {
        setupMoneyAccountMocks();
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        expect(getPaymentOverrideDataMock).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: AMOUNT_HUMAN_MOCK,
            transaction: MONEY_ACCOUNT_TX_MOCK,
          }),
        );
      });

      it('defaults amountHuman to 0 when transactionData has no tokens', async () => {
        getControllerStateMock.mockReturnValue({
          transactionData: {
            [TRANSACTION_ID_MOCK]: {},
          },
        } as never);

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [OVERRIDE_CALL_MOCK],
        });

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        expect(getPaymentOverrideDataMock).toHaveBeenCalledWith(
          expect.objectContaining({ amount: '0' }),
        );
      });

      it('defaults call value to 0x0 when override call omits value', async () => {
        getControllerStateMock.mockReturnValue({
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              tokens: [
                {
                  amountHuman: AMOUNT_HUMAN_MOCK,
                  amountRaw: AMOUNT_RAW_MOCK,
                },
              ],
            },
          },
        } as never);

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [{ to: OVERRIDE_CALL_MOCK.to, data: OVERRIDE_CALL_MOCK.data }],
        });

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [MONEY_ACCOUNT_REQUEST_MOCK],
          transaction: MONEY_ACCOUNT_TX_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.txs[1].value).toBe('0x0');
      });
    });

    describe('HyperLiquid source (isHyperliquidSource)', () => {
      const HL_REQUEST: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        isHyperliquidSource: true,
        isPostQuote: true,
        sourceChainId: CHAIN_ID_ARBITRUM,
        sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
        sourceTokenAmount: '100000000',
      };

      it('overrides source chain and token to HyperCore', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [HL_REQUEST],
          transaction: TRANSACTION_META_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.originChainId).toBe(parseInt(CHAIN_ID_HYPERCORE, 16));
        expect(body.originCurrency).toBe('0x00000000000000000000000000000000');
      });

      it('shifts source amount by 2 decimals (8→6)', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [HL_REQUEST],
          transaction: TRANSACTION_META_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.amount).toBe('10000000000');
      });

      it('zeroes source network fees (gasless)', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [HL_REQUEST],
          transaction: TRANSACTION_META_MOCK,
        });

        const zeroAmount = { fiat: '0', human: '0', raw: '0', usd: '0' };

        expect(result[0].fees.sourceNetwork.estimate).toStrictEqual(zeroAmount);
        expect(result[0].fees.sourceNetwork.max).toStrictEqual(zeroAmount);
      });

      it('uses Arbitrum USDC fiat rate for source', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [HL_REQUEST],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(getTokenFiatRateMock).toHaveBeenCalledWith(
          expect.anything(),
          ARBITRUM_USDC_ADDRESS,
          CHAIN_ID_ARBITRUM,
        );
      });
    });

    it('includes target network fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.targetNetwork).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes target amount in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('does not add subsidized fee to target amount', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000000000000',
        amountFormatted: '0.0005',
        amountUsd: '0.50',
        currency: {
          address: '0xdef' as Hex,
          chainId: 1,
          decimals: 18,
        },
        minimumAmount: '500000000000000',
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('uses amountFormatted as usd for target amount when target is a stablecoin', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1',
        fiat: '2',
      });
    });

    it('uses amountUsd for target amount when target is not a stablecoin', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('throws if fetching quote fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Fetch error'));

      await expect(
        getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Fetch error');
    });

    it('throws if source token fiat rate is unavailable', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await expect(
        getRelayQuotes({
          accountSupports7702: true,
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
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [arbitrumToHyperliquidRequest],
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        },
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

    it('does not convert to Hyperliquid deposit when parent transaction is not a Perps deposit', async () => {
      const arbitrumUsdcRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [arbitrumUsdcRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          destinationChainId: Number(CHAIN_ID_ARBITRUM),
          destinationCurrency: ARBITRUM_USDC_ADDRESS,
        }),
      );
    });

    it('does not convert to Hyperliquid deposit for post-quote requests targeting Arbitrum USDC', async () => {
      const postQuoteRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        isPostQuote: true,
        targetAmountMinimum: '0',
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [postQuoteRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.destinationChainId).toBe(Number(CHAIN_ID_ARBITRUM));
      expect(body.destinationCurrency).toBe(ARBITRUM_USDC_ADDRESS);
    });

    it('updates request if source is polygon native', async () => {
      getNativeTokenMock.mockReturnValue(
        '0x0000000000000000000000000000000000001010',
      );

      isEIP7702ChainMock.mockReturnValue(true);

      const polygonToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        sourceChainId: CHAIN_ID_POLYGON,
        sourceTokenAddress: '0x0000000000000000000000000000000000001010',
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
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

    it('updates request if target is polygon native', async () => {
      const polygonTargetRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        targetChainId: CHAIN_ID_POLYGON,
        targetTokenAddress: '0x0000000000000000000000000000000000001010',
      };

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [polygonTargetRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          destinationCurrency: NATIVE_TOKEN_ADDRESS,
        }),
      );
    });

    it('estimates gas for single transaction', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        {
          data: quoteMock.steps[0].items[0].data.data,
          from: quoteMock.steps[0].items[0].data.from,
          to: quoteMock.steps[0].items[0].data.to,
          value: toHex(300000),
        },
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 50000 }),
      );
    });

    it('uses fallback gas when estimateGas throws', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockRejectedValue(new Error('Estimation failed'));

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 900000 }),
      );
    });

    it('uses fallback gas when estimation fails', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: {
          debug: {},
        },
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 900000 }),
      );
    });

    it('uses estimated gas for multiple transactions', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith({
        chainId: '0x1',
        from: FROM_MOCK,
        transactions: [
          expect.objectContaining({
            data: quoteMock.steps[0].items[0].data.data,
            to: quoteMock.steps[0].items[0].data.to,
          }),
          expect.objectContaining({
            data: quoteMock.steps[0].items[1].data.data,
            to: quoteMock.steps[0].items[1].data.to,
          }),
        ],
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 100000 }),
      );
    });

    it('uses batch estimation for multiple transactions even when the source chain does not support EIP-7702', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items[0].data.gas = '30000';
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      isEIP7702ChainMock.mockReturnValue(false);
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 80000,
        gasLimits: [30000, 50000],
      });

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
      expect(estimateGasMock).not.toHaveBeenCalled();
      expect(result[0].original.metamask.gasLimits).toStrictEqual([
        30000, 50000,
      ]);
    });

    it('throws when estimateGasBatch fails', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockRejectedValue(
        new Error('Batch estimation failed'),
      );

      await expect(
        getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(
        'Failed to fetch Relay quotes: Error: Batch estimation failed',
      );
    });

    it('includes gas limits in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.metamask).toStrictEqual({
        gasLimits: [21000],
        is7702: false,
      });
    });

    it('includes empty value when not defined', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.value;
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({ value: '0x0' }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('throws when later relay transactions omit required estimation fields', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {},
      } as never);

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      await expect(
        getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Failed to fetch Relay quotes');
    });

    it('throws when relay transaction estimation fields are missing', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items = [
        {
          ...quoteMock.steps[0].items[0],
          data: {} as RelayTransactionStep['items'][0]['data'],
        },
      ];

      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => quoteMock,
      } as never);

      await expect(
        getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Failed to fetch Relay quotes');
    });

    describe('Polymarket deposit-wallet source (isPolymarketDepositWallet)', () => {
      const DEPOSIT_WALLET_MOCK =
        '0x2222222222222222222222222222222222222222' as Hex;
      const POLYMARKET_REQUEST: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        isPolymarketDepositWallet: true,
      };

      it('overrides origin currency, user, refundTo and useDepositAddress on the quote body', async () => {
        polymarketGetDepositWalletAddressMock.mockResolvedValue(
          DEPOSIT_WALLET_MOCK,
        );

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => QUOTE_MOCK,
        } as never);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [POLYMARKET_REQUEST],
          transaction: TRANSACTION_META_MOCK,
        });

        const body = JSON.parse(
          successfulFetchMock.mock.calls[0][1]?.body as string,
        );

        expect(body.originCurrency).toBe(POLYGON_USDCE_ADDRESS);
        expect(body.user).toBe(DEPOSIT_WALLET_MOCK);
        expect(body.refundTo).toBe(DEPOSIT_WALLET_MOCK);
        expect(body.useDepositAddress).toBe(true);
        expect(body.strict).toBe(true);
      });
    });

    describe('gas buffer support', () => {
      it('applies buffer to single transaction gas estimate', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        delete quoteMock.steps[0].items[0].data.gas;

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        estimateGasMock.mockResolvedValue({
          gas: toHex(50000),
          simulationFails: undefined,
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 75000 }),
        );
      });

      it('applies buffer to per-entry batch gas estimates when transactions are estimated', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        delete quoteMock.steps[0].items[0].data.gas;
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 80000,
          gasLimits: [35000, 45000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 120000 }),
        );
      });

      it('does not apply buffer to batch transaction gas estimates when estimates match params', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 70000,
          gasLimits: [30000, 40000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 70000 }),
        );
      });

      it('applies buffer to batch with single transaction', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 60000,
          gasLimits: [60000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 90000 }),
        );
      });

      it('applies mixed buffer to batch transactions when some match params and others do not', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 70000,
          gasLimits: [30000, 50000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          accountSupports7702: true,
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 105000 }),
        );
      });
    });
  });

  describe('HyperLiquid activation fee', () => {
    const HYPERLIQUID_REQUEST_MOCK: QuoteRequest = {
      from: FROM_MOCK,
      isHyperliquidSource: true,
      isPostQuote: true,
      sourceBalanceRaw: '4800000',
      sourceChainId: CHAIN_ID_HYPERCORE,
      sourceTokenAddress: '0x00000000000000000000000000000000' as Hex,
      // $4.80 at 6 decimals; normalizeRequest shifts to 8 decimals.
      sourceTokenAmount: '4800000',
      targetAmountMinimum: '0',
      targetChainId: CHAIN_ID_ARBITRUM,
      targetTokenAddress: ARBITRUM_USDC_ADDRESS,
    };

    const HYPERLIQUID_QUOTE_MOCK = {
      details: {
        currencyIn: {
          amount: '380000000',
          amountFormatted: '3.8',
          amountUsd: '3.8',
          currency: { chainId: 1337, decimals: 8 },
        },
        currencyOut: {
          amount: '3720000',
          amountFormatted: '3.72',
          amountUsd: '3.72',
          currency: { chainId: 42161, decimals: 6 },
          minimumAmount: '0',
        },
        timeEstimate: 30,
        totalImpact: { usd: '0.08' },
      },
      fees: { relayer: { amountUsd: '0' } },
      steps: [],
    } as unknown as RelayQuote;

    const PERPS_WITHDRAW_TRANSACTION_MOCK = {
      txParams: {},
      type: TransactionType.perpsWithdraw,
    } as TransactionMeta;

    const enableActivationFeeFlag = (): void => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            overrides: {
              perpsWithdraw: {
                hyperliquidActivationFee: { enabled: true },
              },
            },
          },
        },
      });
    };

    it('reserves the fee and adds it to the provider fee when unactivated', async () => {
      enableActivationFeeFlag();

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              delta: {
                type: 'send',
                user: '0x6b9e773128f453f5c2c60935ee2de2cbc5390a24',
                destination: FROM_MOCK,
              },
            },
          ],
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => HYPERLIQUID_QUOTE_MOCK,
        } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [HYPERLIQUID_REQUEST_MOCK],
        transaction: PERPS_WITHDRAW_TRANSACTION_MOCK,
      });

      const relayBody = JSON.parse(
        successfulFetchMock.mock.calls[1][1]?.body as string,
      );

      // $4.80 (480000000 after the 8-decimal shift) - $1.00 (100000000).
      expect(relayBody.amount).toBe('380000000');
      expect(result[0].fees.provider.usd).toBe('1.08');
    });

    it('does not reserve the fee when the account is activated', async () => {
      enableActivationFeeFlag();

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ delta: { type: 'withdraw' } }],
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => HYPERLIQUID_QUOTE_MOCK,
        } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [HYPERLIQUID_REQUEST_MOCK],
        transaction: PERPS_WITHDRAW_TRANSACTION_MOCK,
      });

      const relayBody = JSON.parse(
        successfulFetchMock.mock.calls[1][1]?.body as string,
      );

      expect(relayBody.amount).toBe('480000000');
      expect(result[0].fees.provider.usd).toBe('0.08');
    });

    it('does not query HyperLiquid when the feature is disabled', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => HYPERLIQUID_QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [HYPERLIQUID_REQUEST_MOCK],
        transaction: PERPS_WITHDRAW_TRANSACTION_MOCK,
      });

      // Only the relay quote fetch is made; no HyperLiquid info call.
      expect(successfulFetchMock).toHaveBeenCalledTimes(1);

      const relayBody = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(relayBody.amount).toBe('480000000');
      expect(result[0].fees.provider.usd).toBe('0.08');
    });

    it('surfaces the activation fee in the provider fee even when subsidized', async () => {
      enableActivationFeeFlag();

      const subsidizedQuote = {
        ...HYPERLIQUID_QUOTE_MOCK,
        fees: {
          relayer: { amountUsd: '0' },
          subsidized: {
            amount: '1',
            amountFormatted: '1',
            amountUsd: '1',
            currency: { chainId: 1, address: '0xother', decimals: 6 },
            minimumAmount: '0',
          },
        },
      } as unknown as RelayQuote;

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              delta: {
                type: 'send',
                user: '0x6b9e773128f453f5c2c60935ee2de2cbc5390a24',
                destination: FROM_MOCK,
              },
            },
          ],
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => subsidizedQuote,
        } as never);

      const result = await getRelayQuotes({
        accountSupports7702: true,
        messenger,
        requests: [HYPERLIQUID_REQUEST_MOCK],
        transaction: PERPS_WITHDRAW_TRANSACTION_MOCK,
      });

      // The relay provider fee is subsidized to zero, but the $1 activation fee
      // (withheld from the source send) is still surfaced.
      expect(result[0].fees.provider.usd).toBe('1');
    });
  });
});
