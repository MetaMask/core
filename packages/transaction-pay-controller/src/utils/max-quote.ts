import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { accountRequiresMfa } from './account.js';
import { prefixError } from './error-prefix.js';
import { isAtomicMaxEnabled } from './feature-flags.js';
import { getMaxGasStationQuote } from './max-gas-station.js';
import type { MaxGasStationQuoteDetails } from './max-gas-station.js';
import { getEvmQuoteSource, getTokenInfo } from './token.js';
import { QuoteError } from './validation.js';

const ATOMIC_PROMOTION_FAILURE_PREFIX = 'Atomic promotion failed: ';

/**
 * Provider-agnostic view of a quote, supplied by each strategy so the max
 * flow never reads a strategy's original quote shape directly.
 */
export type MaxQuoteDetails = MaxGasStationQuoteDetails & {
  /** Whether the route is subsidized, so it exchanges 1:1 without fees. */
  isSubsidized: boolean;

  /** Raw amount of the target token the quote delivers. */
  targetAmountRaw: string;
};

/**
 * Callbacks bridging the max flow to a specific strategy.
 */
export type MaxQuotesRequest<OriginalQuote> = {
  /** Full quote context, including the original transaction. */
  fullRequest: PayStrategyGetQuotesRequest;

  /** Map a strategy quote to the details the flow needs. */
  getQuoteDetails: (
    quote: TransactionPayQuote<OriginalQuote>,
  ) => MaxQuoteDetails;

  /**
   * Fetch quotes from every available provider.
   *
   * The transaction is the original, or a copy whose calls are re-encoded for
   * an atomic max amount. Embedded calls must be built from it.
   */
  getQuotes: (
    request: QuoteRequest,
    transaction: TransactionMeta,
  ) => Promise<TransactionPayQuote<OriginalQuote>[]>;

  /** Fetch a quote from the same provider as an existing quote. */
  requote: (
    quote: TransactionPayQuote<OriginalQuote>,
    request: QuoteRequest,
    transaction: TransactionMeta,
  ) => Promise<TransactionPayQuote<OriginalQuote>>;

  /** Max-amount quote request. */
  request: QuoteRequest;

  /**
   * Validate an atomic quote before it is returned.
   *
   * A failure is treated as a failed atomic promotion, so the next strategy is
   * tried.
   */
  validateAtomicQuote?: (
    quote: TransactionPayQuote<OriginalQuote>,
  ) => Promise<void>;
};

/**
 * Fetch quotes that spend the whole source balance.
 *
 * Every quote is re-quoted, when needed, so origin gas can be paid from the
 * source token. See {@link getMaxGasStationQuote}.
 *
 * When atomic max is enabled, subsidized routes are instead quoted as an
 * atomic exact-output quote that embeds the transaction's calls re-encoded for
 * the max amount. The request's `atomic` value is a subsidy hint:
 *
 * - Not `false`: quote atomically first, falling back to a non-atomic quote
 * when the route is not subsidized.
 * - `false`: quote non-atomically first, promoting to an atomic quote when the
 * route turns out to be subsidized. A failed promotion is terminal.
 *
 * @param options - Max quotes request.
 * @returns One quote per provider.
 */
