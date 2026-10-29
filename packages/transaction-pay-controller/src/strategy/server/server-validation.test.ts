import {
  generateEIP7702BatchTransaction,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { getMessengerMock } from '../../../tests/messenger-mock.js';
import type { TransactionPayQuote } from '../../types.js';
import { GasPaymentMode } from '../../utils/gas-payment.js';
import { buildPolymarketDepositWalletSimulation } from '../../utils/polymarket/withdraw.js';
import { QuoteError, validateQuoteExecution } from '../../utils/validation.js';
import {
  getServerExecuteDelegation,
  getServerGasPayment,
  getServerSubmitParams,
} from './server-submit.js';
import { validateServerQuotes } from './server-validation.js';
import type { ServerQuote } from './types.js';

vi.mock(import('./server-submit.js'));
vi.mock(import('../../utils/validation.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  validateQuoteExecution: vi.fn(),
}));
vi.mock(
  import('../../utils/polymarket/withdraw.js'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    buildPolymarketDepositWalletSimulation: vi.fn(),
  }),
);
vi.mock(import('@metamask/transaction-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateEIP7702BatchTransaction: vi.fn(),
}));

const FROM_MOCK = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const DELEGATOR_MOCK = '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' as Hex;
const DEPOSIT_DATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000003b9aca00' as Hex;

const TRANSACTION_STEP_MOCK = {
  chainId: 1,
  data: '0xstepdata' as Hex,
  to: '0xstepto' as Hex,
  type: 'transaction',
  value: '0',
} as const;

const SIGNATURE_STEP_MOCK = {
  post: { body: {}, endpoint: '', method: 'POST', signatureFormat: 'rsv' },
  sign: { domain: {}, primaryType: '', types: {}, value: {} },
  type: 'signature',
} as const;

const PARAMS_MOCK: TransactionParams[] = [
  {
    data: '0xapprove',
    from: FROM_MOCK,
    gas: '0x5208',
    maxFeePerGas: '0x1',
    maxPriorityFeePerGas: '0x2',
    to: '0xtoken',
    value: '0x0',
  },
  {
    data: '0xdeposit',
    from: FROM_MOCK,
    gas: '0x0',
    to: '0xprovider',
    value: '0x4d2',
  },
];

const TRANSACTION_MOCK = {
  id: 'tx-id',
  txParams: { from: FROM_MOCK },
} as TransactionMeta;

const PREDICT_WITHDRAW_TRANSACTION_MOCK = {
  id: 'tx-id',
  txParams: { from: FROM_MOCK },
  type: TransactionType.predictWithdraw,
} as TransactionMeta;

function buildQuote({
  original = {},
  request = {},
}: {
  original?: Partial<ServerQuote>;
  request?: Partial<TransactionPayQuote<ServerQuote>['request']>;
} = {}): TransactionPayQuote<ServerQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 30,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: '0', usd: '0' },
      sourceNetwork: {
        estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
        max: { fiat: '0', human: '0', raw: '0', usd: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      client: {
        gasLimits: [21000, 50000],
        is7702: false,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      },
      gasless: false,
      id: 'quote-id',
      provider: 'relay',
      steps: [TRANSACTION_STEP_MOCK],
      ...original,
    } as ServerQuote,
    request: {
      from: FROM_MOCK,
      sourceBalanceRaw: '1000',
      sourceChainId: CHAIN_ID_MOCK,
      sourceTokenAddress: '0xtoken',
      sourceTokenAmount: '100',
      targetAmountMinimum: '100',
      targetChainId: '0x2',
      targetTokenAddress: '0xtarget',
      ...request,
    },
    sourceAmount: { fiat: '0.1', human: '0.0001', raw: '100', usd: '0.1' },
    strategy: 'server' as never,
    targetAmount: { fiat: '0.1', usd: '0.1' },
  };
}

