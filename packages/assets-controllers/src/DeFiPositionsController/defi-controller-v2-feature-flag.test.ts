import { getProcessingPollConfig } from './defi-controller-v2-feature-flag.js';

/** Mirrors the internal defaults in `defi-controller-v2-feature-flag.ts`. */
const DEFAULT_PROCESSING_POLL_INTERVAL_MS = 5_000;
const DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS = 5;
const DEFI_CONTROLLER_V2_FEATURE_FLAG = 'defiControllerV2';

/**
 * @param remoteFeatureFlags - Remote feature flags to return from getState.
 * @returns A minimal messenger stub for `getProcessingPollConfig`.
 */
function buildMessenger(remoteFeatureFlags: Record<string, unknown>): {
  call: jest.Mock;
} {
  return {
    call: jest.fn().mockReturnValue({
      remoteFeatureFlags,
      cacheTimestamp: 0,
    }),
  };
}

describe('getProcessingPollConfig', () => {
  it('returns defaults when the remote flag is missing', () => {
    const messenger = buildMessenger({});

    expect(getProcessingPollConfig(messenger)).toStrictEqual({
      maxAttempts: DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS,
      pollInterval: DEFAULT_PROCESSING_POLL_INTERVAL_MS,
    });
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
  });

  it('returns defaults when the remote flag is malformed', () => {
    const messenger = buildMessenger({
      [DEFI_CONTROLLER_V2_FEATURE_FLAG]: 'not-an-object',
    });

    expect(getProcessingPollConfig(messenger)).toStrictEqual({
      maxAttempts: DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS,
      pollInterval: DEFAULT_PROCESSING_POLL_INTERVAL_MS,
    });
  });

  it('resolves maxAttempts and pollInterval from the remote flag', () => {
    const messenger = buildMessenger({
      [DEFI_CONTROLLER_V2_FEATURE_FLAG]: {
        enabled: true,
        maxAttempts: 3,
        pollInterval: 1000,
      },
    });

    expect(getProcessingPollConfig(messenger)).toStrictEqual({
      maxAttempts: 3,
      pollInterval: 1000,
    });
  });

  it('floors maxAttempts and falls back for non-positive or non-finite values', () => {
    expect(
      getProcessingPollConfig(
        buildMessenger({
          [DEFI_CONTROLLER_V2_FEATURE_FLAG]: {
            maxAttempts: 2.9,
            pollInterval: 2500,
          },
        }),
      ),
    ).toStrictEqual({
      maxAttempts: 2,
      pollInterval: 2500,
    });

    expect(
      getProcessingPollConfig(
        buildMessenger({
          [DEFI_CONTROLLER_V2_FEATURE_FLAG]: {
            maxAttempts: 0,
            pollInterval: Number.NaN,
          },
        }),
      ),
    ).toStrictEqual({
      maxAttempts: DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS,
      pollInterval: DEFAULT_PROCESSING_POLL_INTERVAL_MS,
    });

    expect(
      getProcessingPollConfig(
        buildMessenger({
          [DEFI_CONTROLLER_V2_FEATURE_FLAG]: {
            maxAttempts: 2,
          },
        }),
      ),
    ).toStrictEqual({
      maxAttempts: 2,
      pollInterval: DEFAULT_PROCESSING_POLL_INTERVAL_MS,
    });
  });
});
