import {
  array,
  assert,
  boolean,
  define,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';

import type { DelegationResponse, NotificationPreferences } from './types';

const HexSchema = define<`0x${string}`>(
  'Hex',
  (value) => typeof value === 'string' && value.startsWith('0x'),
);

const CaveatSchema = type({
  enforcer: HexSchema,
  terms: HexSchema,
  args: HexSchema,
});

const SignedDelegationSchema = type({
  delegate: HexSchema,
  delegator: HexSchema,
  authority: HexSchema,
  caveats: array(CaveatSchema),
  salt: HexSchema,
  signature: HexSchema,
});

const DelegationMetadataSchema = type({
  delegationHash: HexSchema,
  chainIdHex: HexSchema,
  allowance: HexSchema,
  tokenSymbol: string(),
  tokenAddress: HexSchema,
  type: string(),
});

const DelegationResponseSchema = type({
  signedDelegation: SignedDelegationSchema,
  metadata: DelegationMetadataSchema,
});

const WalletActivityAccountSchema = type({
  address: HexSchema,
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
  tokens: array(string()),
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
