import { Interface } from '@ethersproject/abi';
import { successfulFetch } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getAcrossQuotes } from './across-quotes';
import type { AcrossSwapApprovalResponse } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { QuoteRequest, TransactionPayAction } from '../../types';
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
const APP_FEE_RECIPIENT = '0x1234567890123456789012345678901234567890' as Hex;
const DELEGATION_ACTION_MOCK: TransactionPayAction = {
  args: [],
  functionSignature: 'function claim()',
  isNativeTransfer: false,
  target: '0xdecafbaddecafbaddecafbaddecafbaddecafbad' as Hex,
  value: '0',
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
    getDelegationTransactionMock.mockResolvedValue({
      data: '0x' as Hex,
      to: FROM_MOCK,
      value: '0x0' as Hex,
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
      expect(result[0].fees.provider.usd).toBe('1.23');
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

    it('filters out non-max requests with missing target amount', async () => {
      const result = await getAcrossQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: undefined,
          } as unknown as QuoteRequest,
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

    it('includes app fee params when metaMaskFee config is valid', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: APP_FEE_RECIPIENT,
              fee: '0.001',
            },
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
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

      expect(params.get('appFee')).toBe('0.001');
      expect(params.get('appFeeRecipient')).toBe(APP_FEE_RECIPIENT);
    });

    it('omits app fee params when metaMaskFee config is invalid', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: '0x1234',
              fee: '0.001',
            },
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
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

      expect(params.has('appFee')).toBe(false);
      expect(params.has('appFeeRecipient')).toBe(false);
    });

    it('includes integratorId when configured', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                integratorId: 'metamask-test',
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

      expect(params.get('integratorId')).toBe('metamask-test');
    });

    it('uses POST actions when postActionsEnabled and delegation action is available', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                postActionsEnabled: true,
              },
            },
          },
        },
      });

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
            data: '0xabc' as Hex,
            from: FROM_MOCK,
          },
        } as TransactionMeta,
      });

      const [url, options] = successfulFetchMock.mock.calls[0];
      const params = new URL(url as string).searchParams;
      const body = JSON.parse((options?.body as string) ?? '{}') as {
        actions: TransactionPayAction[];
      };

      expect(params.get('recipient')).toBe(FROM_MOCK);
      expect(options).toMatchObject({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(body.actions).toHaveLength(2);
      expect(body.actions[0]).toMatchObject({
        args: [
          { populateDynamically: false, value: FROM_MOCK },
          {
            populateDynamically: false,
            value: QUOTE_REQUEST_MOCK.targetAmountMinimum,
          },
        ],
        functionSignature: 'function transfer(address to, uint256 amount)',
        isNativeTransfer: false,
        target: QUOTE_REQUEST_MOCK.targetTokenAddress,
        value: '0',
      });
      expect(body.actions[1]).toStrictEqual(DELEGATION_ACTION_MOCK);
    });

    it('throws when postActionsEnabled and max amount request needs actions', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                postActionsEnabled: true,
              },
            },
          },
        },
      });

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
              data: '0xabc' as Hex,
              from: FROM_MOCK,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(
        /Max amount quotes do not support included transactions/u,
      );

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('throws when postActionsEnabled but delegation action is missing', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                postActionsEnabled: true,
              },
            },
          },
        },
      });

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
              data: '0xabc' as Hex,
              from: FROM_MOCK,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(/Across only supports transfer-style/u);

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('builds native transfer action when target token is native', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                postActionsEnabled: true,
              },
            },
          },
        },
      });

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
            data: '0xabc' as Hex,
            from: FROM_MOCK,
          },
        } as TransactionMeta,
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse((options?.body as string) ?? '{}') as {
        actions: TransactionPayAction[];
      };

      expect(body.actions[0]).toMatchObject({
        args: [],
        functionSignature: '',
        isNativeTransfer: true,
        populateCallValueDynamically: false,
        target: FROM_MOCK,
        value: QUOTE_REQUEST_MOCK.targetAmountMinimum,
      });
    });

    it('uses POST with empty actions for transfer flows when postActionsEnabled', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                enabled: true,
                apiBase: 'https://test.across.to/api',
                postActionsEnabled: true,
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
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: buildTransferData(TRANSFER_RECIPIENT),
            from: FROM_MOCK,
          },
        } as TransactionMeta,
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse((options?.body as string) ?? '{}') as {
        actions: TransactionPayAction[];
      };

      expect(options).toMatchObject({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(body.actions).toStrictEqual([]);
    });

    it('uses POST approval request with empty actions by default', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      const [, options] = successfulFetchMock.mock.calls[0];
      const body = JSON.parse((options?.body as string) ?? '{}') as {
        actions: TransactionPayAction[];
      };

      expect(options).toMatchObject({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(body.actions).toStrictEqual([]);
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

    it('throws when destination flow is not transfer-style', async () => {
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
      ).rejects.toThrow(/Across only supports transfer-style/u);
    });

    it('throws when txParams include authorization list', async () => {
      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              from: FROM_MOCK,
              data: '0xabc' as Hex,
              authorizationList: [{ address: '0xabc' as Hex }],
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(/Across does not support type-4\/EIP-7702/u);

      expect(successfulFetchMock).not.toHaveBeenCalled();
      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('throws when delegation requires authorization list', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        authorizationList: [{ address: '0xabc' as Hex }],
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
          } as TransactionMeta,
        }),
      ).rejects.toThrow(/Across does not support type-4\/EIP-7702/u);

      expect(successfulFetchMock).not.toHaveBeenCalled();
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

    it('uses total fee as provider fee when provided', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          fees: {
            ...QUOTE_MOCK.fees,
            total: { amountUsd: '0.5' },
          },
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider.usd).toBe('0.5');
      expect(result[0].fees.provider.fiat).toBe('1');
    });

    it('uses input-output delta when provider fee is not available', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          fees: {
            destinationGas: { amountUsd: '0.67' },
            originGas: { amountUsd: '0.45' },
          },
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider.usd).toBe('1.9996');
      expect(result[0].fees.provider.fiat).toBe('3.9992');
    });

    it('uses zero provider fee when expected output is zero and total fee is missing', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: '0',
          fees: {
            destinationGas: { amountUsd: '0.67' },
            originGas: { amountUsd: '0.45' },
          },
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider.usd).toBe('0');
      expect(result[0].fees.provider.fiat).toBe('0');
      expect(result[0].dust.usd).toBe('0');
    });

    it('uses zero provider fee when expected output is worth more than input', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: '2000000',
          fees: {
            destinationGas: { amountUsd: '0.67' },
            originGas: { amountUsd: '0.45' },
          },
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider.usd).toBe('0');
      expect(result[0].fees.provider.fiat).toBe('0');
    });

    it('falls back to zero minimum output when quote and request minimums are missing', async () => {
      const request = {
        ...QUOTE_REQUEST_MOCK,
        isMaxAmount: true,
        targetAmountMinimum: undefined,
      } as unknown as QuoteRequest;

      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          minOutputAmount: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [request],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].dust.usd).toBe('0.0004');
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
      expect(calculateGasCostMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          gas: 900000,
        }),
      );
      expect(calculateGasCostMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          gas: 1500000,
          isMax: true,
        }),
      );
    });

    it('includes approval gas costs and gas limits when approval transactions exist', async () => {
      estimateGasMock
        .mockRejectedValueOnce(new Error('Approval gas estimation failed'))
        .mockResolvedValueOnce({
          gas: '0x7530',
          simulationFails: undefined,
        })
        .mockResolvedValueOnce({
          gas: '0x5208',
          simulationFails: undefined,
        });

      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          approvalTxns: [
            {
              chainId: 1,
              data: '0xaaaa' as Hex,
              to: '0xapprove1' as Hex,
              value: '0x1' as Hex,
            },
            {
              chainId: 1,
              data: '0xbbbb' as Hex,
              to: '0xapprove2' as Hex,
            },
          ],
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledTimes(6);
      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: '0x1',
          gas: 900000,
        }),
      );
      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: '0x1',
          gas: 30000,
        }),
      );
      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: '0x1',
          gas: 21000,
        }),
      );
      expect(result[0].original.gasLimits.approval).toStrictEqual([
        {
          estimate: 900000,
          max: 1500000,
        },
        {
          estimate: 30000,
          max: 30000,
        },
      ]);
      expect(result[0].original.gasLimits.swap).toStrictEqual({
        estimate: 21000,
        max: 21000,
      });
    });

    it('handles missing approval transactions in Across quote response', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          approvalTxns: undefined,
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.gasLimits.approval).toStrictEqual([]);
      expect(calculateGasCostMock).toHaveBeenCalledTimes(2);
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
          fees: {
            destinationGas: { amountUsd: '0.67' },
            originGas: { amountUsd: '0.45' },
          },
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount.raw).toBe('150');
      expect(result[0].dust.usd).toBe('0');
      expect(result[0].fees.provider.usd).toBe('0');
      expect(result[0].fees.provider.fiat).toBe('0');
    });

    it('uses total provider fee when expected output is missing', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...QUOTE_MOCK,
          expectedOutputAmount: undefined,
          fees: {
            ...QUOTE_MOCK.fees,
            total: { amountUsd: '0.5' },
          },
          minOutputAmount: '150',
        }),
      } as Response);

      const result = await getAcrossQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider.usd).toBe('0.5');
      expect(result[0].fees.provider.fiat).toBe('1');
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

    it('handles missing target amount minimum for max amount requests', async () => {
      const request = {
        ...QUOTE_REQUEST_MOCK,
        isMaxAmount: true,
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

    it('uses nested transaction transfer recipient when available', async () => {
      const transferData = buildTransferData(TRANSFER_RECIPIENT);

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

    it('uses txParams data when single nested transaction has no data', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: {
            ...TRANSACTION_META_MOCK,
            nestedTransactions: [{ to: '0xabc' as Hex }],
            txParams: {
              from: FROM_MOCK,
              data: '0xdeadbeef' as Hex,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(/Across only supports transfer-style/u);
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

    it('throws for multi-nested non-transfer calldata when txParams data is empty', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as Response);

      await expect(
        getAcrossQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: {
            ...TRANSACTION_META_MOCK,
            nestedTransactions: [
              { data: '0xdeadbeef' as Hex },
              { data: '0xcafebabe' as Hex },
            ],
            txParams: {
              from: FROM_MOCK,
              data: undefined,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(/Across only supports transfer-style/u);
    });
  });
});
