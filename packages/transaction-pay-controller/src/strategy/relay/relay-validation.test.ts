import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFeatureFlags } from '../../utils/feature-flags';
import { rpcRequest } from '../../utils/provider';
import {
  SentinelSimulationError,
  simulateTransactions,
} from '../../utils/sentinel';
import { getLiveTokenBalance } from '../../utils/token';
import { isQuoteValidationError } from '../../utils/validation';
import {
  RelayQuoteValidationError,
  validateRelayQuoteSupport,
} from './relay-validation';
import type { RelayQuote } from './types';

jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual<typeof import('../../utils/feature-flags')>(
    '../../utils/feature-flags',
  ),
  getFeatureFlags: jest.fn(),
}));
jest.mock('../../utils/provider', () => ({
  ...jest.requireActual<typeof import('../../utils/provider')>(
    '../../utils/provider',
  ),
  rpcRequest: jest.fn(),
}));
jest.mock('../../utils/sentinel', () => ({
  ...jest.requireActual<typeof import('../../utils/sentinel')>(
    '../../utils/sentinel',
  ),
  simulateTransactions: jest.fn(),
}));
jest.mock('../../utils/token', () => ({
  ...jest.requireActual<typeof import('../../utils/token')>(
    '../../utils/token',
  ),
  getLiveTokenBalance: jest.fn(),
}));

const erc20Interface = new Interface(abiERC20);
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const RECIPIENT_MOCK = '0x3333333333333333333333333333333333333333' as Hex;
const CHAIN_ID_MOCK = '0x38' as Hex;
const EIP7702_DELEGATOR_ADDRESS =
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' as Hex;
const TRANSACTION_MOCK = {
  id: 'tx-id',
  chainId: CHAIN_ID_MOCK,
  txParams: { from: FROM_MOCK },
} as TransactionMeta;
const TRANSACTION_WITH_TO_MOCK = {
  ...TRANSACTION_MOCK,
  txParams: { ...TRANSACTION_MOCK.txParams, to: TOKEN_ADDRESS_MOCK },
} as TransactionMeta;

