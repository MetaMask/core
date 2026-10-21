import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  Amount,
  FiatRates,
  NonEvmQuoteRequest,
  NonEvmTransactionPayQuote,
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { getFiatValueFromUsd } from '../../utils/amounts.js';
import { isRelaySolanaEnabled } from '../../utils/feature-flags.js';
import { getAssetBalance, getAssetFiatRate } from '../../utils/token.js';
import { QuoteError } from '../../utils/validation.js';
import { fetchRelaySolanaQuote } from './relay-api.js';
import {
  calculateDustUsd,
  calculateProviderFee,
  getSubsidizedFeeAmountUsd,
  isStablecoin,
} from './relay-quotes.js';
import {
  buildRelaySolanaQuoteRequest,
  getRelaySolanaTransaction,
  getSolanaAffordability,
  getSolanaNativeAssetId,
  getSolanaSourceAddress,
  isSolanaNativeRequest,
} from './solana-pay.js';
import {
  compileRelaySolanaTransaction,
  computeSolanaFeeRaw,
  getAccountSnapId,
  getSolanaRentReserveRaw,
} from './solana-transaction.js';
import type {
  RelaySolanaPayQuote,
  RelaySolanaQuote,
  RelaySolanaQuoteRequest,
} from './types.js';

const log = createModuleLogger(projectLogger, 'relay-solana-quotes');

const SOLANA_DECIMALS = 9;
const SOLANA_TX_TOO_LARGE = 'SOLANA_TX_TOO_LARGE';
const SOLANA_MAX_ROUTE_LENGTH = 4;

/**
 * Fetches Relay quotes for non-EVM payment token requests.
 *
 * Each quote is an ordinary Pay quote: the provider and MetaMask fees come
 * from Relay, the source network fee comes from the Snap `computeFee` of the
 * Core-compiled transaction, and the compiled transaction is kept in
 * `original.metamask` for execution.
 *
 * @param request - Strategy quotes request.
 * @returns Normalized quotes.
 */
export async function getRelaySolanaQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<NonEvmTransactionPayQuote<RelaySolanaPayQuote>[]> {
  const { messenger, nonEvmRequests = [] } = request;

  if (!isRelaySolanaEnabled(messenger)) {
    log('Solana quotes disabled');
    return [];
  }

  // One target transaction owns one durable Solana checkpoint, so it can be
  // funded by at most one Snap signature.
  if (nonEvmRequests.length > 1) {
    throw new Error('Multiple Solana quote requests are not supported');
  }

  const quotes = await Promise.all(
    nonEvmRequests.map((singleRequest) =>
      getSingleSolanaQuote(singleRequest, request),
    ),
  );

  const unaffordable = quotes.find(
    (quote) => !quote.original.metamask.affordability.isAffordable,
  );

  if (unaffordable) {
    throw new QuoteError(
      {
        message: 'Insufficient Solana balance for quote',
        reason: 'insufficient-source-balance',
        detail: formatSolanaShortfall(unaffordable),
      },
      quotes,
    );
  }

  return quotes;
}

