import type {
  Provider,
  ProviderAssetLimits,
  ProviderLimit,
} from './RampsService.js';
import { normalizeRampsAssetId } from './providerAvailability.js';

/**
 * The canonical payment method id path prefix, which the v2 API strips from
 * wire ids but clients may still supply (or receive, when the API serves
 * legacy ids).
 */
const PAYMENTS_PREFIX_PATTERN = /^\/payments\//iu;

/**
 * Normalizes a payment method id for limit-key comparison by trimming it and
 * stripping the canonical `/payments/` path prefix, so `debit-credit-card`
 * and `/payments/debit-credit-card` match each other. The API publishes
 * limit keys in either form depending on whether it serves canonical ids.
 *
 * @param paymentMethodId - A payment method id in either form.
 * @returns The normalized id used for limit-key comparison.
 */
function normalizePaymentMethodId(paymentMethodId: string): string {
  return paymentMethodId.trim().replace(PAYMENTS_PREFIX_PATTERN, '');
}

/**
 * Finds the limit entry for a payment method among record keys that may use
 * either the prefixed or bare payment method id form.
 *
 * @param byPaymentMethod - Limit entries keyed by payment method id.
 * @param paymentMethodId - The payment method id to look up.
 * @returns The matching entry, or `undefined` when there is none.
 */
function findLimitForPaymentMethod<LimitEntry>(
  byPaymentMethod: Record<string, LimitEntry>,
  paymentMethodId: string,
): LimitEntry | undefined {
  const target = normalizePaymentMethodId(paymentMethodId);
  for (const [key, entry] of Object.entries(byPaymentMethod)) {
    if (normalizePaymentMethodId(key) === target) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Finds the per-payment-method limit for a payment method in a provider's
 * per-asset limits. Mirrors the ramps API: a non-empty `payments` breakdown
 * is authoritative, so a payment method without an entry has no asset
 * limit (the asset-level limits are not used as a fallback).
 *
 * @param assetLimits - The provider's per-asset limits.
 * @param paymentMethodId - The payment method id to look up.
 * @returns The matching limit, or `undefined` when there is none.
 */
function findAssetLimitForPaymentMethod(
  assetLimits: ProviderAssetLimits,
  paymentMethodId: string,
): ProviderLimit | undefined {
  if (assetLimits.payments?.length) {
    const target = normalizePaymentMethodId(paymentMethodId);
    return assetLimits.payments.find(
      (entry) => normalizePaymentMethodId(entry.payment) === target,
    );
  }
  return assetLimits;
}

/**
 * Intersects a provider's fiat limit with its per-asset limit the way the
 * ramps API does when enforcing buy limits: the effective minimum is the
 * higher of the two, the effective maximum is the lower of the two
 * (treating a `maxAmount` of 0 as unbounded), and the fiat limit's fees win.
 *
 * @param fiatLimit - The provider's fiat-level limit, if published.
 * @param assetLimit - The provider's per-asset limit, if published.
 * @returns The combined limit, or whichever limit exists.
 */
function intersectLimits(
  fiatLimit: ProviderLimit | undefined,
  assetLimit: ProviderLimit | undefined,
): ProviderLimit | undefined {
  if (fiatLimit && assetLimit) {
    return {
      minAmount: Math.max(fiatLimit.minAmount, assetLimit.minAmount),
      maxAmount: Math.min(
        fiatLimit.maxAmount || Number.POSITIVE_INFINITY,
        assetLimit.maxAmount || Number.POSITIVE_INFINITY,
      ),
      feeFixedRate: fiatLimit.feeFixedRate,
      feeDynamicRate: fiatLimit.feeDynamicRate,
    };
  }
  return fiatLimit ?? assetLimit;
}

/**
 * Options for {@link getProviderBuyLimit}.
 */
export type GetProviderBuyLimitOptions = {
  /**
   * The provider to look up limits for.
   */
  provider: Provider | null | undefined;
  /**
   * Fiat currency short code (e.g., "EUR"). Matched case-insensitively.
   */
  fiatCurrency: string | null | undefined;
  /**
   * Payment method id (e.g., "debit-credit-card"), in either the bare or
   * `/payments/`-prefixed form.
   */
  paymentMethodId: string | null | undefined;
  /**
   * CAIP-19 asset id of the token being bought (e.g.,
   * "eip155:56/slip44:714"), used to prefer the provider's per-token limits.
   * EVM asset ids are matched case-insensitively.
   */
  assetId?: string | null;
};

/**
 * Resolves a provider's effective buy limit for a fiat currency, payment
 * method, and (optionally) deposit asset.
 *
 * The regions providers endpoint publishes two limit dimensions: a
 * token-agnostic fiat map (`limits.fiat[fiat][paymentMethod]`) and, for
 * providers that configure token-specific limits, a per-asset map
 * (`limits.assets[assetId]`, with an optional per-payment-method breakdown).
 * When the provider publishes limits for the asset, the two dimensions are
 * intersected (tightest bounds win) exactly as the ramps API does when
 * enforcing buy limits server-side; otherwise the fiat limit alone applies.
 * Without this, providers whose minimum varies per token (e.g. Coinbase: 2
 * EUR for ETH but 5 EUR for most other tokens) advertise a minimum that is
 * wrong for most tokens.
 *
 * @param options - The options.
 * @param options.provider - The provider to look up limits for.
 * @param options.fiatCurrency - Fiat currency short code (e.g., "EUR"),
 * matched case-insensitively.
 * @param options.paymentMethodId - Payment method id (e.g.,
 * "debit-credit-card"), in either the bare or `/payments/`-prefixed form.
 * @param options.assetId - CAIP-19 asset id of the token being bought
 * (e.g., "eip155:56/slip44:714"), used to prefer the provider's per-token
 * limits. EVM asset ids are matched case-insensitively.
 * @returns The effective limit, or `undefined` when the provider publishes
 * no usable limit for the combination.
 */
export function getProviderBuyLimit({
  provider,
  fiatCurrency,
  paymentMethodId,
  assetId,
}: GetProviderBuyLimitOptions): ProviderLimit | undefined {
  if (!provider?.limits || !fiatCurrency || !paymentMethodId) {
    return undefined;
  }

  const fiatLimits = provider.limits.fiat?.[fiatCurrency.trim().toLowerCase()];
  const fiatLimit = fiatLimits
    ? findLimitForPaymentMethod(fiatLimits, paymentMethodId)
    : undefined;

  if (!assetId) {
    return fiatLimit;
  }

  const targetAssetId = normalizeRampsAssetId(assetId.trim());
  const assetEntry = Object.entries(provider.limits.assets ?? {}).find(
    ([key]) => normalizeRampsAssetId(key) === targetAssetId,
  )?.[1];
  const assetLimit = assetEntry
    ? findAssetLimitForPaymentMethod(assetEntry, paymentMethodId)
    : undefined;

  return intersectLimits(fiatLimit, assetLimit);
}
