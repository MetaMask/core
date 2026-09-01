import type { Infer } from '@metamask/superstruct';
import {
  array,
  assert,
  assign,
  boolean,
  literal,
  number,
  optional,
  pattern,
  size,
  string,
  type,
} from '@metamask/superstruct';

import type {
  AgenticCliPreference,
  DelegationResponse,
  NotificationPreferences,
  PriceAlertPreference,
} from './types.js';

/**
 * Matches a 0x-prefixed hex string with zero or more hex digits.
 * Unlike `StrictHexStruct` from `@metamask/utils` (which requires at least
 * one digit after the prefix), this also accepts `"0x"` — the standard
 * encoding for empty bytes that the delegation API returns.
 */
const HexDataStruct = pattern(string(), /^0x[0-9a-f]*$/iu);

const CaveatSchema = type({
  enforcer: HexDataStruct,
  terms: HexDataStruct,
  args: HexDataStruct,
});

const SignedDelegationSchema = type({
  delegate: HexDataStruct,
  delegator: HexDataStruct,
  authority: HexDataStruct,
  caveats: array(CaveatSchema),
  salt: HexDataStruct,
  signature: HexDataStruct,
});

const DelegationMetadataSchema = type({
  delegationHash: HexDataStruct,
  chainIdHex: HexDataStruct,
  allowance: HexDataStruct,
  tokenSymbol: string(),
  tokenAddress: HexDataStruct,
  type: string(),
});

const DelegationResponseSchema = type({
  signedDelegation: SignedDelegationSchema,
  metadata: DelegationMetadataSchema,
});

const WalletActivityAccountSchema = type({
  address: HexDataStruct,
  enabled: boolean(),
});

const WalletActivityPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
  accounts: array(WalletActivityAccountSchema),
});

const MarketingPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
});

const PerpsWatchlistExchangeSchema = type({
  testnet: array(string()),
  mainnet: array(string()),
});

const PerpsWatchlistMarketsSchema = type({
  hyperliquid: PerpsWatchlistExchangeSchema,
  myx: PerpsWatchlistExchangeSchema,
});

const PerpsPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
  watchlistMarkets: optional(PerpsWatchlistMarketsSchema),
});

const SocialAIPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
  txAmountLimit: optional(number()),
  mutedTraderProfileIds: array(string()),
});

const AgenticCliPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
});

const PriceAlertPreferenceSchema = type({
  inAppNotificationsEnabled: boolean(),
  pushNotificationsEnabled: boolean(),
});

const NotificationPreferencesSchema = type({
  walletActivity: WalletActivityPreferenceSchema,
  marketing: MarketingPreferenceSchema,
  perps: PerpsPreferenceSchema,
  socialAI: SocialAIPreferenceSchema,
  agenticCli: AgenticCliPreferenceSchema,
  priceAlerts: PriceAlertPreferenceSchema,
});

/**
 * Default Agentic CLI notification preferences for consumers building a
 * fresh `NotificationPreferences` object.
 */
export const DEFAULT_AGENTIC_CLI_PREFERENCES: AgenticCliPreference = {
  inAppNotificationsEnabled: true,
  pushNotificationsEnabled: true,
};

/**
 * Default price-alert notification preferences for consumers building a
 * fresh `NotificationPreferences` object.
 */
export const DEFAULT_PRICE_ALERT_PREFERENCES: PriceAlertPreference = {
  inAppNotificationsEnabled: true,
  pushNotificationsEnabled: true,
};

/**
 * Maximum number of entries allowed in an assets-watchlist on write. Reads
 * are lenient: a server payload exceeding this size will still validate as
 * an `AssetsWatchlistBlob`. Encoded into
 * {@link AssetsWatchlistBlobWriteSchema}.
 */
export const ASSETS_WATCHLIST_MAX_ASSETS = 100;

/**
 * The shape we accept on the way **in** from the server. Lenient by design:
 * a malformed payload throws, but a well-formed payload with more than
 * {@link ASSETS_WATCHLIST_MAX_ASSETS} assets is still considered valid so we
 * don't reject existing server-side data.
 */
const AssetsWatchlistBlobSchema = type({
  version: literal(1),
  assets: array(string()),
});

/**
 * The shape we accept on the way **out** to the server. Extends
 * {@link AssetsWatchlistBlobSchema} with a hard cap on `assets.length`.
 * Validation failures throw a `StructError`, e.g.
 * `"At path: assets -- Expected a array with a length between \`0\` and
 * \`100\` but received one with a length of \`N\`"`.
 */
const AssetsWatchlistBlobWriteSchema = assign(
  AssetsWatchlistBlobSchema,
  type({
    assets: size(array(string()), 0, ASSETS_WATCHLIST_MAX_ASSETS),
  }),
);

/**
 * The authenticated user's assets-watchlist: a mutable per-user singleton
 * blob.
 *
 * Each entry is a CAIP-19 asset identifier
 * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`).
 *
 * The `version` literal is carried inside the blob (not in the URL) so the
 * schema can evolve in a backwards-compatible way; bumping the version
 * indicates a different `assets` element shape.
 *
 * Inferred from {@link AssetsWatchlistBlobSchema} so the runtime schema and
 * the static type stay in lock-step. The size constraint on writes is
 * enforced by {@link AssetsWatchlistBlobWriteSchema} and is not encoded in
 * this static type (TypeScript cannot express "array of length ≤ N").
 */
export type AssetsWatchlistBlob = Infer<typeof AssetsWatchlistBlobSchema>;

/**
 * Asserts that the given value is a valid `DelegationResponse[]`.
 *
 * @param data - The unknown value to validate.
 * @throws If the value does not match the expected schema.
 */
export function assertDelegationResponseArray(
  data: unknown,
): asserts data is DelegationResponse[] {
  assert(data, array(DelegationResponseSchema));
}

/**
 * Asserts that the given value is a valid `NotificationPreferences`.
 *
 * @param data - The unknown value to validate.
 * @throws If the value does not match the expected schema.
 */
export function assertNotificationPreferences(
  data: unknown,
): asserts data is NotificationPreferences {
  assert(data, NotificationPreferencesSchema);
}

/**
 * Asserts that the given value is a valid `AssetsWatchlistBlob` (read-side,
 * lenient).
 *
 * @param data - The unknown value to validate.
 * @throws If the value does not match the expected schema.
 */
export function assertAssetsWatchlistBlob(
  data: unknown,
): asserts data is AssetsWatchlistBlob {
  assert(data, AssetsWatchlistBlobSchema);
}

/**
 * Asserts that the given value is a valid `AssetsWatchlistBlob` for
 * **writes**. In addition to the structural checks performed by
 * {@link assertAssetsWatchlistBlob}, this enforces that `assets` contains at
 * most {@link ASSETS_WATCHLIST_MAX_ASSETS} entries.
 *
 * @param data - The unknown value to validate.
 * @throws A `StructError` if the value does not match the expected schema
 * (including the size constraint).
 */
export function assertAssetsWatchlistBlobForWrite(
  data: unknown,
): asserts data is AssetsWatchlistBlob {
  assert(data, AssetsWatchlistBlobWriteSchema);
}
