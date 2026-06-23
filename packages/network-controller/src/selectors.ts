import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

export function getIsRpcFailoverEnabled(
  state: RemoteFeatureFlagControllerState,
): boolean {
  const walletFrameworkRpcFailoverEnabled = state.remoteFeatureFlags
    .walletFrameworkRpcFailoverEnabled as boolean | undefined;
  return walletFrameworkRpcFailoverEnabled ?? false;
}

export function getIsRpcFailoverForced(
  state: RemoteFeatureFlagControllerState,
): boolean {
  const corePlatformRpcFailoverForceEnabled = state.remoteFeatureFlags
    .corePlatformRpcFailoverForceEnabled as boolean | undefined;
  return corePlatformRpcFailoverForceEnabled ?? false;
}
