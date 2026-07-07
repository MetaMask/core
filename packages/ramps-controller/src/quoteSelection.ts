import { normalizeProviderCode } from './RampsController';
import type { ProviderScope } from './RampsController';
import { isInAppOnlyQuote } from './quoteClassification';
import type {
  Provider,
  ProviderLimit,
  Quote,
  QuotesResponse,
  QuoteSortBy,
} from './RampsService';

/**
 * The result of validating a fiat buy amount against a provider's published
 * limit for a payment method.
 *
 * `valid` is `true` when the amount fits (or when there is no published limit
 * to enforce). When `false`, `reason` says which bound was crossed and `limit`
 * carries the offending limit so a consumer can surface a min/max message.
 */
export type BuyAmountValidation =
  | { valid: true }
  | {
      valid: false;
      reason: 'below_minimum' | 'above_maximum';
      limit: ProviderLimit;
    };

/**
 * Validates a fiat amount against a single provider limit.
 *
 * This is the pure amount-vs-limit check with no provider-catalog lookup: when
 * `limit` is omitted (the provider/payment method publishes no limit) the
 * amount is treated as valid and the provider is left to enforce limits at
 * checkout.
 *
 * @param options - The inputs.
 * @param options.amount - The fiat amount to validate.
 * @param options.limit - The provider's published limit for the relevant fiat
 * and payment method, if any.
 * @returns The validation result.
 */
export function validateBuyAmount({
  amount,
  limit,
}: {
  amount: number;
  limit?: ProviderLimit;
}): BuyAmountValidation {
  if (!limit) {
    return { valid: true };
  }
  if (amount < limit.minAmount) {
    return { valid: false, reason: 'below_minimum', limit };
  }
  if (amount > limit.maxAmount) {
    return { valid: false, reason: 'above_maximum', limit };
  }
  return { valid: true };
}

/**
 * Resolves the published fiat limit for a quote's provider and payment method.
 *
 * @param quote - The quote whose provider/payment method to resolve.
 * @param fiat - Lowercased fiat short code used to key the limits map.
 * @param providerByCode - Provider catalog keyed by normalized provider code.
 * @returns The matching limit, or `undefined` when none is published.
 */
function getQuoteLimit(
  quote: Quote,
  fiat: string,
  providerByCode: Map<string, Provider>,
): ProviderLimit | undefined {
  const provider = providerByCode.get(normalizeProviderCode(quote.provider));
  return provider?.limits?.fiat?.[fiat]?.[quote.quote.paymentMethod];
}

/**
 * Whether a quote's fiat amount fits the provider's published limits.
 *
 * Convenience wrapper over {@link validateBuyAmount} that resolves the provider
 * limit from the catalog for a single quote. When the provider/payment method
 * publishes no limit, the quote is considered eligible.
 *
 * @param quote - The quote to check.
 * @param options - The inputs.
 * @param options.amount - The fiat amount.
 * @param options.fiat - Lowercased fiat short code used to key the limits map.
 * @param options.providers - Provider catalog for the limit lookup.
 * @returns Whether the amount fits the provider limits.
 */
export function fitsProviderLimits(
  quote: Quote,
  {
    amount,
    fiat,
    providers,
  }: { amount: number; fiat: string; providers: Provider[] },
): boolean {
  const providerByCode = new Map(
    providers.map((provider) => [
      normalizeProviderCode(provider.id),
      provider,
    ]),
  );
  const limit = getQuoteLimit(quote, fiat, providerByCode);
  return validateBuyAmount({ amount, limit }).valid;
}

/**
 * Selects the best quote from a widened multi-provider response.
 *
 * This is the pure, provider-agnostic selection shared by the controller's
 * auto-select path (`getQuotes`) and headless consumers, so both derive an
 * identical pick from the same response instead of re-ranking locally. It knows
 * nothing about host redirect URLs, deeplink schemes, navigation, or analytics.
 *
 * Behavior:
 *
 * - Under `in-app` scope it drops custom-action and external-browser quotes
 *   (via the shared `isInAppOnlyQuote` classification and the response's
 *   `customActions` provider codes); `all` scope keeps them. Both scopes
 *   enforce per-provider fiat limits up front via {@link validateBuyAmount}.
 * - Ranks the surviving candidates by `preferredProviderIds` (in the given
 *   order), then reliability, then price (both from the response's `sorted`
 *   orders), then the first surviving candidate.
 *
 * @param response - The multi-provider quotes response.
 * @param options - Selection inputs.
 * @param options.scope - Active provider scope (`off`, `in-app`, or `all`).
 * `off` is treated like `in-app` for filtering, since the native-only gate is
 * applied earlier at provider resolution rather than here.
 * @param options.amount - Fiat amount, for the limit-fit check.
 * @param options.fiat - Lowercased fiat short code, for the limit lookup.
 * @param options.providers - Provider catalog for the limit lookup.
 * @param options.preferredProviderIds - Provider IDs to prefer, in priority
 * order (e.g. derived from the caller's completed-order history). Applied as
 * the top ranking rung ahead of reliability and price.
 * @returns The selected quote, or `undefined` when no quote is usable.
 */
export function getSmartSelectedQuote(
  response: QuotesResponse,
  {
    scope,
    amount,
    fiat,
    providers,
    preferredProviderIds,
  }: {
    scope: ProviderScope;
    amount: number;
    fiat: string;
    providers: Provider[];
    preferredProviderIds?: string[];
  },
): Quote | undefined {
  const providerByCode = new Map(
    providers.map((provider) => [
      normalizeProviderCode(provider.id),
      provider,
    ]),
  );
  const customActionProviderCodes = new Set(
    response.customActions.map((action) =>
      normalizeProviderCode(action.buy.providerId),
    ),
  );

  const isEligible = (quote: Quote): boolean => {
    // `all` (Phase 2) skips the in-app-only exclusions; both scopes still
    // enforce provider limits up front.
    if (scope !== 'all') {
      const providerCode = normalizeProviderCode(quote.provider);
      if (customActionProviderCodes.has(providerCode)) {
        return false;
      }
      // Custom-action and external-browser classification is shared with the
      // consuming client via `quoteClassification` so both filter identically.
      if (!isInAppOnlyQuote(quote)) {
        return false;
      }
    }
    const limit = getQuoteLimit(quote, fiat, providerByCode);
    return validateBuyAmount({ amount, limit }).valid;
  };

  const candidates = response.success.filter(isEligible);
  if (candidates.length === 0) {
    return undefined;
  }

  const candidateByCode = new Map(
    candidates.map((quote) => [normalizeProviderCode(quote.provider), quote]),
  );

  // 1. A provider the caller prefers (e.g. previously transacted with),
  //    honored in the given priority order.
  for (const preferredId of preferredProviderIds ?? []) {
    const match = candidateByCode.get(normalizeProviderCode(preferredId));
    if (match) {
      return match;
    }
  }

  const pickBySortOrder = (sortBy: QuoteSortBy): Quote | undefined => {
    const order = response.sorted.find(
      (entry) => entry.sortBy === sortBy,
    )?.ids;
    if (!order) {
      return undefined;
    }
    for (const providerId of order) {
      const match = candidateByCode.get(normalizeProviderCode(providerId));
      if (match) {
        return match;
      }
    }
    return undefined;
  };

  // 2. Reliability, 3. price, 4. the first surviving candidate.
  return (
    pickBySortOrder('reliability') ??
    pickBySortOrder('price') ??
    candidates[0]
  );
}
