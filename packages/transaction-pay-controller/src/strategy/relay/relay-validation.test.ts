import {
  generateEIP7702BatchTransaction,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type { TransactionPayQuote } from '../../types.js';
import { QuoteError } from '../../utils/validation.js';
import { getRelayExecuteRequest } from './relay-submit-execute.js';
import { getRelaySubmitCalls } from './relay-submit.js';
import { validateRelayQuotes } from './relay-validation.js';
import type { RelayQuote } from './types.js';

jest.mock('./relay-submit');
jest.mock('./relay-submit-execute');
jest.mock('../../utils/validation', () => ({
  ...jest.requireActual('../../utils/validation'),
  validateQuoteExecution: jest.fn(),
}));
jest.mock('@metamask/transaction-controller', () => ({
  ...jest.requireActual('@metamask/transaction-controller'),
  generateEIP7702BatchTransaction: jest.fn(),
}));

const { validateQuoteExecution } = jest.requireMock<
  typeof import('../../utils/validation')
>('../../utils/validation');

const FROM_MOCK = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const REFUND_TO_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const DEPOSIT_WALLET_MOCK =
  '0x2222222222222222222222222222222222222222' as Hex;
const REQUEST_ID_MOCK = '0xreqid1234' as string;
const CHAIN_ID_MOCK = '0x1' as Hex;
const TOKEN_ADDRESS_MOCK = '0xtoken' as Hex;

// transfer(0x1234...7890, 1000000) encoded calldata; the recipient is decoded
// as the Relay deposit address for the deposit-wallet unwrap.
const TRANSFER_CALLDATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000003b9aca00' as Hex;

const DEPOSIT_STEP_MOCK = {
  requestId: REQUEST_ID_MOCK,
  id: 'deposit',
  kind: 'transaction',
  items: [],
};

const PREDICT_WITHDRAW_TRANSACTION_MOCK = {
  id: 'tx-id',
  txParams: { from: FROM_MOCK },
  type: TransactionType.predictWithdraw,
} as TransactionMeta;

const PREDICT_WITHDRAW_TRANSACTION_WITH_NESTED_MOCK = {
  id: 'tx-id',
  txParams: {
    from: FROM_MOCK,
    to: '0xtoplevel' as Hex,
    data: '0xtopleveldata' as Hex,
    value: '0x0' as Hex,
  },
  type: TransactionType.predictWithdraw,
  nestedTransactions: [
    { to: '0xsafeapprove' as Hex, data: '0xsafeapprovedata' as Hex },
    {
      to: '0xsafewithdraw' as Hex,
      data: '0xsafewithdrawdata' as Hex,
      value: '0x0' as Hex,
    },
  ],
} as TransactionMeta;

function buildQuote(
  overrides: Partial<TransactionPayQuote<RelayQuote>['request']> = {},
  originalOverrides: Partial<RelayQuote> = {},
): TransactionPayQuote<RelayQuote> {
  return {
    original: {
      metamask: { gasLimits: [], is7702: false, isExecute: false },
      request: {},
      steps: [
        {
          requestId: REQUEST_ID_MOCK,
          id: 'step-1',
          kind: 'transaction',
          items: [],
        },
      ],
      details: {
        currencyIn: { currency: { chainId: 1 } },
        currencyOut: { currency: { chainId: 2 } },
      },
      ...originalOverrides,
    } as unknown as RelayQuote,
    request: {
      from: FROM_MOCK,
      sourceChainId: CHAIN_ID_MOCK,
      sourceTokenAddress: TOKEN_ADDRESS_MOCK,
      sourceBalanceRaw: '1000',
      sourceTokenAmount: '100',
      targetAmountMinimum: '100',
      targetChainId: '0x2' as Hex,
      targetTokenAddress: '0xtarget' as Hex,
      ...overrides,
    },
    fees: {
      sourceNetwork: {
        estimate: { raw: '0', human: '0', usd: '0', fiat: '0' },
        max: { raw: '0', human: '0', usd: '0', fiat: '0' },
      },
      metaMask: { usd: '0', fiat: '0' },
      provider: { usd: '0', fiat: '0' },
      targetNetwork: { usd: '0', fiat: '0' },
    },
    sourceAmount: { raw: '100', human: '0.0001', usd: '0.1', fiat: '0.1' },
    targetAmount: { usd: '0.1', fiat: '0.1' },
    dust: { usd: '0', fiat: '0' },
    estimatedDuration: 30,
    strategy: 'relay' as never,
  } as TransactionPayQuote<RelayQuote>;
}

const TRANSACTION_MOCK = {
  id: 'tx-id',
  txParams: { from: FROM_MOCK },
} as TransactionMeta;

const getRelaySubmitCallsMock = jest.mocked(getRelaySubmitCalls);
const getRelayExecuteRequestMock = jest.mocked(getRelayExecuteRequest);
const validateQuoteExecutionMock = jest.mocked(validateQuoteExecution);
const generateEIP7702BatchTransactionMock = jest.mocked(
  generateEIP7702BatchTransaction,
);

describe('validateRelayQuotes', () => {
  const {
    messenger,
    getRemoteFeatureFlagControllerStateMock,
    polymarketGetDepositWalletAddressMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          payStrategies: { relay: { validationEnabled: true } },
        },
      },
    });

    getRelaySubmitCallsMock.mockResolvedValue({ calls: [] });
    getRelayExecuteRequestMock.mockResolvedValue(undefined as never);
    validateQuoteExecutionMock.mockResolvedValue(undefined);
    generateEIP7702BatchTransactionMock.mockReturnValue({
      data: '0xbatchdata' as Hex,
      to: '0xbatchto' as Hex,
      value: '0x0' as Hex,
    } as never);
  });

  it('skips validation for Hyperliquid source quotes', async () => {
    const quote = buildQuote({ isHyperliquidSource: true });

    await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
    });

    expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });

  it('validates Polymarket deposit wallet quotes by simulating the real approve + unwrap batch', async () => {
    polymarketGetDepositWalletAddressMock.mockResolvedValue(
      DEPOSIT_WALLET_MOCK,
    );

    const quote = buildQuote(
      { isPolymarketDepositWallet: true, isPostQuote: true },
      {
        steps: [
          {
            ...DEPOSIT_STEP_MOCK,
            items: [{ data: { data: TRANSFER_CALLDATA_MOCK } }],
          },
        ],
      } as unknown as Partial<RelayQuote>,
    );

    await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
    });

    // The Relay submit calldata is a placeholder for this variant and must not
    // be used to build the simulation.
    expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
    expect(polymarketGetDepositWalletAddressMock).toHaveBeenCalledWith({
      eoa: FROM_MOCK,
    });

    const { transactions } =
      validateQuoteExecutionMock.mock.calls[0][0].simulation;
    expect(transactions).toHaveLength(2);
    expect(transactions[0].from).toBe(DEPOSIT_WALLET_MOCK);
    expect(transactions[1].from).toBe(DEPOSIT_WALLET_MOCK);
  });

  it('skips validation entirely for a Safe-based (non-deposit-wallet) Predict withdraw', async () => {
    const quote = buildQuote(
      { isPostQuote: true, refundTo: REFUND_TO_MOCK },
      {
        metamask: { gasLimits: [], is7702: false, isExecute: false },
        steps: [DEPOSIT_STEP_MOCK],
      } as unknown as Partial<RelayQuote>,
    );

    await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: PREDICT_WITHDRAW_TRANSACTION_WITH_NESTED_MOCK,
    });

    // Legacy Safe withdraws convert USDC.e to pUSD outside the calls the
    // controller can see, so a faithful simulation is impossible. The quote is
    // skipped: no submit calls are built and no simulation is validated.
    expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });

  it('skips validation for a swap-only Safe-based Predict withdraw (no deposit step)', async () => {
    const quote = buildQuote(
      { isPostQuote: true, refundTo: REFUND_TO_MOCK },
      {
        metamask: { gasLimits: [], is7702: false, isExecute: false },
      } as Partial<RelayQuote>,
    );

    await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: PREDICT_WITHDRAW_TRANSACTION_MOCK,
    });

    expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });

  it('re-throws error as-is when signal is aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('Quote validation aborted');

    validateQuoteExecutionMock.mockImplementation(async () => {
      controller.abort();
      throw abortError;
    });

    const quote = buildQuote();

    await expect(
      validateRelayQuotes({
        messenger,
        quotes: [quote],
        signal: controller.signal,
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Quote validation aborted');
  });

  it('wraps unknown errors in QuoteError via toQuoteError', async () => {
    validateQuoteExecutionMock.mockRejectedValue(new Error('unexpected error'));

    const quote = buildQuote();

    await expect(
      validateRelayQuotes({
        messenger,
        quotes: [quote],
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      info: {
        message: 'Quote simulation failed',
        reason: 'simulation-failed',
        detail: ['unexpected error'],
      },
    });
  });

  it('re-wraps insufficient-source-balance QuoteError with request.quotes attached', async () => {
    const quoteError = new QuoteError({
      message: 'Insufficient source balance for quote',
      reason: 'insufficient-source-balance',
    });

    validateQuoteExecutionMock.mockRejectedValue(quoteError);

    const quote = buildQuote();

    await expect(
      validateRelayQuotes({
        messenger,
        quotes: [quote],
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toMatchObject({
      info: {
        message: 'Insufficient source balance for quote',
        reason: 'insufficient-source-balance',
      },
      quotes: [quote],
    });
  });

  it('attaches the entire quote batch (not just the failing quote) when insufficient-source-balance is thrown', async () => {
    const quoteError = new QuoteError({
      message: 'Insufficient source balance for quote',
      reason: 'insufficient-source-balance',
    });

    // Only the first quote triggers the error; the second has not yet been validated.
    validateQuoteExecutionMock
      .mockRejectedValueOnce(quoteError)
      .mockResolvedValue(undefined);

    const quote1 = buildQuote();
    const quote2 = buildQuote();

    const thrownError = await validateRelayQuotes({
      messenger,
      quotes: [quote1, quote2],
      transaction: TRANSACTION_MOCK,
    }).catch((caughtError: unknown) => caughtError);

    expect((thrownError as QuoteError).quotes).toStrictEqual([quote1, quote2]);
  });

  it('throws QuoteError without quotes for non-insufficient-source-balance reason', async () => {
    const quoteError = new QuoteError({
      message: 'Quote simulation failed',
      reason: 'simulation-failed',
      detail: ['revert'],
    });

    validateQuoteExecutionMock.mockRejectedValue(quoteError);

    const quote = buildQuote();

    const thrownError = await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
    }).catch((caughtError: unknown) => caughtError);

    expect(thrownError).toMatchObject({
      info: {
        message: 'Quote simulation failed',
        reason: 'simulation-failed',
      },
    });
    expect((thrownError as QuoteError).quotes).toBeUndefined();
  });

  it('validates multiple quotes sequentially', async () => {
    const quote1 = buildQuote();
    const quote2 = buildQuote();

    await validateRelayQuotes({
      messenger,
      quotes: [quote1, quote2],
      transaction: TRANSACTION_MOCK,
    });

    expect(validateQuoteExecutionMock).toHaveBeenCalledTimes(2);
  });

  it('skips Hyperliquid but validates normal quotes in the same batch', async () => {
    const hyperliquidQuote = buildQuote({ isHyperliquidSource: true });
    const normalQuote = buildQuote();

    await validateRelayQuotes({
      messenger,
      quotes: [hyperliquidQuote, normalQuote],
      transaction: TRANSACTION_MOCK,
    });

    expect(validateQuoteExecutionMock).toHaveBeenCalledTimes(1);
  });

  describe('buildRelayValidationSimulation', () => {
    describe('normal simulation (no executeRequest, no is7702)', () => {
      it('passes normal simulation to validateQuoteExecution', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            gas: '0x5208' as Hex,
            maxFeePerGas: '0x5d21dba00' as Hex,
            maxPriorityFeePerGas: '0x3b9aca00' as Hex,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote();

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: {
              transactions: [
                {
                  data: '0xdata',
                  from: FROM_MOCK,
                  gas: '0x5208',
                  maxFeePerGas: '0x5d21dba00',
                  maxPriorityFeePerGas: '0x3b9aca00',
                  to: '0xdest',
                  value: '0x4d2',
                },
              ],
            },
          }),
        );
      });

      it('omits gas from normal simulation when gas is zero', async () => {
        getRelaySubmitCallsMock.mockResolvedValue({
          calls: [
            {
              data: '0xdata' as Hex,
              from: FROM_MOCK,
              gas: '0x0' as Hex,
              to: '0xto' as Hex,
              value: '0x0' as Hex,
            },
          ],
        });
        const quote = buildQuote({}, {
          metamask: { gasLimits: [], is7702: false, isExecute: false },
        } as Partial<RelayQuote>);
        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });
        const simulationTx =
          validateQuoteExecutionMock.mock.calls[0][0].simulation
            .transactions[0];
        expect(simulationTx).not.toHaveProperty('gas');
      });
    });

    describe('7702 batch simulation (is7702 true, no executeRequest)', () => {
      it('passes 7702 batch simulation to validateQuoteExecution', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [21000], is7702: true, isExecute: false },
          request: {},
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(generateEIP7702BatchTransactionMock).toHaveBeenCalledTimes(1);
        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.objectContaining({
                  data: '0xbatchdata',
                  to: '0xbatchto',
                  value: '0x0',
                  gas: '0x5208',
                }),
              ],
            }),
          }),
        );
      });

      it('omits gas in 7702 batch simulation when gasLimits[0] is undefined', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [], is7702: true, isExecute: false },
          request: {},
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.not.objectContaining({ gas: expect.anything() }),
              ],
            }),
          }),
        );
      });

      it('includes authorizationList on transaction when authorizationList is present', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [21000], is7702: true, isExecute: false },
          request: {
            authorizationList: [
              {
                address: '0xabc' as Hex,
                chainId: 1,
                nonce: 1,
                r: '0xr' as Hex,
                s: '0xs' as Hex,
                yParity: 0,
              },
            ],
          },
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.objectContaining({
                  authorizationList: [{ address: '0xabc', from: FROM_MOCK }],
                }),
              ],
            }),
          }),
        );
      });

      it('includes authorizationList from the EIP-7702 upgrade contract when the quote has no authorizationList', async () => {
        getRemoteFeatureFlagControllerStateMock.mockReturnValue({
          ...getDefaultRemoteFeatureFlagControllerState(),
          remoteFeatureFlags: {
            confirmations_pay_extended: {
              payStrategies: { relay: { validationEnabled: true } },
            },
            confirmations_eip_7702: {
              contracts: {
                [CHAIN_ID_MOCK]: [
                  { address: '0xdelegator' as Hex, signature: '0xsig' as Hex },
                ],
              },
            },
          },
        });

        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [21000], is7702: true, isExecute: false },
          request: {},
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.objectContaining({
                  authorizationList: [
                    { address: '0xdelegator', from: FROM_MOCK },
                  ],
                }),
              ],
            }),
          }),
        );
      });

      it('omits authorizationList when neither the quote nor the upgrade contract provide an address', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [21000], is7702: true, isExecute: false },
          request: {},
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.not.objectContaining({
                  authorizationList: expect.anything(),
                }),
              ],
            }),
          }),
        );
      });

      it('does not set mock7702From on simulation', async () => {
        const calls = [
          {
            data: '0xdata' as Hex,
            from: FROM_MOCK,
            to: '0xdest' as Hex,
            value: '0x4d2' as Hex,
          },
        ];

        getRelaySubmitCallsMock.mockResolvedValue({ calls });

        const quote = buildQuote({}, {
          metamask: { gasLimits: [21000], is7702: true, isExecute: false },
          request: {
            authorizationList: [
              {
                address: '0xabc' as Hex,
                chainId: 1,
                nonce: 1,
                r: '0xr' as Hex,
                s: '0xs' as Hex,
                yParity: 0,
              },
            ],
          },
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.not.objectContaining({
              mock7702From: expect.anything(),
            }),
          }),
        );
      });

      it('omits gas from 7702 batch simulation when gasLimits[0] is zero', async () => {
        getRelaySubmitCallsMock.mockResolvedValue({
          calls: [
            {
              data: '0xcall1' as Hex,
              from: FROM_MOCK,
              gas: '0x5208' as Hex,
              to: '0xdest1' as Hex,
              value: '0x0' as Hex,
            },
          ],
        });
        const quote = buildQuote({}, {
          metamask: { gasLimits: [0], is7702: true, isExecute: false },
        } as Partial<RelayQuote>);
        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });
        const batchTx =
          validateQuoteExecutionMock.mock.calls[0][0].simulation
            .transactions[0];
        expect(batchTx).not.toHaveProperty('gas');
      });

      it('skips validation for a deposit-style Safe Predict withdraw even when the quote is 7702', async () => {
        const quote = buildQuote(
          { isPostQuote: true, refundTo: REFUND_TO_MOCK },
          {
            metamask: { gasLimits: [21000], is7702: true, isExecute: false },
            request: {
              authorizationList: [
                {
                  address: '0xabc' as Hex,
                  chainId: 1,
                  nonce: 1,
                  r: '0xr' as Hex,
                  s: '0xs' as Hex,
                  yParity: 0,
                },
              ],
            },
            steps: [DEPOSIT_STEP_MOCK],
          } as unknown as Partial<RelayQuote>,
        );

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: PREDICT_WITHDRAW_TRANSACTION_WITH_NESTED_MOCK,
        });

        // A Safe withdraw is a signed Safe `execTransaction` that converts USDC.e
        // to pUSD outside the controller's visible calls, so it is skipped before
        // any 7702 batch wrapper or simulation is built.
        expect(generateEIP7702BatchTransactionMock).not.toHaveBeenCalled();
        expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
        expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
      });
    });

    describe('execute simulation (isExecute true)', () => {
      const EXECUTE_REQUEST_MOCK = {
        executionKind: 'rawCalls' as const,
        data: {
          chainId: 1,
          to: '0xdelegationManager' as Hex,
          data: '0xdelegationdata' as Hex,
          value: '0',
        },
        executionOptions: { subsidizeFees: false },
        requestId: '0xreqid',
      };

      it('passes execute simulation to validateQuoteExecution', async () => {
        getRelaySubmitCallsMock.mockResolvedValue({ calls: [] });
        getRelayExecuteRequestMock.mockResolvedValue(EXECUTE_REQUEST_MOCK);

        const quote = buildQuote({}, {
          metamask: { gasLimits: [], is7702: false, isExecute: true },
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(getRelayExecuteRequestMock).toHaveBeenCalledWith({
          allParams: [],
          messenger,
          quote,
          requestId: REQUEST_ID_MOCK,
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.objectContaining({
                  data: '0xdelegationdata',
                  from: FROM_MOCK,
                  to: '0xdelegationManager',
                }),
              ],
            }),
          }),
        );
      });

      it('includes authorizationList on execute simulation transaction when authorizationList is present', async () => {
        const executeRequestWithAuth = {
          ...EXECUTE_REQUEST_MOCK,
          data: {
            ...EXECUTE_REQUEST_MOCK.data,
            authorizationList: [
              {
                address: '0xabc' as Hex,
                chainId: 1,
                nonce: 1,
                yParity: 0,
                r: '0xr' as Hex,
                s: '0xs' as Hex,
              },
            ],
          },
        };

        getRelaySubmitCallsMock.mockResolvedValue({ calls: [] });
        getRelayExecuteRequestMock.mockResolvedValue(executeRequestWithAuth);

        const quote = buildQuote({}, {
          metamask: { gasLimits: [], is7702: false, isExecute: true },
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: [
                expect.objectContaining({
                  authorizationList: [{ address: '0xabc', from: FROM_MOCK }],
                }),
              ],
            }),
          }),
        );
      });

      it('does not set mock7702From on execute simulation', async () => {
        const executeRequestWithAuth = {
          ...EXECUTE_REQUEST_MOCK,
          data: {
            ...EXECUTE_REQUEST_MOCK.data,
            authorizationList: [
              {
                address: '0xabc' as Hex,
                chainId: 1,
                nonce: 1,
                yParity: 0,
                r: '0xr' as Hex,
                s: '0xs' as Hex,
              },
            ],
          },
        };

        getRelaySubmitCallsMock.mockResolvedValue({ calls: [] });
        getRelayExecuteRequestMock.mockResolvedValue(executeRequestWithAuth);

        const quote = buildQuote({}, {
          metamask: { gasLimits: [], is7702: false, isExecute: true },
        } as Partial<RelayQuote>);

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.not.objectContaining({
              mock7702From: expect.anything(),
            }),
          }),
        );
      });

      it('does not call getRelayExecuteRequest when isExecute is false', async () => {
        getRelaySubmitCallsMock.mockResolvedValue({ calls: [] });

        const quote = buildQuote();

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: TRANSACTION_MOCK,
        });

        expect(getRelayExecuteRequestMock).not.toHaveBeenCalled();
        expect(validateQuoteExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            simulation: expect.objectContaining({
              transactions: expect.any(Array),
            }),
          }),
        );
      });

      it('skips validation for a deposit-style Safe Predict withdraw even when the quote is execute', async () => {
        const quote = buildQuote(
          { isPostQuote: true, refundTo: REFUND_TO_MOCK },
          {
            metamask: { gasLimits: [], is7702: false, isExecute: true },
            steps: [DEPOSIT_STEP_MOCK],
          } as unknown as Partial<RelayQuote>,
        );

        await validateRelayQuotes({
          messenger,
          quotes: [quote],
          transaction: PREDICT_WITHDRAW_TRANSACTION_WITH_NESTED_MOCK,
        });

        // The real submit is a signed Safe `execTransaction`, not a
        // `redeemDelegations` authorized for the EOA, and it converts USDC.e to
        // pUSD outside the controller's visible calls. It is skipped before the
        // execute request or any simulation is built.
        expect(getRelayExecuteRequestMock).not.toHaveBeenCalled();
        expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
        expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
      });
    });
  });

  it('returns early without validating when Relay validation is disabled', async () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    await validateRelayQuotes({
      messenger,
      quotes: [buildQuote()],
      transaction: TRANSACTION_MOCK,
    });

    expect(getRelaySubmitCallsMock).not.toHaveBeenCalled();
    expect(validateQuoteExecutionMock).not.toHaveBeenCalled();
  });
});
