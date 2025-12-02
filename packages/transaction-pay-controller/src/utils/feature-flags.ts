import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import { RELAY_URL_BASE } from '../strategy/relay/constants';

const log = createModuleLogger(projectLogger, 'feature-flags');

export const DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_RELAY_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_QUOTE_URL = `${RELAY_URL_BASE}/quote`;

type FeatureFlagsRaw = {
  relayDisabledGasStationChains?: Hex[];
  relayFallbackGas?: {
    estimate?: number;
    max?: number;
  };
  relayQuoteUrl?: string;
};

export type FeatureFlags = {
  relayDisabledGasStationChains: Hex[];
  relayFallbackGas: {
    estimate: number;
    max: number;
  };
  relayQuoteUrl: string;
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
  const state = messenger.call('RemoteFeatureFlagController:getState');

  const featureFlags: FeatureFlagsRaw =
    (state.remoteFeatureFlags.confirmations_pay as FeatureFlagsRaw) ?? {};

  const estimate =
    featureFlags.relayFallbackGas?.estimate ??
    DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE;

  const max =
    featureFlags.relayFallbackGas?.max ?? DEFAULT_RELAY_FALLBACK_GAS_MAX;

  const relayQuoteUrl = featureFlags.relayQuoteUrl ?? DEFAULT_RELAY_QUOTE_URL;

  const relayDisabledGasStationChains =
    featureFlags.relayDisabledGasStationChains ?? [];

  const result = {
    relayDisabledGasStationChains,
    relayFallbackGas: {
      estimate,
      max,
    },
    relayQuoteUrl,
  };

  log('Feature flags:', { raw: featureFlags, result });

  return result;
}
