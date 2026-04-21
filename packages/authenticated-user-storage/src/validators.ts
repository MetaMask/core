import {
  array,
  assert,
  boolean,
  number,
  optional,
  pattern,
  string,
  type,
} from '@metamask/superstruct';

import type { DelegationResponse, NotificationPreferences } from './types';

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
  enabled: boolean(),
  accounts: array(WalletActivityAccountSchema),
});

const MarketingPreferenceSchema = type({
  enabled: boolean(),
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
  enabled: boolean(),
  watchlistMarkets: optional(PerpsWatchlistMarketsSchema),
});

const SocialAIPreferenceSchema = type({
  enabled: boolean(),
  txAmountLimit: optional(number()),
  mutedTraderProfileIds: array(string()),
});

const NotificationPreferencesSchema = type({
  walletActivity: WalletActivityPreferenceSchema,
  marketing: MarketingPreferenceSchema,
  perps: PerpsPreferenceSchema,
  socialAI: SocialAIPreferenceSchema,
});

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
