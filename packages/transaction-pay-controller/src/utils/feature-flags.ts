import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import { RELAY_URL_BASE } from '../strategy/relay/constants';

const log = createModuleLogger(projectLogger, 'feature-flags');

export const DEFAULT_GAS_BUFFER = 1.0;
export const DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_RELAY_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_QUOTE_URL = `${RELAY_URL_BASE}/quote`;
export const DEFAULT_SLIPPAGE = 0.005;
export const DEFAULT_ACROSS_API_BASE = 'https://app.across.to/api';

export type TokenPayProviderId = 'relay' | 'across';

type FeatureFlagsRaw = {
  gasBuffer?: {
    default?: number;
    perChainConfig?: Record<
      Hex,
      {
        name?: string;
        buffer?: number;
      }
    >;
  };
  relayDisabledGasStationChains?: Hex[];
  relayFallbackGas?: {
    estimate?: number;
    max?: number;
  };
  relayQuoteUrl?: string;
  slippage?: number;
  slippageTokens?: Record<Hex, Record<Hex, number>>;
  tokenPay?: TokenPayConfigRaw;
};

export type FeatureFlags = {
  relayDisabledGasStationChains: Hex[];
  relayFallbackGas: {
    estimate: number;
    max: number;
  };
  relayQuoteUrl: string;
  slippage: number;
};

export type TokenPayProviderConfigRaw = {
  allowSameChain?: boolean;
  apiBase?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  appFee?: string;
  appFeeRecipient?: string;
  enabled?: boolean;
  integratorId?: string;
  slippage?: number;
};

export type TokenPayConfigRaw = {
  primaryProvider?: TokenPayProviderId;
  providerOrder?: TokenPayProviderId[];
  providers?: {
    across?: TokenPayProviderConfigRaw;
    relay?: {
      enabled?: boolean;
      relayQuoteUrl?: string;
    };
  };
};

export type TokenPayConfig = {
  primaryProvider: TokenPayProviderId;
  providerOrder: TokenPayProviderId[];
  providers: {
    across: TokenPayProviderConfigRaw & {
      allowSameChain: boolean;
      apiBase: string;
      enabled: boolean;
    };
    relay: {
      enabled: boolean;
      relayQuoteUrl: string;
    };
  };
};

/**
 * Get feature flags related to the controller.
 *
 * @param messenger - Controller messenger.
 * @returns Feature flags.
 */
export function getFeatureFlags(
  messenger: TransactionPayControllerMessenger,
): FeatureFlags {
  const featureFlags = getFeatureFlagsRaw(messenger);

  const estimate =
    featureFlags.relayFallbackGas?.estimate ??
    DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE;

  const max =
    featureFlags.relayFallbackGas?.max ?? DEFAULT_RELAY_FALLBACK_GAS_MAX;

  const relayQuoteUrl = featureFlags.relayQuoteUrl ?? DEFAULT_RELAY_QUOTE_URL;

  const relayDisabledGasStationChains =
    featureFlags.relayDisabledGasStationChains ?? [];

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;

  const result = {
    relayDisabledGasStationChains,
    relayFallbackGas: {
      estimate,
      max,
    },
    relayQuoteUrl,
    slippage,
  };

  log('Feature flags:', { raw: featureFlags, result });

  return result;
}

/**
 * Get Token Pay configuration.
 *
 * @param messenger - Controller messenger.
 * @returns Token Pay configuration.
 */
