import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { describe, expect, it } from 'vitest';

import {
  RPC_FAILOVER_MODES,
  selectRpcFailoverModeFeatureFlag,
} from './selectors.js';

/**
 * Builds a complete version of RemoteFeatureFlagController state, filling in the given feature flags.
 *
 * @param state - The partial RemoteFeatureFlagController state.
 * @returns The RemoteFeatureFlagController state object.
 */
function buildRemoteFeatureFlagControllerState(
  state: Partial<RemoteFeatureFlagControllerState>,
): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: {},
    cacheTimestamp: 0,
    ...state,
  };
}

describe('selectRpcFailoverModeFeatureFlag', () => {
  for (const mode of RPC_FAILOVER_MODES) {
    it(`returns "${mode}" when the corePlatformRpcFailoverMode flag is "${mode}"`, () => {
      const state = buildRemoteFeatureFlagControllerState({
        remoteFeatureFlags: {
          corePlatformRpcFailoverMode: mode,
        },
      });

      expect(selectRpcFailoverModeFeatureFlag(state)).toBe(mode);
    });
  }

  it('returns null when the corePlatformRpcFailoverMode flag is absent', () => {
    const state = buildRemoteFeatureFlagControllerState({
      remoteFeatureFlags: {},
    });

    expect(selectRpcFailoverModeFeatureFlag(state)).toBeNull();
  });

  it('returns null when the corePlatformRpcFailoverMode flag is an unrecognized value', () => {
    const state = buildRemoteFeatureFlagControllerState({
      remoteFeatureFlags: {
        corePlatformRpcFailoverMode: 'something-unrecognized',
      },
    });

    expect(selectRpcFailoverModeFeatureFlag(state)).toBeNull();
  });
});
