import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { getRewardsFeatureFlag } from './feature-flags';

type MockMessenger = {
  call: jest.Mock<
    RemoteFeatureFlagControllerState,
    ['RemoteFeatureFlagController:getState']
  >;
};

const makeMessenger = (
  state: Partial<RemoteFeatureFlagControllerState> | undefined,
): MockMessenger => {
  return {
    // When state is undefined, coerce to any so we can simulate a bad/missing controller state
    call: jest.fn<
      RemoteFeatureFlagControllerState,
      ['RemoteFeatureFlagController:getState']
    >(() => state as RemoteFeatureFlagControllerState),
  };
};

describe('getRewardsFeatureFlag', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when rewards flag is true', () => {
    const messenger = makeMessenger({
      remoteFeatureFlags: {
        rewards: true,
      },
    });

    const res = getRewardsFeatureFlag(messenger);
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
    expect(res).toBe(true);
  });

  it('returns false when rewards flag is false', () => {
    const messenger = makeMessenger({
      remoteFeatureFlags: {
        rewards: false,
      },
    });

    const res = getRewardsFeatureFlag(messenger);
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
    expect(res).toBe(false);
  });

  it('returns undefined when rewards flag is missing', () => {
    const messenger = makeMessenger({
      remoteFeatureFlags: {
        // no rewards key
      },
    });

    // Note: the function’s TS return type is boolean, but at runtime it can be undefined
    // because it casts via `as boolean` without defaulting. We assert the runtime behavior here.
    const res = getRewardsFeatureFlag(messenger as any);
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
    expect(res).toBeUndefined();
  });

  it('returns undefined when remoteFeatureFlags is missing', () => {
    const messenger = makeMessenger({
      // remoteFeatureFlags: undefined
    });

    const res = getRewardsFeatureFlag(messenger as any);
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
    expect(res).toBeUndefined();
  });

  it('returns undefined when controller state is undefined (defensive)', () => {
    const messenger = makeMessenger(undefined);

    const res = getRewardsFeatureFlag(messenger as any);
    expect(messenger.call).toHaveBeenCalledWith(
      'RemoteFeatureFlagController:getState',
    );
    expect(res).toBeUndefined();
  });
});