export async function getMaxQuotes<OriginalQuote>(
  options: MaxQuotesRequest<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote>[]> {
  const { fullRequest, getQuotes, request } = options;
  const { messenger, transaction } = fullRequest;

  if (!isAtomicMaxSupported({ messenger, request, transaction })) {
    // Only the atomic flows below may produce an atomic max quote.
    const nonAtomicRequest =
      request.atomic === true ? { ...request, atomic: undefined } : request;

    const quotes = await getQuotes(nonAtomicRequest, transaction);
    return Promise.all(quotes.map((quote) => withGasStation(quote, options)));
  }

  if (request.atomic === false) {
    return getPromotedQuotes(options);
  }

  return getAtomicFirstQuotes(options);
}

/**
 * Whether a max request may be quoted atomically, embedding the transaction's
 * calls in the quote.
 *
 * Strategies use this to decide whether to embed calls for a max request, so
 * it must agree with the routing in {@link getMaxQuotes}.
 *
 * @param options - Options bag.
 * @param options.messenger - Controller messenger.
 * @param options.request - Quote request.
 * @param options.transaction - Transaction being quoted.
 * @returns Whether atomic max quoting is supported.
 */
export function isAtomicMaxSupported({
  messenger,
  request,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  request: Pick<QuoteRequest, 'isPostQuote'>;
  transaction?: TransactionMeta;
}): boolean {
  return (
    request.isPostQuote !== true && isAtomicMaxEnabled(messenger, transaction)
  );
}

/**
 * Whether a quote is an atomic max quote from {@link getMaxQuotes}, so it was
 * already validated by `validateAtomicQuote`.
 *
 * @param quote - Quote to check.
 * @returns Whether the quote is an atomic max quote.
 */
export function isAtomicMaxQuote(
  quote: Pick<TransactionPayQuote<unknown>, 'request'>,
): boolean {
  return quote.request.isMaxAmount === true && quote.request.atomic === true;
}

async function getAtomicFirstQuotes<OriginalQuote>(
  options: MaxQuotesRequest<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote>[]> {
  const {
    fullRequest,
    getQuoteDetails,
    getQuotes,
    request,
    requote,
    validateAtomicQuote,
  } = options;

  const atomic = await buildAtomicMaxRequest({
    amount: getFixedRateTargetAmount(fullRequest.messenger, request),
    fullRequest,
    request,
  });

  const quotes = await getQuotes(atomic.request, atomic.transaction);

  return Promise.all(
    quotes.map(async (quote) => {
      if (getQuoteDetails(quote).isSubsidized) {
        return withAtomicPromotionFailure(async () => {
          await validateAtomicQuote?.(quote);
          return quote;
        });
      }

      const nonAtomicQuote = await requote(
        quote,
        { ...request, atomic: false },
        fullRequest.transaction,
      );

      return withGasStation(nonAtomicQuote, options);
    }),
  );
}

async function getPromotedQuotes<OriginalQuote>(
  options: MaxQuotesRequest<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote>[]> {
  const {
    fullRequest,
    getQuoteDetails,
    getQuotes,
    request,
    requote,
    validateAtomicQuote,
  } = options;

  const quotes = await getQuotes(request, fullRequest.transaction);

  return Promise.all(
    quotes.map(async (discoveryQuote) => {
      const quote = await withGasStation(discoveryQuote, options);
      const details = getQuoteDetails(quote);

      if (!details.isSubsidized) {
        return quote;
      }

      // A request whose signing keyring requires MFA arrives here already
      // cleared to `atomic: false` by `updateQuotes`. Promotion ignores that
      // hint and sets `atomic: true` regardless, which would embed the target
      // calls again and reintroduce the per-quote delegation signature.
      if (
        accountRequiresMfa(
          fullRequest.messenger,
          fullRequest.transaction.txParams.from,
        )
      ) {
        return quote;
      }

      return withAtomicPromotionFailure(async () => {
        const atomic = await buildAtomicMaxRequest({
          amount: details.targetAmountRaw,
          fullRequest,
          request,
        });

        const promotedQuote = await requote(
          quote,
          atomic.request,
          atomic.transaction,
        );

        if (!getQuoteDetails(promotedQuote).isSubsidized) {
          throw new Error('Promoted quote lost subsidy');
        }

        await validateAtomicQuote?.(promotedQuote);

        return promotedQuote;
      });
    }),
  );
}

/**
 * Run an atomic quote step, converting any failure into the terminal atomic
 * promotion error so the next strategy is tried.
 *
 * @param fn - Atomic quote step.
 * @returns The step result.
 */
async function withAtomicPromotionFailure<Result>(
  fn: () => Promise<Result>,
): Promise<Result> {
  try {
    return await fn();
  } catch (error) {
    const prefixed = prefixError(error, ATOMIC_PROMOTION_FAILURE_PREFIX);

    throw new QuoteError({
      detail: [prefixed.message],
      message: prefixed.message,
      reason: 'no-quotes',
    });
  }
}

function withGasStation<OriginalQuote>(
  quote: TransactionPayQuote<OriginalQuote>,
  { fullRequest, getQuoteDetails, requote }: MaxQuotesRequest<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote>> {
  return getMaxGasStationQuote({
    getQuoteDetails,
    messenger: fullRequest.messenger,
    quote,
    requote: (adjustedRequest) =>
      requote(quote, adjustedRequest, fullRequest.transaction),
  });
}

/**
 * Target amount for a subsidized route spending the whole source budget.
 *
 * Fixed-spread subsidized routes exchange stablecoins 1:1 without fees, so the
 * source budget converts directly, rather than the required amount from
 * before Max was selected.
 *
 * @param messenger - Controller messenger.
 * @param request - Max quote request.
 * @returns Raw target amount.
 */
function getFixedRateTargetAmount(
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): string {
  const { chainId: sourceChainId, tokenAddress: sourceTokenAddress } =
    getEvmQuoteSource(request);

  const sourceToken = getTokenInfo(
    messenger,
    sourceTokenAddress,
    sourceChainId,
  );

  const targetToken = getTokenInfo(
    messenger,
    request.targetTokenAddress,
    request.targetChainId,
  );

  if (!sourceToken || !targetToken) {
    throw new Error('Token decimals not found for atomic max quote');
  }

  return new BigNumber(request.sourceTokenAmount)
    .shiftedBy(targetToken.decimals - sourceToken.decimals)
    .toFixed(0, BigNumber.ROUND_DOWN);
}

/**
 * Build an atomic exact-output request, with a copy of the transaction whose
 * calls and required asset are re-encoded for the target amount.
 *
 * @param options - Options bag.
 * @param options.amount - Raw target amount.
 * @param options.fullRequest - Full quote context.
 * @param options.request - Max quote request.
 * @returns The atomic request and the transaction to embed.
 */
async function buildAtomicMaxRequest({
  amount,
  fullRequest,
  request,
}: {
  amount: string;
  fullRequest: PayStrategyGetQuotesRequest;
  request: QuoteRequest;
}): Promise<{ request: QuoteRequest; transaction: TransactionMeta }> {
  const targetAmount = validatePositiveIntegerString(amount);

  const transaction = await applyAmountDataUpdates({
    amount: targetAmount,
    messenger: fullRequest.messenger,
    transaction: fullRequest.transaction,
  });

  return {
    request: { ...request, atomic: true, targetAmountMinimum: targetAmount },
    transaction,
  };
}

function validatePositiveIntegerString(value: string): string {
  const amount = new BigNumber(value);

  if (!amount.isFinite() || !amount.isInteger() || !amount.isGreaterThan(0)) {
    throw new Error(`Invalid target amount: ${value}`);
  }

  return amount.toFixed(0);
}

/**
 * Copy a transaction with its calls and first required asset re-encoded for
 * an amount, leaving the original untouched.
 *
 * @param options - Options bag.
 * @param options.amount - Raw amount to encode.
 * @param options.messenger - Controller messenger.
 * @param options.transaction - Original transaction.
 * @returns The updated copy.
 */
async function applyAmountDataUpdates({
  amount,
  messenger,
  transaction,
}: {
  amount: string;
  messenger: TransactionPayControllerMessenger;
  transaction: TransactionMeta;
}): Promise<TransactionMeta> {
  // The callback gets its own copy, so the updates below never leak into it.
  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    { amount, transaction: cloneTransaction(transaction) },
  );

  const updatedTransaction = cloneTransaction(transaction);
  const { nestedTransactions, requiredAssets } = updatedTransaction;

  if (!updates.length) {
    throw new Error('getAmountData returned no updates for atomic promotion');
  }

  if (!nestedTransactions?.length) {
    throw new Error('Missing nested transactions for atomic promotion');
  }

  for (const { nestedTransactionIndex, data } of updates) {
    if (!nestedTransactions[nestedTransactionIndex]) {
      throw new Error(
        'getAmountData returned an unusable nested transaction update',
      );
    }

    nestedTransactions[nestedTransactionIndex].data = data;
  }

  if (!requiredAssets?.[0]) {
    throw new Error('Missing required assets for atomic promotion');
  }

  requiredAssets[0].amount = toHex(BigInt(amount));

  return updatedTransaction;
}

function cloneTransaction(transaction: TransactionMeta): TransactionMeta {
  return {
    ...transaction,
    nestedTransactions: transaction.nestedTransactions?.map(
      (nestedTransaction) => ({ ...nestedTransaction }),
    ),
    requiredAssets: transaction.requiredAssets?.map((requiredAsset) => ({
      ...requiredAsset,
    })),
  };
}
