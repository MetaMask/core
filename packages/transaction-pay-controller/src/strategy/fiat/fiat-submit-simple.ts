import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatMaxRateDriftPercent } from '../../utils/feature-flags.js';
import type { FiatCryptoLeg, FiatCryptoLegQuote } from './fiat-crypto-leg.js';
import type { FiatQuote } from './types.js';
import { validateRateDrift } from './utils.js';

const log = createModuleLogger(projectLogger, 'fiat-submit-simple');

/**
 * Submits a single EXACT_INPUT crypto leg quote for simple deposits
 * that don't require nested calldata re-encoding or delegation.
 *
 * @param options - The submission options.
 * @param options.baseRequest - The base quote request from the original fiat quote.
 * @param options.leg - Strategy used for the crypto leg.
 * @param options.originalQuote - Crypto leg quote from the original fiat quote.
 * @param options.request - The original fiat strategy execute request.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the crypto leg transaction hash if available.
 */
export async function submitSimpleCryptoLeg({
  baseRequest,
  leg,
  originalQuote,
  request,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  leg: FiatCryptoLeg;
  originalQuote: TransactionPayQuote<FiatCryptoLegQuote>;
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;
  const legName = leg.name.toLowerCase();

  const cryptoRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: true,
    skipProcessTransactions: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
  };

  const cryptoQuotes = await leg.getQuotes({
    accountSupports7702: request.accountSupports7702,
    from: baseRequest.from,
    messenger,
    requests: [cryptoRequest],
    transaction,
  });

  if (!cryptoQuotes.length) {
    throw new Error(`No ${legName} quotes returned for completed fiat order`);
  }

  validateRateDrift({
    discoveryAmounts: leg.getAmounts(cryptoQuotes[0]),
    legName: leg.name,
    maxRateDriftPercent: getFiatMaxRateDriftPercent(messenger),
    originalAmounts: leg.getAmounts(originalQuote),
    transactionId,
  });

  log(`Submitting simple ${legName} after fiat settlement`, {
    quoteCount: cryptoQuotes.length,
    transactionId,
  });

  return await leg.submit({
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: cryptoQuotes,
    transaction,
  });
}
