import type { TransactionMeta } from '@metamask/transaction-controller';
import type {
  CaipAccountId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import { PaymentOverride, TransactionPayStrategy } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type {
  NonEvmQuoteRequest,
  NonEvmTransactionPayQuote,
  SolanaPayStatus,
} from '../../types.js';
import { notifyRelayTransaction } from './relay-api.js';
import { submitRelayNonEvmQuote } from './relay-submit-non-evm.js';
import { submitPostNonAtomic, waitForRelayCompletion } from './relay-submit.js';
import {
  compileRelaySolanaTransaction,
  getAccountSnapId,
  signAndSendSolanaTransaction,
} from './solana-transaction.js';
import type { RelaySolanaPayQuote } from './types.js';

jest.mock('./relay-api');
jest.mock('./solana-transaction');
jest.mock('./relay-submit', () => ({
  submitPostNonAtomic: jest.fn(),
  waitForRelayCompletion: jest.fn(),
}));

const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const SOLANA_ADDRESS = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const WALLET_ACCOUNT_ID = 'wallet-account-uuid';
const SNAP_ID = 'npm:@metamask/solana-wallet-snap';
const FROM = '0x1234567890123456789012345678901234567890' as Hex;
const TRANSACTION_ID = 'transaction-1';

function getRequest(
  overrides: Partial<NonEvmQuoteRequest> = {},
): NonEvmQuoteRequest {
  return {
    from: FROM,
    sourceAccountId: `${SOLANA_CHAIN_ID}:${SOLANA_ADDRESS}` as CaipAccountId,
    sourceAssetId: `${SOLANA_CHAIN_ID}/slip44:501` as CaipAssetType,
    sourceBalanceRaw: '100000000',
    sourceChainId: SOLANA_CHAIN_ID,
    sourceTokenAmount: '10000000',
    sourceWalletAccountId: WALLET_ACCOUNT_ID,
    targetAmountMinimum: '9900000',
    targetChainId: '0xa4b1',
    targetTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ...overrides,
  };
}

function getQuote(
  overrides: Partial<NonEvmQuoteRequest> = {},
  isAffordable = true,
): NonEvmTransactionPayQuote<RelaySolanaPayQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 12,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: '0', usd: '0' },
      sourceNetwork: {
        estimate: { fiat: '0', human: '0', raw: '5000', usd: '0' },
        max: { fiat: '0', human: '0', raw: '5000', usd: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      details: {
        currencyIn: {
          amount: '10000000',
          amountFormatted: '0.01',
          amountUsd: '1.5',
          currency: { chainId: 792703809, decimals: 9 },
        },
        currencyOut: {
          amount: '1500000',
          amountFormatted: '1.5',
          amountUsd: '1.5',
          currency: { chainId: 42161, decimals: 6 },
          minimumAmount: '1490000',
        },
        timeEstimate: 12,
        totalImpact: { usd: '0' },
      },
      fees: { relayer: { amountUsd: '0' } },
      metamask: {
        affordability: {
          isAffordable,
          nativeShortfallRaw: '0',
          requiredNativeBalanceRaw: '0',
          requiredSourceBalanceRaw: '0',
          sourceShortfallRaw: '0',
        },
        feeRaw: '5000',
        lastValidBlockHeight: 1,
        rentReserveRaw: '890880',
        transaction: 'quoted-transaction',
      },
      request: {
        amount: '10000000',
        destinationChainId: 42161,
        destinationCurrency: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        originChainId: 792703809,
        originCurrency: '11111111111111111111111111111111',
        recipient: FROM,
        refundTo: SOLANA_ADDRESS,
        tradeType: 'EXACT_INPUT',
        user: SOLANA_ADDRESS,
      },
      requestId: 'relay-request-123',
      steps: [
        {
          id: 'deposit',
          items: [
            {
              check: { endpoint: '/intents/status', method: 'GET' },
              data: {
                instructions: [
                  {
                    data: '02000000',
                    keys: [
                      {
                        isSigner: true,
                        isWritable: true,
                        pubkey: SOLANA_ADDRESS,
                      },
                    ],
                    programId: '11111111111111111111111111111111',
                  },
                ],
              },
              status: 'incomplete',
            },
          ],
          kind: 'transaction',
          requestId: 'relay-request-123',
        },
      ],
    },
    request: getRequest(overrides),
    sourceAmount: { fiat: '0', human: '0.01', raw: '10000000', usd: '0' },
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

describe('submitRelayNonEvmQuote', () => {
  const compileMock = jest.mocked(compileRelaySolanaTransaction);
  const getSnapIdMock = jest.mocked(getAccountSnapId);
  const signAndSendMock = jest.mocked(signAndSendSolanaTransaction);
  const notifyMock = jest.mocked(notifyRelayTransaction);
  const waitMock = jest.mocked(waitForRelayCompletion);
  const submitPostNonAtomicMock = jest.mocked(submitPostNonAtomic);

  const {
    addTransactionBatchMock,
    getControllerStateMock,
    getTransactionControllerStateMock,
    messenger,
    reconcileSolanaPayMock,
    snapHandleRequestMock,
    updateTransactionMock,
  } = getMessengerMock();

  let transaction: TransactionMeta;

  function getPersistedTransaction(): TransactionMeta {
    return transaction;
  }

  function getStatus(
    overrides: Partial<SolanaPayStatus> = {},
  ): SolanaPayStatus {
    return {
      followUpStatus: 'not-required',
      notificationStatus: 'success',
      outcome: 'succeeded',
      phase: 'submitted',
      relayStatus: 'success',
      requestId: 'relay-request-123',
      sourceStatus: 'confirmed',
      sourceTransactionId: 'signature',
      submissionOutcome: 'submitted',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();

    transaction = {
      chainId: '0xa4b1',
      id: TRANSACTION_ID,
      networkClientId: 'arbitrum',
      status: 'approved',
      time: 0,
      txParams: { from: FROM },
    } as TransactionMeta;

    getTransactionControllerStateMock.mockImplementation(() => ({
      transactions: [transaction],
    }));

    updateTransactionMock.mockImplementation((updated: TransactionMeta) => {
      transaction = updated;
    });

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_ID]: {
          isLoading: false,
          quotesLastUpdated: Date.now(),
          tokens: [],
        },
      },
    });

    getSnapIdMock.mockReturnValue(SNAP_ID);
    compileMock.mockResolvedValue({
      lastValidBlockHeight: 2,
      transaction: 'fresh-transaction',
    });
    signAndSendMock.mockResolvedValue({ transactionId: 'signature' });
    notifyMock.mockResolvedValue(undefined);
    waitMock.mockResolvedValue({ status: 'success', targetHash: '0xtarget' });
    reconcileSolanaPayMock.mockResolvedValue(getStatus());
  });

  it('signs a freshly compiled transaction through exactly one Snap signAndSendTransaction call', async () => {
    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'submitted',
    });
    expect(compileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: SOLANA_ADDRESS,
        scope: SOLANA_CHAIN_ID,
      }),
    );
    expect(signAndSendMock).toHaveBeenCalledTimes(1);
    expect(signAndSendMock).toHaveBeenCalledWith({
      accountId: WALLET_ACCOUNT_ID,
      messenger,
      scope: SOLANA_CHAIN_ID,
      snapId: SNAP_ID,
      transaction: 'fresh-transaction',
    });
  });

  it('never falls back to EVM publication or an eth_sendRawTransaction call', async () => {
    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(addTransactionBatchMock).not.toHaveBeenCalled();
    expect(snapHandleRequestMock).not.toHaveBeenCalled();
    expect(JSON.stringify(signAndSendMock.mock.calls)).not.toContain(
      'eth_sendRawTransaction',
    );
  });

  it('persists the attempting checkpoint before crossing the Snap boundary', async () => {
    signAndSendMock.mockImplementation(async () => {
      expect(
        getPersistedTransaction().metamaskPay?.solanaExecution,
      ).toMatchObject({
        phase: 'attempting',
        requestId: 'relay-request-123',
        sourceAmountRaw: '10000000',
        sourceChainId: SOLANA_CHAIN_ID,
        sourceWalletAccountId: WALLET_ACCOUNT_ID,
      });
      return { transactionId: 'signature' };
    });

    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(signAndSendMock).toHaveBeenCalledTimes(1);
  });

  it('persists the signature, notifies Relay, waits for completion and marks the intent complete', async () => {
    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(notifyMock).toHaveBeenCalledWith({
      chainId: '792703809',
      requestId: 'relay-request-123',
      txHash: 'signature',
    });
    expect(waitMock).toHaveBeenCalledWith(getQuote().original, messenger, {
      tolerateFailure: true,
    });
    expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
      notificationStatus: 'success',
      phase: 'submitted',
      relayStatus: 'not-observed',
      sourceStatus: 'pending',
      sourceTransactionId: 'signature',
    });
    expect(transaction.isIntentComplete).toBe(true);
  });

  it('records an included atomic product action for a Perps or Predict deposit', async () => {
    const quote = getQuote();
    quote.original.request.txs = [{ data: '0x1234', to: FROM, value: '0x0' }];

    await submitRelayNonEvmQuote({
      messenger,
      quote,
      transaction: {
        ...transaction,
        type: 'predictDeposit',
      } as TransactionMeta,
    });

    expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
      atomicProductActionIncluded: true,
      atomicProductActionRequired: true,
    });
  });

  it('accepts a Snap response carrying a signature field', async () => {
    signAndSendMock.mockResolvedValue({ signature: 'legacy-signature' });

    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: 'legacy-signature' }),
    );
  });

  it('records a failed Relay notification without resubmitting', async () => {
    notifyMock.mockRejectedValue(new Error('index failed'));

    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(signAndSendMock).toHaveBeenCalledTimes(1);
    expect(transaction.metamaskPay?.solanaExecution?.notificationStatus).toBe(
      'failure',
    );
  });

  it('never calls the Snap again across a simulated restart and only observes Relay', async () => {
    signAndSendMock.mockRejectedValue(new Error('Snap crashed'));

    const first = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(first).toStrictEqual({
      externallyHandled: true,
      outcome: 'ambiguous',
    });

    reconcileSolanaPayMock.mockResolvedValue(
      getStatus({ outcome: 'unknown', submissionOutcome: 'ambiguous' }),
    );

    const restarted = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction: { ...transaction, metamaskPay: undefined },
    });

    expect(signAndSendMock).toHaveBeenCalledTimes(1);
    expect(reconcileSolanaPayMock).toHaveBeenCalledWith(TRANSACTION_ID);
    expect(restarted).toStrictEqual({
      externallyHandled: true,
      outcome: 'ambiguous',
    });
  });

  it('defaults a restarted attempt with no submission outcome to ambiguous', async () => {
    transaction.metamaskPay = {
      solanaExecution: {
        atomicProductActionIncluded: false,
        atomicProductActionRequired: false,
        followUpStatus: 'not-required',
        notificationStatus: 'not-ready',
        phase: 'attempting',
        relayStatus: 'not-observed',
        requestId: 'relay-request-123',
        requiresNonAtomicFollowUp: false,
        sourceAmountRaw: '10000000',
        sourceChainId: SOLANA_CHAIN_ID,
        sourceStatus: 'not-observed',
        sourceWalletAccountId: WALLET_ACCOUNT_ID,
      },
    };
    reconcileSolanaPayMock.mockResolvedValue(
      getStatus({ outcome: 'attempting', submissionOutcome: undefined }),
    );

    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(signAndSendMock).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'ambiguous',
    });
  });

  it.each([
    ['a Snap crash', new Error('Snap crashed')],
    ['a non-error rejection', 'timeout'],
    [
      'an unknown JSON-RPC code',
      Object.assign(new Error('x'), { code: -32603 }),
    ],
  ])('records %s as unknown and only observes', async (_name, error) => {
    signAndSendMock.mockRejectedValue(error);

    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'ambiguous',
    });
    expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
      phase: 'unknown',
      sourceStatus: 'unknown',
    });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(waitMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no response', undefined],
    ['an empty transaction ID', { transactionId: '' }],
  ])('records %s from the Snap as ambiguous', async (_name, response) => {
    signAndSendMock.mockResolvedValue(response);

    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'ambiguous',
    });
    expect(transaction.metamaskPay?.solanaExecution?.phase).toBe('unknown');
  });

  it('records a user rejection', async () => {
    signAndSendMock.mockRejectedValue(
      Object.assign(new Error('User rejected'), { code: 4001 }),
    );

    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'user-rejected',
    });
    expect(transaction.metamaskPay?.solanaExecution?.phase).toBe(
      'user-rejected',
    );
  });

  it.each([-32600, -32602])(
    'records JSON-RPC code %s as not submitted',
    async (code) => {
      signAndSendMock.mockRejectedValue(
        Object.assign(new Error('Invalid transaction'), { code }),
      );

      const result = await submitRelayNonEvmQuote({
        messenger,
        quote: getQuote(),
        transaction,
      });

      expect(result).toStrictEqual({
        error: 'Invalid transaction',
        externallyHandled: true,
        outcome: 'not-submitted',
      });
      expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
        phase: 'not-submitted',
        sourceFailureReason: 'Invalid transaction',
      });
    },
  );

  it('rejects an unaffordable quote before any checkpoint or Snap call', async () => {
    await expect(
      submitRelayNonEvmQuote({
        messenger,
        quote: getQuote({}, false),
        transaction,
      }),
    ).rejects.toThrow('Solana source is not affordable');

    expect(signAndSendMock).not.toHaveBeenCalled();
    expect(transaction.metamaskPay).toBeUndefined();
  });

  it.each([
    ['older than the refresh interval plus grace period', 40_001],
    ['missing a last update time', undefined],
  ])(
    'rejects a quote %s before any checkpoint or Snap call',
    async (_title, age) => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_ID]: {
            isLoading: false,
            quotesLastUpdated: age === undefined ? undefined : Date.now() - age,
            tokens: [],
          },
        },
      });

      await expect(
        submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction }),
      ).rejects.toThrow('Solana quote expired');

      expect(updateTransactionMock).not.toHaveBeenCalled();
      expect(compileMock).not.toHaveBeenCalled();
      expect(snapHandleRequestMock).not.toHaveBeenCalled();
      expect(signAndSendMock).not.toHaveBeenCalled();
    },
  );

  it('accepts a quote within the refresh interval plus grace period', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_ID]: {
          isLoading: false,
          quotesLastUpdated: Date.now() - 39_000,
          tokens: [],
        },
      },
    });

    await submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction });

    expect(signAndSendMock).toHaveBeenCalledTimes(1);
  });

  it('throws the Relay failure after observing a failed settlement', async () => {
    waitMock.mockResolvedValue({ status: 'failure' });
    reconcileSolanaPayMock.mockResolvedValue(
      getStatus({
        outcome: 'relay-failed',
        relayFailureReason: 'SOLVER_FAILED',
        relayStatus: 'failure',
      }),
    );

    await expect(
      submitRelayNonEvmQuote({ messenger, quote: getQuote(), transaction }),
    ).rejects.toThrow('SOLVER_FAILED');
    expect(signAndSendMock).toHaveBeenCalledTimes(1);
  });

  it('returns submitted without completing the intent when Relay polling times out', async () => {
    waitMock.mockResolvedValue({ status: 'timeout' });
    reconcileSolanaPayMock.mockResolvedValue(
      getStatus({ outcome: 'submitted', relayStatus: 'pending' }),
    );

    const result = await submitRelayNonEvmQuote({
      messenger,
      quote: getQuote(),
      transaction,
    });

    expect(result).toStrictEqual({
      externallyHandled: true,
      outcome: 'submitted',
    });
    expect(transaction.isIntentComplete).toBeUndefined();
  });

  describe('non-atomic Money Account', () => {
    const moneyAccountOverrides = {
      atomic: false,
      paymentOverride: PaymentOverride.MoneyAccount,
    };

    it('runs the existing submitPostNonAtomic second leg once after Relay success', async () => {
      reconcileSolanaPayMock.mockResolvedValue(
        getStatus({ followUpStatus: 'not-started', outcome: 'submitted' }),
      );
      submitPostNonAtomicMock.mockResolvedValue({
        transactionHash: '0xsecond',
      });

      const quote = getQuote(moneyAccountOverrides);

      await submitRelayNonEvmQuote({ messenger, quote, transaction });

      expect(submitPostNonAtomicMock).toHaveBeenCalledTimes(1);
      expect(submitPostNonAtomicMock).toHaveBeenCalledWith({
        completion: { status: 'success', targetHash: '0xtarget' },
        messenger,
        quote: {
          ...quote,
          request: { ...quote.request, recipient: FROM },
        },
        transaction: expect.objectContaining({ id: TRANSACTION_ID }),
      });
      expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
        followUpStatus: 'confirmed',
        followUpTransactionId: '0xsecond',
        requiresNonAtomicFollowUp: true,
      });
      expect(transaction.isIntentComplete).toBe(true);
    });

    it('runs the second leg from the target transaction account when the account is overridden', async () => {
      const overrideAccount =
        '0x9999999999999999999999999999999999999999' as Hex;

      reconcileSolanaPayMock.mockResolvedValue(
        getStatus({ followUpStatus: 'not-started', outcome: 'submitted' }),
      );
      submitPostNonAtomicMock.mockResolvedValue({
        transactionHash: '0xsecond',
      });

      await submitRelayNonEvmQuote({
        messenger,
        quote: getQuote({ ...moneyAccountOverrides, from: overrideAccount }),
        transaction,
      });

      expect(submitPostNonAtomicMock).toHaveBeenCalledWith(
        expect.objectContaining({
          quote: expect.objectContaining({
            request: expect.objectContaining({
              from: overrideAccount,
              recipient: FROM,
            }),
          }),
        }),
      );
    });

    it('records a failed second leg and does not complete the intent', async () => {
      reconcileSolanaPayMock.mockResolvedValue(
        getStatus({ followUpStatus: 'not-started', outcome: 'submitted' }),
      );
      submitPostNonAtomicMock.mockRejectedValue(new Error('Second leg failed'));

      await expect(
        submitRelayNonEvmQuote({
          messenger,
          quote: getQuote(moneyAccountOverrides),
          transaction,
        }),
      ).rejects.toThrow('Second leg failed');

      expect(transaction.metamaskPay?.solanaExecution?.followUpStatus).toBe(
        'failed',
      );
      expect(transaction.isIntentComplete).toBeUndefined();
    });

    it('throws if the checkpoint disappeared before the second leg', async () => {
      reconcileSolanaPayMock.mockImplementation(async () => {
        transaction = { ...transaction, metamaskPay: {} };
        return getStatus({ followUpStatus: 'not-started' });
      });

      await expect(
        submitRelayNonEvmQuote({
          messenger,
          quote: getQuote(moneyAccountOverrides),
          transaction,
        }),
      ).rejects.toThrow('Solana execution missing');
    });
  });
});