async function getSingleSolanaQuote(
  request: NonEvmQuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<NonEvmTransactionPayQuote<RelaySolanaPayQuote>> {
  const { messenger, signal, transaction } = fullRequest;
  const scope = request.sourceChainId;
  const snapId = getAccountSnapId(messenger, request.sourceWalletAccountId);
  const isNative = isSolanaNativeRequest(request);

  const rentReserveRaw = await getSolanaRentReserveRaw({
    messenger,
    scope,
    snapId,
  });

  const quoteRequest = await buildRelaySolanaQuoteRequest(
    request,
    transaction,
    messenger,
  );

  let quote = await fetchSolanaQuote(messenger, quoteRequest, signal);
  let compiled = await compileQuote(messenger, request, quote);
  let feeRaw = await computeFee(
    messenger,
    request,
    snapId,
    compiled.transaction,
  );

  // Native SOL max: Relay must never receive a fee-free Max, so re-quote with
  // the fee and rent reserve withheld from the source amount.
  if (
    request.isMaxAmount &&
    isNative &&
    quoteRequest.tradeType === 'EXACT_INPUT'
  ) {
    const adjustedAmount = new BigNumber(request.sourceBalanceRaw)
      .minus(feeRaw)
      .minus(rentReserveRaw);

    if (adjustedAmount.lte(0)) {
      throw new QuoteError({
        message: 'Insufficient Solana balance for quote',
        reason: 'insufficient-source-balance',
      });
    }

    quote = await fetchSolanaQuote(
      messenger,
      { ...quoteRequest, amount: adjustedAmount.toFixed(0) },
      signal,
    );
    compiled = await compileQuote(messenger, request, quote);
    feeRaw = await computeFee(messenger, request, snapId, compiled.transaction);
  }

  const sourceAmountRaw = quote.details.currencyIn.amount;

  if (
    quote.request.tradeType === 'EXACT_INPUT' &&
    sourceAmountRaw !== quote.request.amount
  ) {
    throw new Error('Relay Solana source amount mismatch');
  }

  const nativeBalanceRaw = isNative
    ? request.sourceBalanceRaw
    : getAssetBalance(
        messenger,
        request.sourceWalletAccountId,
        getSolanaNativeAssetId(scope),
      );

  const affordability = getSolanaAffordability({
    feeRaw,
    isNative,
    nativeBalanceRaw,
    rentReserveRaw,
    sourceAmountRaw,
    sourceBalanceRaw: request.sourceBalanceRaw,
  });

  log('Solana quote', { affordability, feeRaw, rentReserveRaw });

  return normalizeSolanaQuote(
    {
      ...quote,
      metamask: {
        affordability,
        feeRaw,
        lastValidBlockHeight: compiled.lastValidBlockHeight,
        rentReserveRaw,
        transaction: compiled.transaction,
      },
    },
    request,
    messenger,
  );
}

/**
 * Fetches a /quote/v2 Solana quote, retrying once with a shorter route when
 * Relay rejects the transaction as too large.
 *
 * @param messenger - Controller messenger.
 * @param quoteRequest - Relay Solana request.
 * @param signal - Abort signal.
 * @returns The Relay quote with its request attached.
 */
async function fetchSolanaQuote(
  messenger: TransactionPayControllerMessenger,
  quoteRequest: RelaySolanaQuoteRequest,
  signal?: AbortSignal,
): Promise<RelaySolanaQuote> {
  try {
    return await fetchRelaySolanaQuote(messenger, quoteRequest, signal);
  } catch (error) {
    if (!String(error).includes(SOLANA_TX_TOO_LARGE)) {
      throw error;
    }

    log('Retrying Solana quote with a shorter route');

    return await fetchRelaySolanaQuote(
      messenger,
      { ...quoteRequest, maxRouteLength: SOLANA_MAX_ROUTE_LENGTH },
      signal,
    );
  }
}

async function compileQuote(
  messenger: TransactionPayControllerMessenger,
  request: NonEvmQuoteRequest,
  quote: RelaySolanaQuote,
): ReturnType<typeof compileRelaySolanaTransaction> {
  return await compileRelaySolanaTransaction({
    messenger,
    payer: getSolanaSourceAddress(request),
    scope: request.sourceChainId,
    transaction: getRelaySolanaTransaction(quote),
  });
}

async function computeFee(
  messenger: TransactionPayControllerMessenger,
  request: NonEvmQuoteRequest,
  snapId: string,
  transaction: string,
): Promise<string> {
  return await computeSolanaFeeRaw({
    accountId: request.sourceWalletAccountId,
    messenger,
    scope: request.sourceChainId,
    snapId,
    transaction,
  });
}

function normalizeSolanaQuote(
  quote: RelaySolanaPayQuote,
  request: NonEvmQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): NonEvmTransactionPayQuote<RelaySolanaPayQuote> {
  const { currencyIn, currencyOut, timeEstimate } = quote.details;
  const nativeFiatRates = getFiatRates(
    messenger,
    getSolanaNativeAssetId(request.sourceChainId),
  );
  const usdToFiatRate = new BigNumber(nativeFiatRates.fiatRate).dividedBy(
    nativeFiatRates.usdRate,
  );

  const appFeeUsd = new BigNumber(quote.fees?.app?.amountUsd ?? '0');
  const providerFeeUsd = getSubsidizedFeeAmountUsd(messenger, quote).gt(0)
    ? new BigNumber(0)
    : calculateProviderFee(quote).minus(appFeeUsd);

  const sourceNetworkFee = getNativeAmount(
    quote.metamask.feeRaw,
    nativeFiatRates,
  );

  const targetAmountUsd = isStablecoin(
    messenger,
    request.targetChainId,
    request.targetTokenAddress,
  )
    ? new BigNumber(currencyOut.amountFormatted)
    : new BigNumber(currencyOut.amountUsd);

  const sourceAmount: Amount = {
    human: currencyIn.amountFormatted,
    raw: currencyIn.amount,
    ...getFiatValueFromUsd(new BigNumber(currencyIn.amountUsd), usdToFiatRate),
  };

  return {
    dust: getFiatValueFromUsd(calculateDustUsd(quote, request), usdToFiatRate),
    estimatedDuration: timeEstimate,
    fees: {
      metaMask: getFiatValueFromUsd(appFeeUsd, usdToFiatRate),
      provider: getFiatValueFromUsd(providerFeeUsd, usdToFiatRate),
      sourceNetwork: {
        estimate: sourceNetworkFee,
        max: sourceNetworkFee,
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    isInputBased: quote.request.tradeType === 'EXACT_INPUT',
    original: quote,
    request,
    sourceAmount,
    strategy: TransactionPayStrategy.Relay,
    targetAmount: getFiatValueFromUsd(targetAmountUsd, usdToFiatRate),
  };
}

function getFiatRates(
  messenger: TransactionPayControllerMessenger,
  assetId: ReturnType<typeof getSolanaNativeAssetId>,
): FiatRates {
  const fiatRates = getAssetFiatRate(messenger, assetId);

  if (!fiatRates) {
    throw new Error('Solana native fiat rate not found');
  }

  return fiatRates;
}

function getNativeAmount(raw: string, fiatRates: FiatRates): Amount {
  const human = new BigNumber(raw).shiftedBy(-SOLANA_DECIMALS);

  return {
    fiat: human.multipliedBy(fiatRates.fiatRate).toString(10),
    human: human.toString(10),
    raw,
    usd: human.multipliedBy(fiatRates.usdRate).toString(10),
  };
}

function formatSolanaShortfall(
  quote: NonEvmTransactionPayQuote<RelaySolanaPayQuote>,
): string[] {
  const { affordability, feeRaw, rentReserveRaw } = quote.original.metamask;
  const toSol = (raw: string): string =>
    `${new BigNumber(raw).shiftedBy(-SOLANA_DECIMALS).toFixed()} SOL`;

  return [
    `Network fee: ${toSol(feeRaw)}`,
    `Rent reserve: ${toSol(rentReserveRaw)}`,
    `Missing native: ${toSol(affordability.nativeShortfallRaw)}`,
    `Missing source: ${affordability.sourceShortfallRaw}`,
  ];
}