describe('Relay quote simulation validation', () => {
  const getFeatureFlagsMock = jest.mocked(getFeatureFlags);
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);
  const rpcRequestMock = jest.mocked(rpcRequest);
  const simulateTransactionsMock = jest.mocked(simulateTransactions);
  const {
    findNetworkClientIdByChainIdMock,
    getControllerStateMock,
    getDelegationTransactionMock,
    getPaymentOverrideDataMock,
    getRemoteFeatureFlagControllerStateMock,
    messenger,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();
    findNetworkClientIdByChainIdMock.mockReturnValue('network-client-id');
    getFeatureFlagsMock.mockReturnValue({
      relayFallbackGas: { max: 123 },
    } as never);
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      remoteFeatureFlags: {},
    } as never);
    getControllerStateMock.mockReturnValue({ transactionData: {} } as never);
    getLiveTokenBalanceMock.mockResolvedValue('1000');
    rpcRequestMock.mockResolvedValue({} as never);
    simulateTransactionsMock.mockResolvedValue({ transactions: [{}] });
  });

  it('simulates the normalized relay transaction when live balance covers the quote', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
      transactions: [
        expect.objectContaining({
          data: expect.stringMatching(/^0xa9059cbb/u),
          from: FROM_MOCK,
          gas: '0x7b',
          to: TOKEN_ADDRESS_MOCK,
        }),
      ],
      withCallTrace: true,
      withGas: true,
      withLogs: true,
    });
  });

  it('skips validation for Hyperliquid source quotes', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isHyperliquidSource: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
    expect(simulateTransactionsMock).not.toHaveBeenCalled();
  });

  it('skips validation for Polymarket deposit wallet quotes', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isPolymarketDepositWallet: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
    expect(simulateTransactionsMock).not.toHaveBeenCalled();
  });

  it('throws an insufficient source balance error when source amount exceeds live balance', async () => {
    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({
          sourceAmountRaw: '1500',
          transferAmountRaw: '500',
        }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'Insufficient quote source amount: required 1500, balance 1000',
    });
    expect(simulateTransactionsMock).not.toHaveBeenCalled();
  });

  it('throws an insufficient source balance error when decoded transfer exceeds live balance', async () => {
    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({
          sourceAmountRaw: '500',
          transferAmountRaw: '1500',
        }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'Insufficient balance for decoded quote amount: required 1500, balance 1000',
    });
    expect(simulateTransactionsMock).not.toHaveBeenCalled();
  });

  it('throws a balance unavailable error when live balance retrieval fails', async () => {
    getLiveTokenBalanceMock.mockRejectedValue(new Error('RPC timeout'));

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'Cannot validate payment token balance - RPC timeout',
    });
  });

  it('throws a simulation error when Sentinel returns a transaction error', async () => {
    simulateTransactionsMock.mockResolvedValue({
      transactions: [{ error: 'ERC20: transfer amount exceeds balance' }],
    });

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'ERC20: transfer amount exceeds balance',
    });
  });

  it('uses debug_traceCall fallback details when Sentinel returns a generic simulation error', async () => {
    simulateTransactionsMock.mockResolvedValue({
      transactions: [{ error: 'Quote simulation failed - execution reverted' }],
    });
    rpcRequestMock.mockResolvedValueOnce({
      error: 'ERC20: transfer amount exceeds balance',
    } as never);

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'ERC20: transfer amount exceeds balance',
    });

    expect(rpcRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: CHAIN_ID_MOCK,
        method: 'debug_traceCall',
        options: { preferInfura: true },
      }),
    );
  });

  it('does not prefer Infura for fallback details when the chain is feature-flag excluded', async () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          excludeChainIdsFromInfura: [CHAIN_ID_MOCK],
        },
      },
    } as never);
    simulateTransactionsMock.mockResolvedValue({
      transactions: [{ error: 'Quote simulation failed - execution reverted' }],
    });
    rpcRequestMock.mockResolvedValueOnce({
      error: 'route reverted',
    } as never);

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'route reverted',
    });

    expect(rpcRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'debug_traceCall',
        options: { preferInfura: false },
      }),
    );
  });

  it('validates the quote with debug_traceCall when Sentinel does not support the chain', async () => {
    simulateTransactionsMock.mockRejectedValue(
      new SentinelSimulationError(
        `Simulation is not supported for chain ${CHAIN_ID_MOCK}`,
      ),
    );
    rpcRequestMock.mockResolvedValueOnce({} as never);

    await validateRelayQuote({
      messenger,
      quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
      transaction: TRANSACTION_MOCK,
    });

    expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    expect(rpcRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'debug_traceCall' }),
    );
  });

  it('validates the quote with eth_estimateGas when Sentinel and debug_traceCall are unavailable', async () => {
    simulateTransactionsMock.mockRejectedValue(
      new SentinelSimulationError(
        `Simulation is not supported for chain ${CHAIN_ID_MOCK}`,
      ),
    );
    rpcRequestMock
      .mockRejectedValueOnce(new Error('method debug_traceCall not supported'))
      .mockResolvedValueOnce({} as never);

    await validateRelayQuote({
      messenger,
      quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
      transaction: TRANSACTION_MOCK,
    });

    expect(rpcRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'eth_estimateGas' }),
    );
  });

  it('does not reject multi-transaction quotes when Sentinel does not support the chain', async () => {
    simulateTransactionsMock.mockRejectedValue(
      new SentinelSimulationError(
        `Simulation is not supported for chain ${CHAIN_ID_MOCK}`,
      ),
    );

    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        sourceAmountRaw: '500',
        transactionCount: 2,
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(rpcRequestMock).not.toHaveBeenCalled();
  });

  it('uses eth_estimateGas fallback details when debug_traceCall is unavailable', async () => {
    simulateTransactionsMock.mockResolvedValue({
      transactions: [{ error: 'Quote simulation failed - execution reverted' }],
    });
    rpcRequestMock
      .mockRejectedValueOnce(new Error('method debug_traceCall not supported'))
      .mockRejectedValueOnce(new Error('execution reverted: route reverted'));

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'execution reverted: route reverted',
    });

    expect(rpcRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'eth_estimateGas' }),
    );
  });

  it('returns raw nested route balance reverts as simulation failures', async () => {
    simulateTransactionsMock.mockResolvedValue({
      transactions: [
        { error: 'execution reverted: ERC20: transfer amount exceeds balance' },
      ],
    });

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({
          sourceAmountRaw: '500',
          stepData: '0xf9e4bab4',
          transferAmountRaw: '500',
        }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError:
        'execution reverted: ERC20: transfer amount exceeds balance',
    });
  });

  it('returns raw generic insufficient funds simulation errors as simulation failures', async () => {
    simulateTransactionsMock.mockResolvedValue({
      transactions: [{ error: 'insufficient funds for gas * price + value' }],
    });

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'insufficient funds for gas * price + value',
    });
  });

  it('simulates Relay execute quotes with an EIP-7702 account override', async () => {
    const authorizationAddress =
      '0x4444444444444444444444444444444444444444' as Hex;
    getDelegationTransactionMock.mockResolvedValue({
      authorizationList: [
        {
          address: authorizationAddress,
          chainId: CHAIN_ID_MOCK,
          nonce: '0x1',
          r: '0x1' as Hex,
          s: '0x2' as Hex,
          yParity: '0x0',
        },
      ],
      data: '0x1234' as Hex,
      to: '0x5555555555555555555555555555555555555555' as Hex,
      value: '0x0' as Hex,
    });

    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isExecute: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        overrides: {
          [FROM_MOCK.toLowerCase()]: {
            code: `0xef0100${EIP7702_DELEGATOR_ADDRESS.slice(2)}`,
          },
        },
        transactions: [
          expect.objectContaining({
            data: '0x1234',
            from: FROM_MOCK,
            to: '0x5555555555555555555555555555555555555555',
            value: '0x0',
          }),
        ],
      }),
    );
  });

  it('simulates Relay execute quotes without an account override when authorization list is absent', async () => {
    getDelegationTransactionMock.mockResolvedValue({
      data: '0x1234' as Hex,
      to: '0x5555555555555555555555555555555555555555' as Hex,
      value: '0',
    });

    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isExecute: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.not.objectContaining({ overrides: expect.any(Object) }),
    );
  });

  it('identifies relay quote validation errors', async () => {
    const error = new RelayQuoteValidationError('boom');

    expect(isQuoteValidationError(error)).toBe(true);
  });

  it('simulates is7702 quotes as a single batch execute transaction sent to the from address', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        is7702: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        transactions: [
          expect.objectContaining({
            from: FROM_MOCK,
            to: FROM_MOCK,
            value: '0x0',
          }),
        ],
      }),
    );
  });

  it('adds the first Relay gas limit to is7702 batch simulations when provided', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        gasLimits: [123],
        is7702: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        transactions: [expect.objectContaining({ gas: '0x7b' })],
      }),
    );
  });

  it('uses default call values for incomplete payment override calls in is7702 batch simulations', async () => {
    getPaymentOverrideDataMock.mockResolvedValue({
      calls: [{ from: FROM_MOCK }],
    } as never);

    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        is7702: true,
        paymentOverride: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        transactions: [expect.objectContaining({ to: FROM_MOCK })],
      }),
    );
  });

  it('sets mock7702From on is7702 simulations when the quote request has an authorization list', async () => {
    const authorizationEntry = {
      address: '0x4444444444444444444444444444444444444444' as Hex,
      chainId: CHAIN_ID_MOCK,
      nonce: '0x1' as Hex,
      r: '0x1' as Hex,
      s: '0x2' as Hex,
      yParity: '0x0' as Hex,
    };
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        is7702: true,
        requestAuthorizationList: [authorizationEntry],
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        overrides: {
          [FROM_MOCK.toLowerCase()]: {
            code: `0xef0100${EIP7702_DELEGATOR_ADDRESS.slice(2)}`,
          },
        },
      }),
    );
  });

  it('throws quote_authorization_invalid when Relay execute authorization list has an incomplete entry', async () => {
    getDelegationTransactionMock.mockResolvedValue({
      authorizationList: [
        {
          // address intentionally omitted to trigger validation failure
          chainId: CHAIN_ID_MOCK,
          nonce: '0x1',
          r: '0x1' as Hex,
          s: '0x2' as Hex,
          yParity: '0x0',
        },
      ],
      data: '0x1234' as Hex,
      to: '0x5555555555555555555555555555555555555555' as Hex,
      value: '0x0' as Hex,
    } as never);

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({
          isExecute: true,
          sourceAmountRaw: '500',
          transferAmountRaw: '500',
        }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: 'Relay execute authorization list is incomplete',
    });
  });

  it('rethrows non-simulation errors from simulateQuoteTransactions', async () => {
    simulateTransactionsMock.mockResolvedValue({ transactions: null as never });

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({ sourceAmountRaw: '500', transferAmountRaw: '500' }),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      validationError: expect.stringContaining('Cannot'),
    });
  });

  it('skips required source amount check for post-quote requests', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isPostQuote: true,
        sourceAmountRaw: '9999',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
  });

  it('skips decoded ERC-20 transfer check for native token source quotes', async () => {
    getLiveTokenBalanceMock.mockResolvedValue('500');

    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        sourceAmountRaw: '300',
        sourceTokenAddress: NATIVE_TOKEN_ADDRESS,
        transferAmountRaw: '300',
      }),
      transaction: TRANSACTION_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
  });

  it('defaults missing value and ignores missing data on prepended post-quote transactions', async () => {
    await validateRelayQuote({
      messenger,
      quote: buildQuote({
        isPostQuote: true,
        sourceAmountRaw: '500',
        transferAmountRaw: '500',
      }),
      transaction: TRANSACTION_WITH_TO_MOCK,
    });

    expect(simulateTransactionsMock).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            data: undefined,
            to: TOKEN_ADDRESS_MOCK,
            value: '0x0',
          }),
        ]),
      }),
    );
  });

  it('throws when the abort signal is already aborted before validation starts', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      validateRelayQuote({
        messenger,
        quote: buildQuote({
          sourceAmountRaw: '500',
          transferAmountRaw: '500',
        }),
        signal: controller.signal,
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Quote validation aborted');

    expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
  });
});