describe('validateServerQuotes', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  const buildPolymarketDepositWalletSimulationMock = vi.mocked(
    buildPolymarketDepositWalletSimulation,
  );
  const generateEIP7702BatchTransactionMock = vi.mocked(
    generateEIP7702BatchTransaction,
  );
  const getServerExecuteDelegationMock = vi.mocked(getServerExecuteDelegation);
  const getServerGasPaymentMock = vi.mocked(getServerGasPayment);
  const getServerSubmitParamsMock = vi.mocked(getServerSubmitParams);
  const validateQuoteExecutionMock = vi.mocked(validateQuoteExecution);

  function setFeatureFlags(featureFlags: Record<string, unknown>): void {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: featureFlags as never,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();

    setFeatureFlags({
      confirmations_eip_7702: {
        contracts: {
          [CHAIN_ID_MOCK]: [{ address: DELEGATOR_MOCK, signature: '0x' }],
        },
      },
      confirmations_pay_extended: {
        payStrategies: { server: { validationEnabled: { default: true } } },
      },
    });

    generateEIP7702BatchTransactionMock.mockReturnValue({
      data: '0xbatchdata',
      to: FROM_MOCK,
      value: '0x0',
    });
    getServerGasPaymentMock.mockReturnValue({
      mode: GasPaymentMode.Native,
    });
    getServerSubmitParamsMock.mockResolvedValue(PARAMS_MOCK);
    validateQuoteExecutionMock.mockResolvedValue(undefined);
  });

  it('does nothing when validation is disabled', async () => {
    setFeatureFlags({});

    await validateServerQuotes({
      messenger,
      quotes: [buildQuote()],
      transaction: TRANSACTION_MOCK,
    });

    expect(getServerSubmitParamsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });

  it('simulates each transaction separately when not using a 7702 batch', async () => {
    const quote = buildQuote();
    const abortController = new AbortController();

    await validateServerQuotes({
      messenger,
      quotes: [quote],
      signal: abortController.signal,
      transaction: TRANSACTION_MOCK,
    });

    expect(getServerSubmitParamsMock).toHaveBeenCalledWith(
      quote,
      messenger,
      TRANSACTION_MOCK,
    );

    expect(validateQuoteExecutionMock).toHaveBeenCalledWith({
      messenger,
      quote,
      signal: abortController.signal,
      simulation: {
        transactions: [
          {
            data: '0xapprove',
            from: FROM_MOCK,
            gas: '0x5208',
            maxFeePerGas: '0x1',
            maxPriorityFeePerGas: '0x2',
            to: '0xtoken',
            value: '0x0',
          },
          {
            data: '0xdeposit',
            from: FROM_MOCK,
            maxFeePerGas: undefined,
            maxPriorityFeePerGas: undefined,
            to: '0xprovider',
            value: '0x4d2',
          },
        ],
      },
    });
  });

  it('simulates a 7702 batch with an authorization and no gas limit', async () => {
    const quote = buildQuote({
      original: {
        client: {
          gasLimits: [71000],
          is7702: true,
          maxFeePerGas: undefined,
          maxPriorityFeePerGas: undefined,
        },
      },
    });

    await validateServerQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
    });

    expect(generateEIP7702BatchTransactionMock).toHaveBeenCalledWith(
      FROM_MOCK,
      [
        { data: '0xapprove', to: '0xtoken', value: '0x0' },
        { data: '0xdeposit', to: '0xprovider', value: '0x4d2' },
      ],
    );

    expect(
      validateQuoteExecutionMock.mock.calls[0][0].simulation,
    ).toStrictEqual({
      transactions: [
        {
          authorizationList: [{ address: DELEGATOR_MOCK, from: FROM_MOCK }],
          data: '0xbatchdata',
          from: FROM_MOCK,
          to: FROM_MOCK,
          value: '0x0',
        },
      ],
    });
  });

  it('simulates a single transaction directly even when 7702', async () => {
    getServerSubmitParamsMock.mockResolvedValue([PARAMS_MOCK[0]]);

    const quote = buildQuote({
      original: {
        client: {
          gasLimits: [21000],
          is7702: true,
          maxFeePerGas: undefined,
          maxPriorityFeePerGas: undefined,
        },
      },
    });

    await validateServerQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
    });

    expect(generateEIP7702BatchTransactionMock).not.toHaveBeenCalled();
    expect(
      validateQuoteExecutionMock.mock.calls[0][0].simulation.transactions,
    ).toHaveLength(1);
  });

  it('simulates the delegation when the quote is executed gaslessly', async () => {
    getServerGasPaymentMock.mockReturnValue({
      mode: GasPaymentMode.Delegation,
    });

    getServerExecuteDelegationMock.mockResolvedValue({
      authorizationList: [
        {
          address: DELEGATOR_MOCK,
          chainId: CHAIN_ID_MOCK,
          nonce: '0x1',
          r: '0x1',
          s: '0x2',
          yParity: '0x1',
        },
      ],
      data: '0xredeem',
      to: '0xdelegationmanager',
      value: '0x0',
    });

    const quote = buildQuote({ original: { gasless: true } });

    await validateServerQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
    });

    expect(getServerExecuteDelegationMock).toHaveBeenCalledWith(
      quote,
      PARAMS_MOCK,
      messenger,
      TRANSACTION_MOCK,
    );

    expect(
      validateQuoteExecutionMock.mock.calls[0][0].simulation,
    ).toStrictEqual({
      transactions: [
        {
          authorizationList: [{ address: DELEGATOR_MOCK, from: FROM_MOCK }],
          data: '0xredeem',
          from: FROM_MOCK,
          to: '0xdelegationmanager',
          value: '0x0',
        },
      ],
    });
  });

  it('simulates the unwrap batch for a deposit wallet withdraw', async () => {
    const simulation = {
      transactions: [{ data: '0xunwrap' as Hex, from: FROM_MOCK }],
    };

    buildPolymarketDepositWalletSimulationMock.mockResolvedValue(simulation);

    const quote = buildQuote({
      original: {
        steps: [{ ...TRANSACTION_STEP_MOCK, data: DEPOSIT_DATA_MOCK }],
      },
      request: { isPolymarketDepositWallet: true, isPostQuote: true },
    });

    await validateServerQuotes({
      messenger,
      quotes: [quote],
      transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
    });

    expect(buildPolymarketDepositWalletSimulationMock).toHaveBeenCalledWith({
      depositData: DEPOSIT_DATA_MOCK,
      from: FROM_MOCK,
      messenger,
      sourceAmountRaw: '100',
    });
    expect(getServerSubmitParamsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock.mock.calls[0][0].simulation).toBe(
      simulation,
    );
  });

  it.each([
    {
      name: 'Hyperliquid source quotes',
      quote: buildQuote({ request: { isHyperliquidSource: true } }),
      transaction: TRANSACTION_MOCK,
    },
    {
      name: 'legacy Safe Predict withdraws',
      quote: buildQuote({ request: { isPostQuote: true } }),
      transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
    },
    {
      name: 'signature-only quotes',
      quote: buildQuote({
        original: { steps: [SIGNATURE_STEP_MOCK] } as Partial<ServerQuote>,
      }),
      transaction: TRANSACTION_MOCK,
    },
  ])('skips $name', async ({ quote, transaction }) => {
    await validateServerQuotes({
      messenger,
      quotes: [quote],
      transaction,
    });

    expect(getServerSubmitParamsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });

  it('validates the remaining quotes when one is skipped', async () => {
    await validateServerQuotes({
      messenger,
      quotes: [
        buildQuote({ request: { isHyperliquidSource: true } }),
        buildQuote(),
      ],
      transaction: TRANSACTION_MOCK,
    });

    expect(validateQuoteExecutionMock).toHaveBeenCalledTimes(1);
  });

  it('wraps simulation build errors as simulation failures', async () => {
    getServerSubmitParamsMock.mockRejectedValue(new Error('build failed'));

    await expect(
      validateServerQuotes({
        messenger,
        quotes: [buildQuote()],
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      info: {
        detail: ['build failed'],
        message: 'Quote simulation failed',
        reason: 'simulation-failed',
      },
    });
  });

  it('attaches all quotes to insufficient source balance errors', async () => {
    validateQuoteExecutionMock.mockRejectedValue(
      new QuoteError({
        message: 'Insufficient source balance for quote',
        reason: 'insufficient-source-balance',
      }),
    );

    const quotes = [buildQuote(), buildQuote()];

    const error = await validateServerQuotes({
      messenger,
      quotes,
      transaction: TRANSACTION_MOCK,
    }).catch((caughtError: unknown) => caughtError);

    expect((error as QuoteError).quotes).toStrictEqual(quotes);
  });

  it('rethrows errors unchanged when aborted', async () => {
    const abortController = new AbortController();
    const abortError = new Error('Quote validation aborted');

    validateQuoteExecutionMock.mockImplementation(async () => {
      abortController.abort();
      throw abortError;
    });

    await expect(
      validateServerQuotes({
        messenger,
        quotes: [buildQuote()],
        signal: abortController.signal,
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toBe(abortError);
  });
});
