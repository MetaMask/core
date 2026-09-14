import { Interface } from '@ethersproject/abi';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type {
  CaipAccountId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import { PaymentOverride } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type {
  SolanaPayPreflightData,
  TransactionData,
  TransactionPayIntent,
} from '../../types.js';
import {
  buildRelaySolanaQuoteRequest,
  deriveSolanaPayOutcome,
  getRelaySolanaTransaction,
  mapRelayStatus,
  normalizeSolanaPayPreflight,
} from './solana-pay.js';
import type { RelaySolanaQuote, RelaySolanaTransaction } from './types.js';

const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const SOLANA_ACCOUNT =
  `${SOLANA_CHAIN_ID}:7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z` as CaipAccountId;
const SOLANA_USDC =
  `${SOLANA_CHAIN_ID}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as CaipAssetType;
const SOLANA_NATIVE = `${SOLANA_CHAIN_ID}/slip44:501` as CaipAssetType;
const SOLANA_NATIVE_RELAY_ADDRESS = '11111111111111111111111111111111';

function getIntent(sourceAssetId: CaipAssetType): TransactionPayIntent {
  return {
    version: 2,
    sourceAccountId: SOLANA_ACCOUNT,
    sourceAmountRaw: '1000000',
    sourceAssetId,
    sourceChainId: SOLANA_CHAIN_ID,
    sourceWalletAccountId: 'wallet-account-uuid',
  };
}

function getQuote(): RelaySolanaQuote {
  return {
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
    const RECIPIENT = '0x1234567890123456789012345678901234567890' as Hex;
    const TARGET_TOKEN = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;
    const TRANSACTION = {
      id: 'transaction-1',
      txParams: { from: RECIPIENT },
    } as TransactionMeta;
    const TRANSACTION_DATA: TransactionData = {
      isLoading: false,
      sourceAmounts: [
        {
          sourceAmountHuman: '1',
          sourceAmountRaw: '1000000',
          targetTokenAddress: TARGET_TOKEN,
        },
      ],
      tokens: [
        {
          address: TARGET_TOKEN,
          allowUnderMinimum: false,
          amountFiat: '1',
          amountHuman: '1',
          amountRaw: '900000',
          amountUsd: '1',
          balanceFiat: '0',
          balanceHuman: '0',
          balanceRaw: '0',
          balanceUsd: '0',
          chainId: '0xa4b1' as Hex,
          decimals: 6,
          skipIfBalance: false,
          symbol: 'USDC',
        },
      ],
    };
    const { getDelegationTransactionMock, messenger } = getMessengerMock();

    beforeEach(() => {
      getDelegationTransactionMock.mockResolvedValue({
        data: '0x1234',
        to: '0x9876543210987654321098765432109876543210',
        value: '0x0',
      });
    });

    it('derives an exact-input SPL route from Core transaction state', async () => {
      const result = await buildRelaySolanaQuoteRequest(
        getIntent(SOLANA_USDC),
        TRANSACTION,
        TRANSACTION_DATA,
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
        getIntent(SOLANA_NATIVE),
        TRANSACTION,
        TRANSACTION_DATA,
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
        getIntent(SOLANA_USDC),
        { ...TRANSACTION, type },
        TRANSACTION_DATA,
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

    it('uses the immutable Solana intent amount for Money Account despite stale EVM source amounts', async () => {
      const result = await buildRelaySolanaQuoteRequest(
        { ...getIntent(SOLANA_USDC), sourceAmountRaw: '765432' },
        { ...TRANSACTION, type: TransactionType.predictDeposit },
        {
          ...TRANSACTION_DATA,
          atomic: false,
          paymentOverride: PaymentOverride.MoneyAccount,
        },
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
        getIntent(SOLANA_USDC),
        { ...TRANSACTION, type: TransactionType.predictDeposit },
        TRANSACTION_DATA,
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
          getIntent(SOLANA_USDC),
          { ...TRANSACTION, type: TransactionType.predictDeposit },
          { ...TRANSACTION_DATA, atomic: false },
          messenger,
        ),
      ).rejects.toThrow('Unsupported non-atomic Solana Pay product route');
    });

    it('rejects a route without a target token', async () => {
      await expect(
        buildRelaySolanaQuoteRequest(
          getIntent(SOLANA_USDC),
          TRANSACTION,
          { ...TRANSACTION_DATA, tokens: [] },
          messenger,
        ),
      ).rejects.toThrow('Missing Solana Pay target token');
    });

    it('rejects an exact-input route without a Core-derived source amount', async () => {
      const intent = { ...getIntent(SOLANA_USDC), sourceAmountRaw: undefined };
      await expect(
        buildRelaySolanaQuoteRequest(
          intent,
          TRANSACTION,
          { ...TRANSACTION_DATA, sourceAmounts: undefined },
          messenger,
        ),
      ).rejects.toThrow('Missing Solana Pay source amount');
    });

    it.each([
      [
        {
          ...getIntent(SOLANA_USDC),
          sourceChainId: 'solana:devnet' as CaipChainId,
        },
        'Unsupported Solana source chain',
      ],
      [
        {
          ...getIntent(SOLANA_USDC),
          sourceAccountId: 'solana:other:account' as CaipAccountId,
        },
        'Solana source account does not match source chain',
      ],
      [
        {
          ...getIntent(SOLANA_USDC),
          sourceAssetId: 'solana:other/token:mint' as CaipAssetType,
        },
        'Solana source asset does not match source chain',
      ],
      [
        getIntent(`${SOLANA_CHAIN_ID}/erc20:0x1234` as CaipAssetType),
        'Unsupported Solana source asset',
      ],
    ] as const)('rejects invalid source identity %#', async (intent, error) => {
      await expect(
        buildRelaySolanaQuoteRequest(
          intent,
          TRANSACTION,
          TRANSACTION_DATA,
          messenger,
        ),
      ).rejects.toThrow(error);
    });
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

  describe('normalizeSolanaPayPreflight', () => {
    const PREFLIGHT_DATA: SolanaPayPreflightData = {
      preparedTransaction: 'base64-transaction',
      preparationId: 'preparation-123',
      nativeBalanceRaw: '100000',
      networkFeeRaw: '5000',
      priorityFeeRaw: '1000',
      rentDebitRaw: '2000',
      rentExemptionRequirementRaw: '3000',
      sourceBalanceRaw: '2000000',
    };

    it('retains finalized fees and rent for an affordable SPL payment', () => {
      expect(
        normalizeSolanaPayPreflight(
          getIntent(SOLANA_USDC),
          '1000000',
          PREFLIGHT_DATA,
        ),
      ).toStrictEqual({
        affordability: {
          isAffordable: true,
          nativeShortfallRaw: '0',
          sourceShortfallRaw: '0',
        },
        preparedTransaction: 'base64-transaction',
        preparationId: 'preparation-123',
        nativeBalanceRaw: '100000',
        networkFeeRaw: '5000',
        priorityFeeRaw: '1000',
        rentDebitRaw: '2000',
        rentExemptionRequirementRaw: '3000',
        requiredNativeBalanceRaw: '11000',
        requiredSourceBalanceRaw: '1000000',
        retainedReserveRaw: '11000',
        sourceAmountRaw: '1000000',
        sourceBalanceRaw: '2000000',
        totalFeeRaw: '6000',
      });
    });

    it('includes the retained reserve in native SOL affordability', () => {
      expect(
        normalizeSolanaPayPreflight(getIntent(SOLANA_NATIVE), '95000', {
          ...PREFLIGHT_DATA,
          nativeBalanceRaw: '100000',
          sourceBalanceRaw: '100000',
        }),
      ).toMatchObject({
        affordability: {
          isAffordable: false,
          nativeShortfallRaw: '0',
          sourceShortfallRaw: '6000',
        },
        requiredNativeBalanceRaw: '106000',
        requiredSourceBalanceRaw: '106000',
        retainedReserveRaw: '11000',
      });
    });

    it('rejects inconsistent native SOL balance observations', () => {
      expect(() =>
        normalizeSolanaPayPreflight(getIntent(SOLANA_NATIVE), '1', {
          ...PREFLIGHT_DATA,
          nativeBalanceRaw: '2',
          sourceBalanceRaw: '1',
        }),
      ).toThrow('Invalid Solana preflight native balance mismatch');
    });

    it('reports source and native shortfalls independently for SPL', () => {
      expect(
        normalizeSolanaPayPreflight(getIntent(SOLANA_USDC), '1000000', {
          ...PREFLIGHT_DATA,
          nativeBalanceRaw: '10000',
          sourceBalanceRaw: '900000',
        }),
      ).toMatchObject({
        affordability: {
          isAffordable: false,
          nativeShortfallRaw: '1000',
          sourceShortfallRaw: '100000',
        },
      });
    });

    it('rejects an unbound prepared transaction', () => {
      expect(() =>
        normalizeSolanaPayPreflight(getIntent(SOLANA_USDC), '1000000', {
          ...PREFLIGHT_DATA,
          preparationId: '',
        }),
      ).toThrow('Invalid Solana preflight preparation');
    });

    it.each([
      ['networkFeeRaw', '-1'],
      ['priorityFeeRaw', '1.5'],
      ['rentDebitRaw', 'abc'],
      ['rentExemptionRequirementRaw', ''],
      ['sourceBalanceRaw', '-2'],
      ['nativeBalanceRaw', 'NaN'],
    ] as const)('rejects invalid atomic input %s', (field, value) => {
      expect(() =>
        normalizeSolanaPayPreflight(getIntent(SOLANA_USDC), '1000000', {
          ...PREFLIGHT_DATA,
          [field]: value,
        }),
      ).toThrow(`Invalid Solana preflight ${field}`);
    });
  });

  describe('deriveSolanaPayOutcome', () => {
    it.each([
      [
        {
          submissionOutcome: 'user-rejected',
          sourceStatus: 'user-rejected',
        },
        { type: 'user-rejected' },
      ],
      [
        {
          submissionOutcome: 'not-submitted',
          sourceStatus: 'not-submitted',
        },
        { guaranteedNotSubmitted: true, type: 'source-failed' },
      ],
      [
        { sourceStatus: 'failed' },
        { guaranteedNotSubmitted: false, type: 'source-failed' },
      ],
      [{ relayStatus: 'failure' }, { type: 'relay-failed' }],
      [{ relayStatus: 'refund' }, { type: 'refunded' }],
      [{ followUpStatus: 'failed' }, { type: 'follow-up-failed' }],
      [
        { submissionOutcome: 'ambiguous', sourceStatus: 'unknown' },
        { phase: 'source', type: 'unknown' },
      ],
      [{ relayStatus: 'unknown' }, { phase: 'relay', type: 'unknown' }],
      [{ followUpStatus: 'unknown' }, { phase: 'follow-up', type: 'unknown' }],
      [
        {
          followUpStatus: 'confirmed',
          relayStatus: 'success',
          sourceStatus: 'confirmed',
        },
        { type: 'succeeded' },
      ],
      [{ sourceStatus: 'attempting' }, { type: 'attempting' }],
      [{ sourceStatus: 'submitted' }, { type: 'submitted' }],
    ] as const)('derives %# from durable axes', (overrides, expected) => {
      const intent: TransactionPayIntent = {
        ...getIntent(SOLANA_USDC),
        execution: {
          followUpStatus: 'not-required',
          providerNotificationStatus: 'not-started',
          relayStatus: 'not-started',
          sourceStatus: 'not-started',
          ...overrides,
        },
      };

      expect(deriveSolanaPayOutcome(intent)).toMatchObject(expected);
    });

    it('does not succeed when a required atomic product action was omitted', () => {
      const intent: TransactionPayIntent = {
        ...getIntent(SOLANA_USDC),
        atomicProductActionIncluded: false,
        atomicProductActionRequired: true,
        execution: {
          followUpStatus: 'not-required',
          providerNotificationStatus: 'succeeded',
          relayStatus: 'success',
          sourceStatus: 'confirmed',
        },
      };

      expect(deriveSolanaPayOutcome(intent)).toStrictEqual({
        type: 'submitted',
      });
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
