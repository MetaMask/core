import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatServerStrategyEnabled } from '../../utils/feature-flags.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import { submitRelayQuotes } from '../relay/relay-submit.js';
import type { RelayQuote } from '../relay/types.js';
import { getServerQuotes } from '../server/server-quotes.js';
import { submitServerQuotes } from '../server/server-submit.js';
import type { ServerQuote } from '../server/types.js';
import type { FiatQuote } from './types.js';

/** Original quote of any strategy that can run the fiat crypto leg. */
export type FiatCryptoLegQuote = RelayQuote | ServerQuote;

/** Amounts of a crypto leg quote used for fee reserves and drift checks. */
export type FiatCryptoLegAmounts = {
  /** Source amount in atomic units. */
  sourceRaw: BigNumber;

  /** Source amount in USD. */
  sourceUsd: BigNumber;

  /** Minimum target amount in atomic units. */
  targetMinimumRaw: BigNumber;

  /** Target amount in USD. */
  targetUsd: BigNumber;
};

/**
 * Strategy that quotes and submits the crypto leg of a fiat payment, which
 * converts the on-ramped asset into the required token once the order settles.
 */
export type FiatCryptoLeg<Quote = FiatCryptoLegQuote> = {
  /** Name of the strategy, used in logs and errors. */
  name: string;

  /**
   * Get the amounts of a crypto leg quote.
   *
   * @param quote - Crypto leg quote.
   * @returns The quote amounts.
   */
  getAmounts(quote: TransactionPayQuote<Quote>): FiatCryptoLegAmounts;

  /**
   * Get the fee and price impact of a crypto leg quote.
   *
   * @param quote - Crypto leg quote.
   * @returns The fee in USD, never negative.
   */
  getFeeUsd(quote: TransactionPayQuote<Quote>): BigNumber;

  /**
   * Get the original crypto leg quote stored on a fiat quote.
   *
   * @param fiatQuote - Original fiat quote.
   * @returns The crypto leg quote, if stored.
   */
  getOriginal(fiatQuote: FiatQuote): Quote | undefined;

  /**
   * Fetch crypto leg quotes.
   *
   * @param request - Quotes request.
   * @returns The crypto leg quotes.
   */
  getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<Quote>[]>;

  /**
   * Submit crypto leg quotes.
   *
   * @param request - Execute request.
   * @returns The hash of the submitted transaction, if available.
   */
  submit(
    request: PayStrategyExecuteRequest<Quote>,
  ): Promise<{ transactionHash?: Hex }>;

  /**
   * Build the crypto leg fields of an original fiat quote.
   *
   * @param quote - Original crypto leg quote.
   * @returns The fields to store on the fiat quote.
   */
  toFiatOriginal(quote: Quote): Pick<FiatQuote, 'relayQuote' | 'serverQuote'>;
};

const RELAY_LEG: FiatCryptoLeg<RelayQuote> = {
  name: 'Relay',

  getAmounts({ original: { details } }) {
    return {
      sourceRaw: new BigNumber(details.currencyIn.amount),
      sourceUsd: new BigNumber(details.currencyIn.amountUsd),
      targetMinimumRaw: new BigNumber(details.currencyOut.minimumAmount),
      targetUsd: new BigNumber(details.currencyOut.amountUsd),
    };
  },

  getFeeUsd({ original: { details } }) {
    const impactUsd = new BigNumber(details.totalImpact.usd);
    return impactUsd.isNegative() ? impactUsd.abs() : new BigNumber(0);
  },

  getOriginal: (fiatQuote) => fiatQuote.relayQuote,
  getQuotes: async (request) => getRelayQuotes(request),
  submit: async (request) => submitRelayQuotes(request),
  toFiatOriginal: (relayQuote) => ({ relayQuote }),
};

const SERVER_LEG: FiatCryptoLeg<ServerQuote> = {
  name: 'Server',

  getAmounts({ original, sourceAmount, targetAmount }) {
    return {
      sourceRaw: new BigNumber(original.input.raw),
      sourceUsd: new BigNumber(sourceAmount.usd),
      targetMinimumRaw: new BigNumber(original.output.raw),
      targetUsd: new BigNumber(targetAmount.usd),
    };
  },

  getFeeUsd({ sourceAmount, targetAmount }) {
    return BigNumber.max(
      new BigNumber(sourceAmount.usd).minus(targetAmount.usd),
      0,
    );
  },

  getOriginal: (fiatQuote) => fiatQuote.serverQuote,
  getQuotes: async (request) => getServerQuotes(request),
  submit: async (request) => submitServerQuotes(request),
  toFiatOriginal: (serverQuote) => ({ serverQuote }),
};

/**
 * Select the crypto leg strategy for new fiat quotes.
 *
 * @param messenger - Controller messenger.
 * @returns The server leg when enabled by feature flag, otherwise the relay leg.
 */
export function getFiatCryptoLeg(
  messenger: TransactionPayControllerMessenger,
): FiatCryptoLeg {
  return getFiatServerStrategyEnabled(messenger) ? SERVER_LEG : RELAY_LEG;
}

/**
 * Resolve the crypto leg strategy a fiat quote was created with, so submit
 * always uses the same strategy as the quote even if the flag has changed.
 *
 * @param fiatQuote - Fiat strategy quote.
 * @returns The crypto leg and its original quote, using the fiat quote amounts.
 */
export function resolveFiatCryptoLeg(
  fiatQuote: TransactionPayQuote<FiatQuote>,
): {
  leg: FiatCryptoLeg;
  originalQuote: TransactionPayQuote<FiatCryptoLegQuote>;
} {
  const leg: FiatCryptoLeg = fiatQuote.original.serverQuote
    ? SERVER_LEG
    : RELAY_LEG;

  const original = leg.getOriginal(fiatQuote.original);

  if (!original) {
    throw new Error(`Missing ${leg.name} quote`);
  }

  return { leg, originalQuote: { ...fiatQuote, original } };
}
