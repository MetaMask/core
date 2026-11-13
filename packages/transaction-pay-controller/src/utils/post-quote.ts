import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { NATIVE_TOKEN_ADDRESS } from '../constants.js';
import { projectLogger } from '../logger.js';
import type { QuoteRequest, TransactionPayQuote } from '../types.js';
import { getNativeToken } from './token.js';

const log = createModuleLogger(projectLogger, 'post-quote');

// Buffer applied to the gas cost when reserving native tokens for gas in
// post-quote flows, accounting for gas limit re-estimation variance.
const POST_QUOTE_GAS_BUFFER = 1.1;

/**
 * Re-quote a post-quote flow with the gas cost reserved from the source amount.
 *
 * Gas must come out of the source amount when the balance is fully committed
 * to the quote, either because gas is paid with the source token as a gas fee
 * token or because the source token is itself the native gas token.
 *
 * @param options - Options bag.
 * @param options.quote - Quote for the full source amount.
 * @param options.requote - Fetch a quote for an adjusted request.
 * @returns The re-quoted quote, or the original quote when no reservation is
 * needed or the re-quote is unusable.
 */
export async function reservePostQuoteGas<Original>({
  quote,
  requote,
}: {
  quote: TransactionPayQuote<Original>;
  requote: (request: QuoteRequest) => Promise<TransactionPayQuote<Original>>;
}): Promise<TransactionPayQuote<Original>> {
  const { request } = quote;

  if (!request.isPostQuote) {
    return quote;
  }

  if (!quote.fees.isSourceGasFeeToken && !isNativeSource(request)) {
    return quote;
  }

  const gasCostRaw = new BigNumber(quote.fees.sourceNetwork.max.raw)
    .multipliedBy(POST_QUOTE_GAS_BUFFER)
    .integerValue(BigNumber.ROUND_UP);

  const existingHeadroom = new BigNumber(request.sourceBalanceRaw).minus(
    request.sourceTokenAmount,
  );

  if (existingHeadroom.isGreaterThanOrEqualTo(gasCostRaw)) {
    log('Sufficient existing balance for gas, skipping subtraction', {
      existingHeadroom: existingHeadroom.toString(10),
      gasCostRaw: gasCostRaw.toString(10),
    });
    return quote;
  }

  const adjustedSourceAmount = new BigNumber(request.sourceTokenAmount)
    .minus(gasCostRaw)
    .integerValue(BigNumber.ROUND_DOWN);

  log('Subtracting gas from source for post-quote', {
    adjustedSourceAmount: adjustedSourceAmount.toString(10),
    gasCostRaw,
    originalSourceAmount: request.sourceTokenAmount,
  });

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    log('Insufficient balance after gas subtraction, using original quote');
    return quote;
  }

  try {
    const adjustedQuote = await requote({
      ...request,
      sourceTokenAmount: adjustedSourceAmount.toFixed(0, BigNumber.ROUND_DOWN),
    });

    if (
      quote.fees.isSourceGasFeeToken &&
      !adjustedQuote.fees.isSourceGasFeeToken
    ) {
      log('Re-quote lost gas fee token eligibility, using original quote');
      return quote;
    }

    return adjustedQuote;
  } catch (error) {
    log('Re-quote failed, using original quote', { error });
    return quote;
  }
}

function isNativeSource(request: QuoteRequest): boolean {
  const sourceToken = request.sourceTokenAddress.toLowerCase();

  return (
    sourceToken === getNativeToken(request.sourceChainId).toLowerCase() ||
    sourceToken === NATIVE_TOKEN_ADDRESS.toLowerCase()
  );
}
