import {
  DEFAULT_GAS_BUFFER,
  DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE,
  DEFAULT_RELAY_FALLBACK_GAS_MAX,
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  getFeatureFlags,
  getGasBuffer,
} from './feature-flags';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { getMessengerMock } from '../tests/messenger-mock';

const GAS_FALLBACK_ESTIMATE_MOCK = 123;
const GAS_FALLBACK_MAX_MOCK = 456;
const RELAY_QUOTE_URL_MOCK = 'https://test.com/test';
const RELAY_GAS_STATION_DISABLED_CHAINS_MOCK = ['0x1', '0x2'];
const SLIPPAGE_MOCK = 0.01;
const GAS_BUFFER_DEFAULT_MOCK = 1.5;
const GAS_BUFFER_CHAIN_SPECIFIC_MOCK = 2.0;
const CHAIN_ID_MOCK = '0x1';
const CHAIN_ID_DIFFERENT_MOCK = '0x89';

describe('Feature Flags Utils', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
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
        slippage: DEFAULT_SLIPPAGE,
      });
    });

    it('returns feature flags', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            relayDisabledGasStationChains:
              RELAY_GAS_STATION_DISABLED_CHAINS_MOCK,
            relayFallbackGas: {
              estimate: GAS_FALLBACK_ESTIMATE_MOCK,
              max: GAS_FALLBACK_MAX_MOCK,
            },
            relayQuoteUrl: RELAY_QUOTE_URL_MOCK,
            slippage: SLIPPAGE_MOCK,
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
        slippage: SLIPPAGE_MOCK,
      });
    });
  });

  describe('getGasBuffer', () => {
    it('returns default gas buffer when none are set', () => {
      const gasBuffer = getGasBuffer(messenger, CHAIN_ID_MOCK);

      expect(gasBuffer).toBe(DEFAULT_GAS_BUFFER);
    });

    it('returns default gas buffer from feature flags when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            gasBuffer: {
              default: GAS_BUFFER_DEFAULT_MOCK,
            },
          },
        },
      });

      const gasBuffer = getGasBuffer(messenger, CHAIN_ID_MOCK);

      expect(gasBuffer).toBe(GAS_BUFFER_DEFAULT_MOCK);
    });

    it('returns per-chain gas buffer when set for specific chain', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            gasBuffer: {
              default: GAS_BUFFER_DEFAULT_MOCK,
              perChainConfig: {
                [CHAIN_ID_MOCK]: {
                  name: 'Ethereum Mainnet',
                  buffer: GAS_BUFFER_CHAIN_SPECIFIC_MOCK,
                },
              },
            },
          },
        },
      });

      const gasBuffer = getGasBuffer(messenger, CHAIN_ID_MOCK);

      expect(gasBuffer).toBe(GAS_BUFFER_CHAIN_SPECIFIC_MOCK);
    });

    it('falls back to default gas buffer when per-chain config exists but specific chain is not found', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            gasBuffer: {
              default: GAS_BUFFER_DEFAULT_MOCK,
              perChainConfig: {
                [CHAIN_ID_MOCK]: {
                  name: 'Ethereum Mainnet',
                  buffer: GAS_BUFFER_CHAIN_SPECIFIC_MOCK,
                },
              },
            },
          },
        },
      });

      const gasBuffer = getGasBuffer(messenger, CHAIN_ID_DIFFERENT_MOCK);

      expect(gasBuffer).toBe(GAS_BUFFER_DEFAULT_MOCK);
    });

    it('falls back to hardcoded default when per-chain config exists but no default is set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            gasBuffer: {
              perChainConfig: {
                [CHAIN_ID_MOCK]: {
                  name: 'Ethereum Mainnet',
                  buffer: GAS_BUFFER_CHAIN_SPECIFIC_MOCK,
                },
              },
            },
          },
        },
      });

      const gasBuffer = getGasBuffer(messenger, CHAIN_ID_DIFFERENT_MOCK);

      expect(gasBuffer).toBe(DEFAULT_GAS_BUFFER);
    });
  });
});
