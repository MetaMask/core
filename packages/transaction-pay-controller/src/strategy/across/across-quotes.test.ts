import { Interface } from '@ethersproject/abi';
import { successfulFetch } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getAcrossQuotes } from './across-quotes';
import type { AcrossSwapApprovalResponse } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { QuoteRequest } from '../../types';
import { getGasBuffer, getSlippage } from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import { getTokenFiatRate } from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas', () => ({
  ...jest.requireActual('../../utils/gas'),
  calculateGasCost: jest.fn(),
}));
jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  getGasBuffer: jest.fn(),
  getSlippage: jest.fn(),
}));

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;

const TRANSACTION_META_MOCK = {
  txParams: {
    from: FROM_MOCK,
  },
} as TransactionMeta;

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc' as Hex,
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef' as Hex,
};

const QUOTE_MOCK: AcrossSwapApprovalResponse = {
  approvalTxns: [],
  expectedFillTime: 300,
  expectedOutputAmount: '200',
  fees: {
    total: { amountUsd: '1.23' },
    originGas: { amountUsd: '0.45' },
    destinationGas: { amountUsd: '0.67' },
  },
  inputAmount: '1000000000000000000',
  inputToken: {
    address: '0xabc' as Hex,
    chainId: 1,
    decimals: 18,
    symbol: 'ETH',
  },
  minOutputAmount: '150',
  outputToken: {
    address: '0xdef' as Hex,
    chainId: 2,
    decimals: 6,
    symbol: 'USDC',
  },
  swapTx: {
    chainId: 1,
    to: '0xswap' as Hex,
    data: '0xdeadbeef' as Hex,
    maxFeePerGas: '0x1',
    maxPriorityFeePerGas: '0x1',
  },
};

const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

const TRANSFER_RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const DELEGATION_ACTION_MOCK = {
  target: '0xde1e9a7e' as Hex,
  functionSignature:
    'function redeemDelegations(bytes[] delegations, bytes32[] modes, bytes[] executions)',
  args: [
    {
      value: ['0xdead'],
      populateDynamically: false,
    },
    {
      value: ['0x00'],
      populateDynamically: false,
    },
    {
      value: ['0xbeef'],
      populateDynamically: false,
    },
  ],
  value: '0x0',
  isNativeTransfer: false,
};

function buildTransferData(
  recipient: string = TRANSFER_RECIPIENT,
  amount = 1,
): Hex {
  return TOKEN_TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amount,
  ]) as Hex;
}

