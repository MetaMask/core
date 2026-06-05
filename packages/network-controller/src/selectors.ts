import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

export function getIsRpcFailoverEnabled(
  state: RemoteFeatureFlagControllerState,
): boolean {
  const walletFrameworkRpcFailoverEnabled = state.remoteFeatureFlags
    .walletFrameworkRpcFailoverEnabled as boolean | undefined;
  return walletFrameworkRpcFailoverEnabled ?? false;
}
