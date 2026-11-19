import {
  array,
  boolean,
  is,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

/**
 * Lists which transaction types each dapp origin may request through
 * `wallet_pay`. A type must also be enabled at the top level (the kill
 * switch).
 */
export const WALLET_PAY_FEATURE_FLAG = 'confirmations_pay_rpc';

/**
 * Gates in-wallet MetaMask Pay flows per transaction type. A dapp request that
 * reuses an in-wallet flow is gated by it too.
 */
export const PAY_POST_QUOTE_FEATURE_FLAG = 'confirmations_pay_post_quote';

// `localhost` is allowed on any port, so local development servers work
// without listing every port in the flag.
const LOCALHOST_ORIGIN = 'http://localhost';

const AllowedTypesStruct = type({ allowedTypes: array(string()) });

const WalletPayFeatureFlagStruct = type({
  allowedTypes: array(string()),
  dapps: record(string(), AllowedTypesStruct),
});

const PayFlowConfigStruct = type({ enabled: optional(boolean()) });

const PayPostQuoteFeatureFlagStruct = type({
  default: optional(PayFlowConfigStruct),
  overrides: optional(record(string(), PayFlowConfigStruct)),
});

export type RemoteFeatureFlags = Record<string, Json>;

/**
 * Whether a dapp may request a transaction type, based on
 * `confirmations_pay_rpc`. Origins match exactly, scheme included, except
 * `http://localhost`, which matches any port. A missing or malformed flag
 * allows nothing.
 *
 * @param remoteFeatureFlags - The remote feature flags.
 * @param origin - The requesting dapp's origin.
 * @param transactionType - The requested transaction type.
 * @returns Whether the request is allowed.
 */
export function isWalletPayTypeAllowed(
  remoteFeatureFlags: RemoteFeatureFlags,
  origin: string,
  transactionType: string,
): boolean {
  const flag = remoteFeatureFlags[WALLET_PAY_FEATURE_FLAG];

  if (
    !is(flag, WalletPayFeatureFlagStruct) ||
    !flag.allowedTypes.includes(transactionType)
  ) {
    return false;
  }

  const url = parseUrl(origin);

  if (!url) {
    return false;
  }

  const isLocalhost = url.protocol === 'http:' && url.hostname === 'localhost';
  const dappConfig =
    flag.dapps[url.origin] ??
    (isLocalhost ? flag.dapps[LOCALHOST_ORIGIN] : undefined);

  return dappConfig?.allowedTypes.includes(transactionType) ?? false;
}

/**
 * Whether the in-wallet flow for a transaction type is enabled by
 * `confirmations_pay_post_quote`. A type-specific entry (under `overrides`, or
 * directly) wins over `default`.
 *
 * @param remoteFeatureFlags - The remote feature flags.
 * @param transactionType - The transaction type.
 * @returns Whether the flow is enabled.
 */
export function isPayFlowEnabled(
  remoteFeatureFlags: RemoteFeatureFlags,
  transactionType: string,
): boolean {
  const flag = remoteFeatureFlags[PAY_POST_QUOTE_FEATURE_FLAG];

  if (!is(flag, PayPostQuoteFeatureFlagStruct)) {
    return false;
  }

  const directConfig = (flag as Record<string, unknown>)[transactionType];
  const typeConfig =
    flag.overrides?.[transactionType] ??
    (is(directConfig, PayFlowConfigStruct) ? directConfig : undefined);

  return (typeConfig?.enabled ?? flag.default?.enabled) === true;
}

function parseUrl(origin: string): URL | undefined {
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}