describe('Across Quotes', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const getSlippageMock = jest.mocked(getSlippage);
  const calculateGasCostMock = jest.mocked(calculateGasCost);

  const {
    messenger,
    estimateGasMock,
    findNetworkClientIdByChainIdMock,
    getDelegationTransactionMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          payStrategies: {
            across: {
              enabled: true,
              apiBase: 'https://test.across.to/api',
            },
          },
        },
      },
    });

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '4.0',
    });

    calculateGasCostMock.mockReturnValue({
      fiat: '4.56',
      human: '1.725',
      raw: '1725000000000000000',
      usd: '3.45',
    });

    getGasBufferMock.mockReturnValue(1.0);
    getSlippageMock.mockReturnValue(0.005);

    findNetworkClientIdByChainIdMock.mockReturnValue('mainnet');
    estimateGasMock.mockResolvedValue({
      gas: '0x5208',
      simulationFails: undefined,
    });
  });

  describe('getAcrossQuotes', () => {
    it('fetches and normalizes quotes from Across', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe(TransactionPayStrategy.Across);
      expect(result[0].estimatedDuration).toBe(300);
      expect(result[0].fees.provider.usd).toBe('0.0001');
      expect(result[0].fees.impact?.usd).toBe('0.0001');
      expect(result[0].fees.impactRatio).toBe('0.25');
    });

    it('attaches quote latency metrics', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1250)
        .mockReturnValue(1250);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.metrics?.latency).toBe(250);

      nowSpy.mockRestore();
    });

    it('filters out requests with zero target amount', async () => {
      const result = await getAcrossQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toStrictEqual([]);
      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('throws wrapped error when quote fetching fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(/Failed to fetch Across quotes/u);
    });

    it('uses exactInput trade type for max amount quotes', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('tradeType')).toBe('exactInput');
      expect(params.get('amount')).toBe(QUOTE_REQUEST_MOCK.sourceTokenAmount);
    });

    it('uses exactOutput trade type for non-max amount quotes', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('tradeType')).toBe('exactOutput');
      expect(params.get('amount')).toBe(QUOTE_REQUEST_MOCK.targetAmountMinimum);
    });

    it('includes slippage when available', async () => {
      getSlippageMock.mockReturnValue(0.02);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('slippage')).toBe('0.02');
    });

    it('includes integrator ID and app fee when configured', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                integratorId: 'test-integrator',
                appFee: '0.01',
                appFeeRecipient: '0xfee',
              },
            },
          },
        },
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('integratorId')).toBe('test-integrator');
      expect(params.get('appFee')).toBe('0.01');
      expect(params.get('appFeeRecipient')).toBe('0xfee');
    });

    it('includes API key header when configured', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiKey: 'test-api-key',
                apiKeyHeader: 'X-Api-Key',
                apiKeyPrefix: 'Bearer',
              },
            },
          },
        },
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [, options] = successfulFetchMock.mock.calls[0];

      expect(options?.headers).toStrictEqual(
        expect.objectContaining({
          'X-Api-Key': 'Bearer test-api-key',
        }),
      );
    });

    it('uses default Authorization header for API key when no header specified', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiKey: 'test-api-key',
              },
            },
          },
        },
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [, options] = successfulFetchMock.mock.calls[0];

      expect(options?.headers).toStrictEqual(
        expect.objectContaining({
          Authorization: 'test-api-key',
        }),
      );
    });

    it('uses transfer recipient for token transfer transactions', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            data: transferData,
          },
        },
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(TRANSFER_RECIPIENT.toLowerCase());
    });

    it('uses transfer recipient from nested transactions', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [{ data: transferData }],
        } as TransactionMeta,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(TRANSFER_RECIPIENT.toLowerCase());
    });

    it('includes actions for delegation transactions', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            data: '0xabc' as Hex,
          },
        },
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(options?.method).toBe('POST');
      expect(body.actions).toHaveLength(2);
    });

    it('builds native token transfer action for native target token', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetTokenAddress: NATIVE_TOKEN_ADDRESS,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            data: '0xabc' as Hex,
          },
        },
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(body.actions[0]).toStrictEqual(
        expect.objectContaining({
          isNativeTransfer: true,
          value: QUOTE_REQUEST_MOCK.targetAmountMinimum,
        }),
      );
    });

    it('builds ERC20 transfer action for token target', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            data: '0xabc' as Hex,
          },
        },
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(body.actions[0]).toStrictEqual(
        expect.objectContaining({
          isNativeTransfer: false,
          target: QUOTE_REQUEST_MOCK.targetTokenAddress,
          functionSignature: 'function transfer(address to, uint256 amount)',
        }),
      );
    });

    it('throws when delegation requires authorization list', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        authorizationList: [{ address: '0xabc' as Hex }],
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              from: FROM_MOCK,
              data: '0xabc' as Hex,
            },
          },
        }),
      ).rejects.toThrow(/Across does not support type-4\/EIP-7702/u);
    });

    it('throws when actions present for max amount quotes', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              from: FROM_MOCK,
              data: '0xabc' as Hex,
            },
          },
        }),
      ).rejects.toThrow(
        /Max amount quotes do not support included transactions/u,
      );
    });

    it('calculates dust from expected vs minimum output', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: '200',
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(parseFloat(result[0].dust.usd)).toBeGreaterThan(0);
    });

    it('uses swap impact fee when provided', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          fees: {
            ...QUOTE_MOCK.fees,
            swapImpact: { amountUsd: '0.5' },
          },
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.impact?.usd).toBe('0.5');
      expect(result[0].fees.impact?.fiat).toBe('1');
      expect(result[0].fees.provider.usd).toBe('0.5');
      expect(result[0].fees.provider.fiat).toBe('1');
    });

    it('returns undefined impact when expected output is zero', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: '0',
          minOutputAmount: '0',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.impact).toBeUndefined();
      expect(result[0].fees.impactRatio).toBeUndefined();
    });

    it('normalizes negative impact to zero', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: '100',
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.impact?.usd).toBe('0');
      expect(result[0].fees.impact?.fiat).toBe('0');
      expect(result[0].fees.impactRatio).toBe('0');
    });

    it('uses zero for estimated duration when not provided', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedFillTime: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].estimatedDuration).toBe(0);
    });

    it('handles missing destination gas fee', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          fees: {
            total: { amountUsd: '1.23' },
          },
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.targetNetwork.usd).toBe('0');
    });

    it('handles missing input amount', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          inputAmount: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].sourceAmount.raw).toBe('0');
    });

    it('uses fallback gas estimate when estimation fails', async () => {
      estimateGasMock.mockRejectedValue(new Error('Gas estimation failed'));

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toHaveLength(1);
    });

    it('applies gas buffer to estimated gas', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            gasBuffer: {
              default: 1.5,
            },
            payStrategies: {
              across: { enabled: true },
            },
          },
        },
      });

      getGasBufferMock.mockReturnValue(1.5);

      estimateGasMock.mockResolvedValue({
        gas: '0x10000',
        simulationFails: undefined,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toHaveLength(1);
    });

    it('handles missing expected output amount', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: undefined,
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount.raw).toBe('150');
    });

    it('handles missing min output amount', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: undefined,
          minOutputAmount: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount.raw).toBe(
        QUOTE_REQUEST_MOCK.targetAmountMinimum,
      );
    });

    it('handles missing target amount minimum', async () => {
      const request = {
        ...QUOTE_REQUEST_MOCK,
        targetAmountMinimum: undefined,
      } as unknown as QuoteRequest;

      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: undefined,
          minOutputAmount: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [request],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount.raw).toBe('0');
      expect(result[0].fees.impact).toBeUndefined();
    });

    it('uses from address as recipient when no transfer data', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(FROM_MOCK);
    });

    it('includes delegation value in action when present', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        action: {
          ...DELEGATION_ACTION_MOCK,
          value: '0x123',
        },
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x123' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            from: FROM_MOCK,
            data: '0xabc' as Hex,
          },
        },
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(body.actions[1].value).toBe('0x123');
    });

    it('throws when delegation action is missing', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              from: FROM_MOCK,
              data: '0xabc' as Hex,
            },
          },
        }),
      ).rejects.toThrow(/Delegation action missing/u);
    });

    it('uses nested transaction transfer recipient when available', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            { data: transferData },
            { data: '0xbeef' as Hex },
          ],
          txParams: {
            from: FROM_MOCK,
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(TRANSFER_RECIPIENT.toLowerCase());
    });

    it('omits slippage param when slippage is undefined', async () => {
      getSlippageMock.mockReturnValue(undefined as never);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.has('slippage')).toBe(false);
    });

    it('throws when source token fiat rate not found', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined as never);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(/Failed to fetch Across quotes/u);
    });

    it('uses source fiat rate as fallback for target when not found', async () => {
      getTokenFiatRateMock
        .mockReturnValueOnce({
          usdRate: '2.0',
          fiatRate: '4.0',
        })
        .mockReturnValueOnce(undefined as never);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toHaveLength(1);
    });

    it('extracts recipient from token transfer in nested transactions array', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            { data: '0xother' as Hex },
            { data: transferData },
          ],
          txParams: {
            from: FROM_MOCK,
            data: '0xnonTransferData' as Hex,
          },
        } as TransactionMeta,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(TRANSFER_RECIPIENT.toLowerCase());
    });

    it('handles nested transactions with undefined data', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

      getDelegationTransactionMock.mockResolvedValue({
        action: DELEGATION_ACTION_MOCK,
        data: '0xdead' as Hex,
        to: '0xde1e9a7e' as Hex,
        value: '0x0' as Hex,
      });

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [{ to: '0xabc' as Hex }, { data: transferData }],
          txParams: {
            from: FROM_MOCK,
            data: '0xnonTransferData' as Hex,
          },
        } as TransactionMeta,
      });

      const [url] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;

      expect(params.get('recipient')).toBe(TRANSFER_RECIPIENT.toLowerCase());
    });
  });
});
