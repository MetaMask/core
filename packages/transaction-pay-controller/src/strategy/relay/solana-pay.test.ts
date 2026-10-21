import { Interface } from '@ethersproject/abi';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type {
  CaipAccountId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import { PaymentOverride } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type { NonEvmQuoteRequest } from '../../types.js';
import { submitSecondLeg } from '../../utils/second-leg.js';
import {
  applyRelayCompletion,
  applyRelayStatusObservation,
  applySolanaSourceFailure,
  buildRelaySolanaQuoteRequest,
  deriveSolanaPayOutcome,
  getRelaySolanaTransaction,
  getSolanaAffordability,
  getSolanaPayFailure,
  getSolanaPayStatus,
  isTerminalSolanaPayOutcome,
  mapRelayStatus,
  readSolanaSourceFailure,
  submitSolanaPayFollowUp,
} from './solana-pay.js';
import { getSolanaSourceFailure } from './solana-transaction.js';
import type {
  RelaySolanaQuote,
  RelaySolanaTransaction,
  RelayStatusResponse,
} from './types.js';

jest.mock('./solana-transaction');
jest.mock('../../utils/second-leg');

const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const SOLANA_ACCOUNT =
  `${SOLANA_CHAIN_ID}:7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z` as CaipAccountId;
const SOLANA_USDC =
  `${SOLANA_CHAIN_ID}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as CaipAssetType;
const SOLANA_NATIVE = `${SOLANA_CHAIN_ID}/slip44:501` as CaipAssetType;
const SOLANA_NATIVE_RELAY_ADDRESS = '11111111111111111111111111111111';

const RECIPIENT = '0x1234567890123456789012345678901234567890' as Hex;
const TARGET_TOKEN = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

function getRequest(
  overrides: Partial<NonEvmQuoteRequest> = {},
): NonEvmQuoteRequest {
  return {
    from: RECIPIENT,
    sourceAccountId: SOLANA_ACCOUNT,
    sourceAssetId: SOLANA_USDC,
    sourceBalanceRaw: '2000000',
    sourceChainId: SOLANA_CHAIN_ID,
    sourceTokenAmount: '1000000',
    sourceWalletAccountId: 'wallet-account-uuid',
    targetAmountMinimum: '900000',
    targetChainId: '0xa4b1',
    targetTokenAddress: TARGET_TOKEN,
    ...overrides,
  };
}

function getExecution(
  overrides: Partial<MetamaskPaySolanaExecution> = {},
): MetamaskPaySolanaExecution {
  return {
    atomicProductActionIncluded: false,
    atomicProductActionRequired: false,
    followUpStatus: 'not-required',
    notificationStatus: 'not-ready',
    phase: 'attempting',
    relayStatus: 'not-observed',
    requestId: 'relay-request-123',
    requiresNonAtomicFollowUp: false,
    sourceAmountRaw: '1000000',
    sourceChainId: SOLANA_CHAIN_ID,
    sourceStatus: 'not-observed',
    sourceWalletAccountId: 'wallet-account-uuid',
    targetChainId: '0xa4b1',
    targetTokenAddress: TARGET_TOKEN,
    ...overrides,
  } as MetamaskPaySolanaExecution;
}

function getQuote(): RelaySolanaQuote {
  return {
    request: {
      amount: '1000000',
      destinationChainId: 42161,
      destinationCurrency: TARGET_TOKEN,
      originChainId: 792703809,
      originCurrency: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      recipient: RECIPIENT,
      refundTo: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
      tradeType: 'EXACT_INPUT',
      user: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
    },
    requestId: 'relay-request-123',
    details: {
      currencyIn: {
        amount: '1000000',
        amountFormatted: '1',
        amountUsd: '1',
        currency: { chainId: 792703809, decimals: 6 },
      },
      currencyOut: {
        amount: '999000',
        amountFormatted: '0.999',
        amountUsd: '0.999',
        currency: { chainId: 42161, decimals: 6 },
        minimumAmount: '995000',
      },
      timeEstimate: 15,
      totalImpact: { usd: '0.001' },
    },
    fees: { relayer: { amountUsd: '0.001' } },
    steps: [
      {
        id: 'deposit',
        kind: 'transaction',
        requestId: 'relay-request-123',
        items: [
          {
            status: 'incomplete',
            check: {
              endpoint:
                'https://api.relay.link/intents/status/v3?requestId=relay-request-123',
              method: 'GET',
            },
            data: {
              chainId: 792703809,
              instructions: [
                {
                  programId: '11111111111111111111111111111111',
                  keys: [
                    {
                      pubkey: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
                      isSigner: true,
                      isWritable: true,
                    },
                  ],
                  data: '02000000',
                },
              ],
              addressLookupTableAddresses: [
                'HZaWndaNWHFDd9Dhk5PQcJmR4aLQv3Y5nVf2gQmMEz2x',
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('Solana Relay Pay', () => {
  describe('buildRelaySolanaQuoteRequest', () => {
    const TRANSACTION = {
      id: 'transaction-1',
      txParams: { from: RECIPIENT },
    } as TransactionMeta;
    const { getDelegationTransactionMock, messenger } = getMessengerMock();

    beforeEach(() => {
      getDelegationTransactionMock.mockResolvedValue({
        data: '0x1234',
        to: '0x9876543210987654321098765432109876543210',
        value: '0x0',
      });
    });

    it('derives an exact-input SPL route from the non-EVM quote request', async () => {
      const result = await buildRelaySolanaQuoteRequest(
        getRequest(),
        TRANSACTION,
        messenger,
      );

      expect(result).toStrictEqual({
        amount: '1000000',
        destinationChainId: 42161,
        destinationCurrency: TARGET_TOKEN,
        originChainId: 792703809,
        originCurrency: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        recipient: RECIPIENT,
        refundTo: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
        tradeType: 'EXACT_INPUT',
        user: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
      });
    });

    it('maps the CAIP native SOL asset to the Relay native sentinel', async () => {
      const result = await buildRelaySolanaQuoteRequest(
        getRequest({ sourceAssetId: SOLANA_NATIVE }),
        TRANSACTION,
        messenger,
      );

      expect(result.originCurrency).toBe(SOLANA_NATIVE_RELAY_ADDRESS);
    });

    it.each([
      TransactionType.perpsDeposit,
      TransactionType.perpsDepositAndOrder,
      TransactionType.predictDeposit,
      TransactionType.predictDepositAndOrder,
    ])('embeds atomic product calls for %s', async (type) => {
      const result = await buildRelaySolanaQuoteRequest(
        getRequest(),
        { ...TRANSACTION, type },
        messenger,
      );

      expect(result).toMatchObject({
        amount: '900000',
        recipient: RECIPIENT,
        tradeType: 'EXACT_OUTPUT',
        txs: [
          {
            data: new Interface([
              'function transfer(address to, uint256 amount)',
            ]).encodeFunctionData('transfer', [RECIPIENT, '900000']),
            to: TARGET_TOKEN,
            value: '0x0',
          },
          {
            data: '0x1234',
            to: '0x9876543210987654321098765432109876543210',
            value: '0x0',
          },
        ],
      });
    });

    it('bridges the exact source amount for a non-atomic Money Account route', async () => {
      const result = await buildRelaySolanaQuoteRequest(
        getRequest({
          atomic: false,
          paymentOverride: PaymentOverride.MoneyAccount,
          sourceTokenAmount: '765432',
        }),
        { ...TRANSACTION, type: TransactionType.predictDeposit },
        messenger,
      );

      expect(result.amount).toBe('765432');
      expect(result.tradeType).toBe('EXACT_INPUT');
      expect(result.txs).toBeUndefined();
      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('includes normalized destination authorization with atomic calls', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        authorizationList: [
          {
            address: RECIPIENT,
            chainId: '0xa4b1',
            nonce: '0x1',
            r: '0x1',
            s: '0x2',
            yParity: '0x1',
          },
        ],
        data: '0x1234',
        to: '0x9876543210987654321098765432109876543210',
        value: '0x0',
      });

      const result = await buildRelaySolanaQuoteRequest(
        getRequest(),
        { ...TRANSACTION, type: TransactionType.predictDeposit },
        messenger,
      );

      expect(result.authorizationList).toStrictEqual([
        {
          address: RECIPIENT,
          chainId: 42161,
          nonce: 1,
          r: '0x1',
          s: '0x2',
          yParity: 1,
        },
      ]);
    });

    it('rejects a product route that is non-atomic outside Money Account', async () => {
      await expect(
        buildRelaySolanaQuoteRequest(
          getRequest({ atomic: false }),
          { ...TRANSACTION, type: TransactionType.predictDeposit },
          messenger,
        ),
      ).rejects.toThrow('Unsupported non-atomic Solana Pay product route');
    });

    it('rejects an exact-input route without a source amount', async () => {
      await expect(
        buildRelaySolanaQuoteRequest(
          getRequest({ sourceTokenAmount: '0' }),
          TRANSACTION,
          messenger,
        ),
      ).rejects.toThrow('Missing Solana Pay amount');
    });

    it.each([
      [
        {
          sourceAccountId: 'solana:devnet:account',
          sourceAssetId: 'solana:devnet/token:mint',
          sourceChainId: 'solana:devnet',
        },
        'Unsupported Solana source chain',
      ],
      [
        { sourceAccountId: 'solana:other:account' },
        'Solana source account and asset must use the same chain',
      ],
      [
        { sourceAssetId: `${SOLANA_CHAIN_ID}/erc20:0x1234` },
        'Unsupported Solana source asset',
      ],
    ] as const)(
      'rejects invalid source identity %#',
      async (overrides, error) => {
        await expect(
          buildRelaySolanaQuoteRequest(
            getRequest(overrides as Partial<NonEvmQuoteRequest>),
            TRANSACTION,
            messenger,
          ),
        ).rejects.toThrow(error);
      },
    );
  });

  describe('getRelaySolanaTransaction', () => {
    it('returns the instruction and lookup-table handoff', () => {
      expect(getRelaySolanaTransaction(getQuote())).toStrictEqual(
        getQuote().steps[0].items[0].data,
      );
    });

    it('accepts a valid instruction handoff without lookup tables', () => {
      const quote = getQuote();
      delete quote.steps[0].items[0].data.addressLookupTableAddresses;

      expect(getRelaySolanaTransaction(quote)).toStrictEqual({
        chainId: 792703809,
        instructions: quote.steps[0].items[0].data.instructions,
      });
    });

    it('accepts a valid Solana handoff without a chainId', () => {
      const quote = getQuote();
      delete quote.steps[0].items[0].data.chainId;

      expect(getRelaySolanaTransaction(quote)).toStrictEqual({
        instructions: quote.steps[0].items[0].data.instructions,
        addressLookupTableAddresses:
          quote.steps[0].items[0].data.addressLookupTableAddresses,
      });
    });

    it('rejects an explicit non-Solana chain with otherwise valid instructions', () => {
      const quote = getQuote();
      quote.steps[0].items[0].data.chainId = 1;

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects multiple executable transaction items', () => {
      const quote = getQuote();
      quote.steps[0].items.push(quote.steps[0].items[0]);

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects non-transaction steps', () => {
      const quote = getQuote();
      quote.steps[0].kind = 'signature' as never;

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects a quote without a provider request ID', () => {
      const quote = getQuote();
      quote.requestId = '';
      quote.steps[0].requestId = '';

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects a step with mismatched request correlation', () => {
      const quote = getQuote();
      quote.steps[0].requestId = 'other-request';

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects an EVM transaction item instead of casting it as Solana', () => {
      const quote = getQuote();
      quote.steps[0].items[0].data = {
        chainId: 792703809,
        to: '0x1234',
        data: '0x',
      } as unknown as RelaySolanaTransaction;

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it.each([
      null,
      { chainId: 1, instructions: [] },
      { chainId: 792703809, instructions: [] },
      {
        chainId: 792703809,
        instructions: [null],
      },
      {
        chainId: 792703809,
        instructions: [{ programId: '', data: 'not-hex', keys: [] }],
      },
      {
        chainId: 792703809,
        instructions: [
          {
            programId: 'program',
            data: '00',
            keys: [null],
          },
        ],
      },
      {
        chainId: 792703809,
        instructions: [
          {
            programId: 'program',
            data: '00',
            keys: [],
          },
        ],
        addressLookupTableAddresses: [1],
      },
    ])('rejects malformed transaction data %#', (data) => {
      const quote = getQuote();
      quote.steps[0].items[0].data = data as unknown as RelaySolanaTransaction;

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });

    it('rejects malformed instruction keys', () => {
      const quote = getQuote();
      const transaction = quote.steps[0].items[0].data;
      transaction.instructions[0].keys[0].isSigner = 'true' as never;

      expect(() => getRelaySolanaTransaction(quote)).toThrow(
        'Invalid Relay Solana transaction payload',
      );
    });
  });

  describe('getSolanaAffordability', () => {
    it('requires native SOL fee and rent separately from an affordable SPL amount', () => {
      expect(
        getSolanaAffordability({
          feeRaw: '6000',
          isNative: false,
          nativeBalanceRaw: '100000',
          rentReserveRaw: '5000',
          sourceAmountRaw: '1000000',
          sourceBalanceRaw: '2000000',
        }),
      ).toStrictEqual({
        isAffordable: true,
        nativeShortfallRaw: '0',
        requiredNativeBalanceRaw: '11000',
        requiredSourceBalanceRaw: '1000000',
        sourceShortfallRaw: '0',
      });
    });

    it('includes the fee and rent reserve in native SOL affordability', () => {
      expect(
        getSolanaAffordability({
          feeRaw: '6000',
          isNative: true,
          nativeBalanceRaw: '100000',
          rentReserveRaw: '5000',
          sourceAmountRaw: '95000',
          sourceBalanceRaw: '100000',
        }),
      ).toStrictEqual({
        isAffordable: false,
        nativeShortfallRaw: '0',
        requiredNativeBalanceRaw: '106000',
        requiredSourceBalanceRaw: '106000',
        sourceShortfallRaw: '6000',
      });
    });

    it('reports source and native shortfalls independently for SPL', () => {
      expect(
        getSolanaAffordability({
          feeRaw: '6000',
          isNative: false,
          nativeBalanceRaw: '10000',
          rentReserveRaw: '5000',
          sourceAmountRaw: '1000000',
          sourceBalanceRaw: '900000',
        }),
      ).toMatchObject({
        isAffordable: false,
        nativeShortfallRaw: '1000',
        sourceShortfallRaw: '100000',
      });
    });
  });

  describe('deriveSolanaPayOutcome', () => {
    it.each([
      [{ phase: 'user-rejected' }, 'user-rejected'],
      [{ phase: 'not-submitted' }, 'not-submitted'],
      [{ sourceStatus: 'failed' }, 'source-failed'],
      [{ relayStatus: 'failure' }, 'relay-failed'],
      [{ relayStatus: 'refund' }, 'refunded'],
      [{ followUpStatus: 'failed' }, 'follow-up-failed'],
      [{ phase: 'unknown' }, 'unknown'],
      [{ relayStatus: 'unknown' }, 'unknown'],
      [{ followUpStatus: 'unknown' }, 'unknown'],
      [
        {
          followUpStatus: 'attempting',
          relayStatus: 'success',
          sourceStatus: 'confirmed',
        },
        'unknown',
      ],
      [
        {
          followUpStatus: 'confirmed',
          relayStatus: 'success',
          sourceStatus: 'confirmed',
        },
        'succeeded',
      ],
      [{ phase: 'attempting' }, 'attempting'],
      [{ phase: 'submitted', sourceTransactionId: 'signature' }, 'submitted'],
    ] as const)('derives %# from durable checkpoint', (overrides, expected) => {
      expect(deriveSolanaPayOutcome(getExecution(overrides))).toBe(expected);
    });

    it('does not succeed when a required atomic product action was omitted', () => {
      const execution = getExecution({
        atomicProductActionIncluded: false,
        atomicProductActionRequired: true,
        relayStatus: 'success',
        sourceStatus: 'confirmed',
      });

      expect(deriveSolanaPayOutcome(execution)).toBe('attempting');
    });
  });

  describe('applyRelayStatusObservation', () => {
    function getStatus(
      overrides: Partial<RelayStatusResponse> = {},
    ): RelayStatusResponse {
      return {
        destinationChainId: 42161,
        inTxHashes: [],
        originChainId: 792703809,
        status: 'pending',
        txHashes: [],
        updatedAt: 0,
        ...overrides,
      };
    }

    it('records the Relay-indexed source signature for an ambiguous attempt without signing', () => {
      expect(
        applyRelayStatusObservation(
          getExecution({ phase: 'unknown', sourceStatus: 'unknown' }),
          getStatus({ inTxHashes: ['signature'] }),
        ),
      ).toMatchObject({
        notificationStatus: 'not-attempted',
        phase: 'submitted',
        relayStatus: 'pending',
        sourceStatus: 'confirmed',
        sourceTransactionId: 'signature',
      });
    });

    it('keeps the persisted signature and records the target hash on success', () => {
      expect(
        applyRelayStatusObservation(
          getExecution({
            notificationStatus: 'success',
            phase: 'submitted',
            sourceStatus: 'pending',
            sourceTransactionId: 'persisted-signature',
          }),
          getStatus({ status: 'success', txHashes: ['0xtarget'] }),
        ),
      ).toMatchObject({
        notificationStatus: 'success',
        relayStatus: 'success',
        sourceStatus: 'confirmed',
        sourceTransactionId: 'persisted-signature',
        targetTransactionId: '0xtarget',
      });
    });

    it('keeps a submitted source pending until Relay observes it', () => {
      expect(
        applyRelayStatusObservation(
          getExecution({
            phase: 'submitted',
            sourceStatus: 'pending',
            sourceTransactionId: 'signature',
          }),
          getStatus({ status: 'waiting' }),
        ),
      ).toMatchObject({ relayStatus: 'pending', sourceStatus: 'pending' });
    });

    it('keeps a source observed as failed on chain until Relay observes it', () => {
      expect(
        applyRelayStatusObservation(
          getExecution({
            phase: 'submitted',
            sourceStatus: 'failed',
            sourceTransactionId: 'signature',
          }),
          getStatus({ status: 'waiting' }),
        ),
      ).toMatchObject({ relayStatus: 'pending', sourceStatus: 'failed' });
    });

    it('stays observe-only while Relay has not seen an attempting source', () => {
      expect(
        applyRelayStatusObservation(getExecution(), getStatus()),
      ).toMatchObject({ phase: 'attempting', relayStatus: 'pending' });
    });

    it('records the Relay failure reason', () => {
      expect(
        applyRelayStatusObservation(
          getExecution(),
          getStatus({ failReason: 'SOLVER_FAILED', status: 'failure' }),
        ),
      ).toMatchObject({
        relayFailureReason: 'SOLVER_FAILED',
        relayStatus: 'failure',
      });
    });

    it('marks a non-terminal Relay status unknown when the read fails', () => {
      expect(
        applyRelayStatusObservation(getExecution(), undefined).relayStatus,
      ).toBe('unknown');
    });

    it('never downgrades a terminal Relay status when the read fails', () => {
      expect(
        applyRelayStatusObservation(
          getExecution({ relayStatus: 'success' }),
          undefined,
        ).relayStatus,
      ).toBe('success');
    });
  });

  describe('applyRelayCompletion', () => {
    const submittedExecution = getExecution({
      notificationStatus: 'success',
      phase: 'submitted',
      relayStatus: 'not-observed',
      sourceStatus: 'pending',
      sourceTransactionId: 'signature',
    });

    it('records Relay success, the confirmed source and the target hash', () => {
      const execution = applyRelayCompletion(submittedExecution, {
        status: 'success',
        targetHash: '0xtarget',
      });

      expect(execution).toMatchObject({
        relayStatus: 'success',
        sourceStatus: 'confirmed',
        targetTransactionId: '0xtarget',
      });
      expect(deriveSolanaPayOutcome(execution)).toBe('succeeded');
    });

    it('does not record the fallback hash as the target hash', () => {
      expect(
        applyRelayCompletion(submittedExecution, {
          status: 'success',
          targetHash: '0x0',
        }).targetTransactionId,
      ).toBeUndefined();
    });

    it.each([
      ['failure', 'failure'],
      ['refunded', 'refund'],
    ] as const)('records a Relay %s', (status, relayStatus) => {
      expect(
        applyRelayCompletion(submittedExecution, { status }),
      ).toStrictEqual({ ...submittedExecution, relayStatus });
    });

    it.each(['timeout', 'source-failed'] as const)(
      'keeps the checkpoint on %s',
      (status) => {
        expect(applyRelayCompletion(submittedExecution, { status })).toBe(
          submittedExecution,
        );
      },
    );
  });

  describe('readSolanaSourceFailure', () => {
    const getSolanaSourceFailureMock = jest.mocked(getSolanaSourceFailure);
    const { messenger } = getMessengerMock();

    const pendingExecution = getExecution({
      lastValidBlockHeight: 100,
      phase: 'submitted',
      sourceStatus: 'pending',
      sourceTransactionId: 'signature',
    });

    beforeEach(() => {
      getSolanaSourceFailureMock.mockReset();
    });

    it('returns the failure of an unobserved source transaction', async () => {
      getSolanaSourceFailureMock.mockResolvedValue(
        'Solana source transaction expired',
      );

      expect(await readSolanaSourceFailure(messenger, pendingExecution)).toBe(
        'Solana source transaction expired',
      );
      expect(getSolanaSourceFailureMock).toHaveBeenCalledWith({
        lastValidBlockHeight: 100,
        messenger,
        scope: SOLANA_CHAIN_ID,
        signature: 'signature',
      });
    });

    it('returns undefined when the RPC read fails', async () => {
      getSolanaSourceFailureMock.mockRejectedValue(new Error('rpc'));

      expect(
        await readSolanaSourceFailure(messenger, pendingExecution),
      ).toBeUndefined();
    });

    it.each([
      ['an attempting source', getExecution()],
      [
        'a source observed by Relay',
        getExecution({
          phase: 'submitted',
          sourceStatus: 'confirmed',
          sourceTransactionId: 'signature',
        }),
      ],
    ])('does not read the RPC for %s', async (_title, execution) => {
      expect(
        await readSolanaSourceFailure(messenger, execution),
      ).toBeUndefined();
      expect(getSolanaSourceFailureMock).not.toHaveBeenCalled();
    });
  });

  describe('applySolanaSourceFailure', () => {
    it('records a failed source transaction', () => {
      const execution = applySolanaSourceFailure(
        getExecution({
          phase: 'submitted',
          sourceStatus: 'pending',
          sourceTransactionId: 'signature',
        }),
        'Solana source transaction expired',
      );

      expect(execution).toMatchObject({
        sourceFailureReason: 'Solana source transaction expired',
        sourceStatus: 'failed',
      });
      expect(deriveSolanaPayOutcome(execution)).toBe('source-failed');
    });

    it('keeps the checkpoint when the source may still land', () => {
      const execution = getExecution();

      expect(applySolanaSourceFailure(execution, undefined)).toBe(execution);
    });
  });

  describe('submitSolanaPayFollowUp', () => {
    const submitSecondLegMock = jest.mocked(submitSecondLeg);
    const {
      getTransactionControllerStateMock,
      messenger,
      updateTransactionMock,
    } = getMessengerMock();

    const OVERRIDE_ACCOUNT =
      '0x9999999999999999999999999999999999999999' as Hex;

    let transaction: TransactionMeta;

    function setExecution(
      overrides: Partial<MetamaskPaySolanaExecution> = {},
    ): void {
      transaction = {
        id: 'transaction-1',
        metamaskPay: {
          solanaExecution: getExecution({
            followUpStatus: 'not-started',
            phase: 'submitted',
            relayStatus: 'success',
            requiresNonAtomicFollowUp: true,
            sourceStatus: 'confirmed',
            sourceTransactionId: 'signature',
            targetTransactionId: '0xtarget',
            ...overrides,
          }),
        },
        txParams: { from: RECIPIENT },
      } as TransactionMeta;
    }

    beforeEach(() => {
      jest.resetAllMocks();
      setExecution();

      getTransactionControllerStateMock.mockImplementation(() => ({
        transactions: [transaction],
      }));
      updateTransactionMock.mockImplementation((updated: TransactionMeta) => {
        transaction = updated;
      });
    });

    it('runs the second leg once from the target transaction account after Relay delivered the funds', async () => {
      submitSecondLegMock.mockImplementation(async () => {
        expect(transaction.metamaskPay?.solanaExecution?.followUpStatus).toBe(
          'attempting',
        );
        return { transactionHash: '0xsecond' };
      });

      await submitSolanaPayFollowUp(messenger, 'transaction-1');
      await submitSolanaPayFollowUp(messenger, 'transaction-1');

      expect(submitSecondLegMock).toHaveBeenCalledTimes(1);
      expect(submitSecondLegMock).toHaveBeenCalledWith({
        chainId: '0xa4b1',
        from: RECIPIENT,
        messenger,
        settlementHash: '0xtarget',
        tokenAddress: TARGET_TOKEN,
        transaction: expect.objectContaining({ id: 'transaction-1' }),
      });
      expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
        followUpStatus: 'confirmed',
        followUpTransactionId: '0xsecond',
      });
    });

    it('spends from the target transaction account even when the quote account was overridden', async () => {
      transaction = {
        ...transaction,
        txParams: { from: OVERRIDE_ACCOUNT },
      } as TransactionMeta;
      submitSecondLegMock.mockResolvedValue({ transactionHash: '0xsecond' });

      await submitSolanaPayFollowUp(messenger, 'transaction-1');

      expect(submitSecondLegMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: OVERRIDE_ACCOUNT }),
      );
    });

    it.each([
      ['an Error', new Error('Second leg: failed'), 'Second leg: failed'],
      ['a non-error rejection', 'timeout', 'timeout'],
    ])(
      'records %s from the second leg as a failed follow-up',
      async (_title, error, reason) => {
        submitSecondLegMock.mockRejectedValue(error);

        await submitSolanaPayFollowUp(messenger, 'transaction-1');

        const execution = transaction.metamaskPay
          ?.solanaExecution as MetamaskPaySolanaExecution;

        expect(execution).toMatchObject({
          followUpFailureReason: reason,
          followUpStatus: 'failed',
        });
        expect(getSolanaPayFailure(getSolanaPayStatus(execution))).toBe(reason);
      },
    );

    it.each([
      ['the follow-up is not required', { followUpStatus: 'not-required' }],
      ['the follow-up already started', { followUpStatus: 'attempting' }],
      ['Relay has not succeeded', { relayStatus: 'pending' }],
      ['the source is not confirmed', { sourceStatus: 'pending' }],
    ] as const)(
      'does nothing when %s',
      async (_title, overrides: Partial<MetamaskPaySolanaExecution>) => {
        setExecution(overrides);

        await submitSolanaPayFollowUp(messenger, 'transaction-1');

        expect(submitSecondLegMock).not.toHaveBeenCalled();
        expect(updateTransactionMock).not.toHaveBeenCalled();
      },
    );

    it('does nothing when the transaction is missing', async () => {
      getTransactionControllerStateMock.mockReturnValue({ transactions: [] });

      await submitSolanaPayFollowUp(messenger, 'transaction-1');

      expect(submitSecondLegMock).not.toHaveBeenCalled();
    });
  });

  describe('getSolanaPayStatus', () => {
    it.each([
      [{ phase: 'submitted', sourceTransactionId: 'sig' }, 'submitted', 'sig'],
      [{ phase: 'user-rejected' }, 'user-rejected', undefined],
      [{ phase: 'not-submitted' }, 'not-submitted', undefined],
      [{ phase: 'unknown' }, 'ambiguous', undefined],
      [{ phase: 'attempting' }, undefined, undefined],
    ] as const)(
      'derives submission outcome %#',
      (overrides, submissionOutcome, sourceTransactionId) => {
        expect(getSolanaPayStatus(getExecution(overrides))).toMatchObject({
          sourceTransactionId,
          submissionOutcome,
        });
      },
    );

    it.each([
      ['succeeded', true],
      ['refunded', true],
      ['not-submitted', true],
      ['submitted', false],
      ['unknown', false],
    ] as const)('treats %s as terminal: %s', (outcome, expected) => {
      expect(
        isTerminalSolanaPayOutcome({
          ...getSolanaPayStatus(getExecution()),
          outcome,
        }),
      ).toBe(expected);
    });
  });

  describe('getSolanaPayFailure', () => {
    it.each([
      [{}, 'source-failed', 'Solana source transaction failed'],
      [{ sourceFailureReason: 'reverted' }, 'source-failed', 'reverted'],
      [{}, 'relay-failed', 'Relay settlement failed'],
      [{ relayFailureReason: 'solver' }, 'relay-failed', 'solver'],
      [{}, 'refunded', 'Relay settlement refunded'],
      [{}, 'follow-up-failed', 'Solana pay non-atomic follow-up failed'],
      [{}, 'submitted', undefined],
    ] as const)('maps failure %#', (overrides, outcome, expected) => {
      expect(
        getSolanaPayFailure({
          ...getSolanaPayStatus(getExecution()),
          ...overrides,
          outcome,
        }),
      ).toBe(expected);
    });
  });

  it.each([
    ['success', 'success'],
    ['failure', 'failure'],
    ['refund', 'refund'],
    ['refunded', 'refund'],
    ['waiting', 'pending'],
  ] as const)('maps Relay status %s to %s', (relayStatus, expected) => {
    expect(mapRelayStatus(relayStatus)).toBe(expected);
  });
});
