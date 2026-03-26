import type { TransactionPayControllerMessenger } from '../types';

/**
 * Get the merged confirmations_pay feature flags from the remote feature flag
 * controller state.
 *
 * Local overrides take precedence over remote feature flags.
 *
 * @param messenger - Controller messenger.
 * @returns Merged confirmations_pay feature flags.
 */
export function getConfirmationsPayFeatureFlags(
  messenger: TransactionPayControllerMessenger,
): unknown {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags = {
    ...(state.remoteFeatureFlags ?? {}),
    ...(state.localOverrides ?? {}),
  };

  return featureFlags.confirmations_pay;
}
