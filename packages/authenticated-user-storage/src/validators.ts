import {
  array,
  assert,
  boolean,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

import type { DelegationResponse, NotificationPreferences } from './types';

const CaveatSchema = type({
  enforcer: StrictHexStruct,
  terms: StrictHexStruct,
  args: StrictHexStruct,
});

const SignedDelegationSchema = type({
  delegate: StrictHexStruct,
  delegator: StrictHexStruct,
  authority: StrictHexStruct,
  caveats: array(CaveatSchema),
  salt: StrictHexStruct,
  signature: StrictHexStruct,
});

const DelegationMetadataSchema = type({
  delegationHash: StrictHexStruct,
  chainIdHex: StrictHexStruct,
  allowance: StrictHexStruct,
  tokenSymbol: string(),
  tokenAddress: StrictHexStruct,
  type: string(),
});

const DelegationResponseSchema = type({
  signedDelegation: SignedDelegationSchema,
  metadata: DelegationMetadataSchema,
});

const WalletActivityAccountSchema = type({
  address: StrictHexStruct,
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
  traderProfileIds: array(string()),
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
