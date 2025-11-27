import {
  DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE,
  DEFAULT_RELAY_FALLBACK_GAS_MAX,
  DEFAULT_RELAY_QUOTE_URL,
  getFeatureFlags,
} from './feature-flags';
import { getMessengerMock } from '../tests/messenger-mock';

const GAS_FALLBACK_ESTIMATE_MOCK = 123;
const GAS_FALLBACK_MAX_MOCK = 456;
const RELAY_QUOTE_URL_MOCK = 'https://test.com/test';
const RELAY_GAS_STATION_DISABLED_CHAINS_MOCK = ['0x1', '0x2'];

describe('Feature Flags Utils', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: {},
    });
  });

  describe('getFeatureFlags', () => {
    it('returns default feature flags when none are set', () => {
      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags).toStrictEqual({
        relayDisabledGasStationChains: [],
        relayFallbackGas: {
          estimate: DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE,
          max: DEFAULT_RELAY_FALLBACK_GAS_MAX,
        },
        relayQuoteUrl: DEFAULT_RELAY_QUOTE_URL,
      });
    });

    it('returns feature flags', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        cacheTimestamp: 0,
        remoteFeatureFlags: {
          confirmations_pay: {
            relayDisabledGasStationChains:
              RELAY_GAS_STATION_DISABLED_CHAINS_MOCK,
            relayFallbackGas: {
              estimate: GAS_FALLBACK_ESTIMATE_MOCK,
              max: GAS_FALLBACK_MAX_MOCK,
            },
            relayQuoteUrl: RELAY_QUOTE_URL_MOCK,
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags).toStrictEqual({
        relayDisabledGasStationChains: RELAY_GAS_STATION_DISABLED_CHAINS_MOCK,
        relayFallbackGas: {
          estimate: GAS_FALLBACK_ESTIMATE_MOCK,
          max: GAS_FALLBACK_MAX_MOCK,
        },
        relayQuoteUrl: RELAY_QUOTE_URL_MOCK,
      });
    });
  });
});
