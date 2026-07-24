import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
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
const REQUEST_ID_MOCK = '0xreqid1234' as string;
const CHAIN_ID_MOCK = '0x1' as Hex;
const TOKEN_ADDRESS_MOCK = '0xtoken' as Hex;

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
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

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

    getRelaySubmitCallsMock.mockResolvedValue({
      calls: [],
    });
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

  it('skips validation for Polymarket deposit wallet quotes', async () => {
    const quote = buildQuote({ isPolymarketDepositWallet: true });

    await validateRelayQuotes({
      messenger,
      quotes: [quote],
      transaction: TRANSACTION_MOCK,
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

  it('passes through existing QuoteError unchanged', async () => {
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
    });
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

      it('omits authorizationList on transaction when authorizationList is absent', async () => {
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