export function getTokenPayConfig(
  messenger: TransactionPayControllerMessenger,
): TokenPayConfig {
  const featureFlags = getFeatureFlagsRaw(messenger);
  const tokenPay = featureFlags.tokenPay ?? {};

  const primaryProvider = tokenPay.primaryProvider ?? 'relay';
  const providerOrder = tokenPay.providerOrder ?? [
    primaryProvider,
    'relay',
    'across',
  ];

  // dedupe
  const normalizedOrder = Array.from(new Set(providerOrder.filter(Boolean)));

  const acrossRaw = tokenPay.providers?.across ?? {};
  const relayRaw = tokenPay.providers?.relay ?? {};

  const across = {
    allowSameChain: acrossRaw.allowSameChain ?? false,
    apiBase: acrossRaw.apiBase ?? DEFAULT_ACROSS_API_BASE,
    apiKey: acrossRaw.apiKey,
    apiKeyHeader: acrossRaw.apiKeyHeader,
    apiKeyPrefix: acrossRaw.apiKeyPrefix,
    appFee: acrossRaw.appFee,
    appFeeRecipient: acrossRaw.appFeeRecipient,
    enabled: acrossRaw.enabled ?? true,
    integratorId: acrossRaw.integratorId,
    slippage: acrossRaw.slippage,
  };

  const relay = {
    enabled: relayRaw.enabled ?? true,
    relayQuoteUrl:
      relayRaw.relayQuoteUrl ??
      featureFlags.relayQuoteUrl ??
      DEFAULT_RELAY_QUOTE_URL,
  };

  return {
    primaryProvider,
    providerOrder: normalizedOrder.length ? normalizedOrder : [primaryProvider],
    providers: {
      across,
      relay,
    },
  };
}

/**
 * Get the gas buffer value for a specific chain ID.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to get gas buffer for.
 * @returns Gas buffer value.
 */
export function getGasBuffer(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
): number {
  const featureFlags = getFeatureFlagsRaw(messenger);

  return (
    featureFlags.gasBuffer?.perChainConfig?.[chainId]?.buffer ??
    featureFlags.gasBuffer?.default ??
    DEFAULT_GAS_BUFFER
  );
}

/**
 * Get the slippage value for a specific chain ID and token address.
 * Falls back to the general slippage feature flag, then the static default.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to get slippage for.
 * @param tokenAddress - Token address to get slippage for.
 * @returns Slippage value as a decimal (e.g., 0.005 for 0.5%).
 */
export function getSlippage(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
  tokenAddress: Hex,
): number {
  const featureFlags = getFeatureFlagsRaw(messenger);
  const { slippageTokens } = featureFlags;

  const tokenMap = getCaseInsensitive(slippageTokens, chainId);
  const tokenSlippage = getCaseInsensitive(tokenMap, tokenAddress);

  if (tokenSlippage !== undefined) {
    log('Using token-specific slippage', {
      chainId,
      tokenAddress,
      slippage: tokenSlippage,
    });
    return tokenSlippage;
  }

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;
  log('Using default slippage', { chainId, tokenAddress, slippage });
  return slippage;
}

/**
 * Get a value from a record using a case-insensitive key lookup.
 *
 * @param record - The record to search.
 * @param key - The key to look up (case-insensitive).
 * @returns The value if found, undefined otherwise.
 */
function getCaseInsensitive<Value>(
  record: Record<string, Value> | undefined,
  key: string,
): Value | undefined {
  if (!record) {
    return undefined;
  }

  const normalizedKey = key.toLowerCase();
  const entry = Object.entries(record).find(
    ([k]) => k.toLowerCase() === normalizedKey,
  );

  return entry?.[1];
}

/**
 * Retrieves the supported EIP-7702 chains from feature flags.
 *
 * @param messenger - Controller messenger.
 * @returns Array of chain IDs that support EIP-7702.
 */
export function getEIP7702SupportedChains(
  messenger: TransactionPayControllerMessenger,
): Hex[] {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const eip7702Flags = state.remoteFeatureFlags.confirmations_eip_7702 as
    | { supportedChains?: Hex[] }
    | undefined;

  return eip7702Flags?.supportedChains ?? [];
}

/**
 * Get the raw feature flags from the remote feature flag controller.
 *
 * @param messenger - Controller messenger.
 * @returns Raw feature flags.
 */
function getFeatureFlagsRaw(
  messenger: TransactionPayControllerMessenger,
): FeatureFlagsRaw {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  return (state.remoteFeatureFlags.confirmations_pay as FeatureFlagsRaw) ?? {};
}