function buildQuote({
  isExecute = false,
  isHyperliquidSource,
  is7702 = false,
  isPostQuote = false,
  gasLimits = [],
  paymentOverride,
  isPolymarketDepositWallet,
  requestAuthorizationList,
  sourceAmountRaw,
  sourceTokenAddress = TOKEN_ADDRESS_MOCK,
  stepData,
  transactionCount = 1,
  transferAmountRaw,
}: {
  isExecute?: boolean;
  isHyperliquidSource?: boolean;
  is7702?: boolean;
  isPostQuote?: boolean;
  gasLimits?: number[];
  paymentOverride?: boolean;
  isPolymarketDepositWallet?: boolean;
  requestAuthorizationList?: {
    address: Hex;
    chainId: Hex;
    nonce: Hex;
    r: Hex;
    s: Hex;
    yParity: Hex;
  }[];
  sourceAmountRaw: string;
  sourceTokenAddress?: Hex;
  stepData?: Hex;
  transactionCount?: number;
  transferAmountRaw: string;
}): TransactionPayQuote<RelayQuote> {
  return {
    original: {
      details: {
        currencyIn: { currency: { chainId: Number(CHAIN_ID_MOCK) } },
        currencyOut: { currency: { chainId: 1 } },
      },
      metamask: { gasLimits, isExecute, is7702 },
      request: requestAuthorizationList
        ? { authorizationList: requestAuthorizationList }
        : {},
      steps: [
        {
          id: 'deposit',
          kind: 'transaction',
          requestId: 'request-id',
          items: Array.from({ length: transactionCount }, () => ({
            check: {
              endpoint: 'https://relay.test/status',
              method: 'GET',
            },
            data: {
              chainId: Number(CHAIN_ID_MOCK),
              data:
                stepData ??
                (erc20Interface.encodeFunctionData('transfer', [
                  RECIPIENT_MOCK,
                  transferAmountRaw,
                ]) as Hex),
              from: FROM_MOCK,
              maxFeePerGas: '1',
              maxPriorityFeePerGas: '1',
              to: TOKEN_ADDRESS_MOCK,
              value: '0',
            },
            status: 'complete',
          })),
        },
      ],
    } as RelayQuote,
    request: {
      from: FROM_MOCK,
      isHyperliquidSource,
      isPolymarketDepositWallet,
      isPostQuote,
      paymentOverride,
      sourceBalanceRaw: '1000',
      sourceChainId: CHAIN_ID_MOCK,
      sourceTokenAddress,
      sourceTokenAmount: sourceAmountRaw,
      targetAmountMinimum: '0',
      targetChainId: '0x1' as Hex,
      targetTokenAddress: '0x6666666666666666666666666666666666666666' as Hex,
    },
    sourceAmount: {
      fiat: '0',
      human: '0',
      raw: sourceAmountRaw,
      usd: '0',
    },
    strategy: TransactionPayStrategy.Relay,
  } as TransactionPayQuote<RelayQuote>;
}

async function validateRelayQuote({
  messenger,
  quote,
  signal,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  signal?: AbortSignal;
  transaction: TransactionMeta;
}): Promise<void> {
  const result = await validateRelayQuoteSupport({
    messenger,
    quotes: [quote],
    signal,
    transaction,
  });

  if (!result.isSupported) {
    throw new RelayQuoteValidationError(
      result.validationError ?? 'Relay quote is not supported',
    );
  }
}
