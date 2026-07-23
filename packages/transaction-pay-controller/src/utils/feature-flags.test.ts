import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { TransactionPayStrategy } from '../constants.js';
import type { TransactionPayFiatAsset } from '../strategy/fiat/constants.js';
import { FIAT_ENABLED_TYPES } from '../strategy/fiat/constants.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import {
  DEFAULT_ACROSS_API_BASE,
  DEFAULT_FALLBACK_GAS_ESTIMATE,
  DEFAULT_FALLBACK_GAS_MAX,
  DEFAULT_GAS_BUFFER,
  DEFAULT_SERVER_BASE_URL,
  DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD,
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  getAssetsUnifyStateFeature,
  getFallbackGas,
  getFiatAssetPerTransactionType,
  getFiatEnabledTypes,
  getFiatFeeReserveMultiplier,
  getFiatMaxRateDriftPercent,
  getFiatOrderPollIntervalMs,
  getFiatOrderPollTimeoutMs,
  DEFAULT_RELAY_EXECUTE_URL,
  getDirectMoneyMusdEnabled,
  getServerPollingInterval,
  getServerPollingTimeout,
  getFiatVaultDisabled,
  getRelayOriginGasOverhead,
  getRelayPollingInterval,
  getRelayPollingTimeout,
  getStablecoins,
  isChainExcludedFromInfura,
  isEIP7702Chain,
  isRelayExecuteEnabled,
  getFeatureFlags,
  getGasBuffer,
  getHyperliquidActivationFeeConfig,
  DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD,
  getPayStrategiesConfig,
  getSlippage,
  getStrategy,
  getStrategyOrder,
} from './feature-flags.js';
import * as featureFlagsModule from './feature-flags.js';

const GAS_FALLBACK_ESTIMATE_MOCK = 123;
const GAS_FALLBACK_MAX_MOCK = 456;
const RELAY_QUOTE_URL_MOCK = 'https://test.com/test';
const RELAY_GAS_STATION_DISABLED_CHAINS_MOCK = ['0x1', '0x2'];
const SLIPPAGE_MOCK = 0.01;
const GAS_BUFFER_DEFAULT_MOCK = 1.5;
const GAS_BUFFER_CHAIN_SPECIFIC_MOCK = 2.0;
const CHAIN_ID_MOCK = '0x1' as Hex;
const CHAIN_ID_DIFFERENT_MOCK = '0x89' as Hex;
const TOKEN_ADDRESS_MOCK = '0xabc123def456' as Hex;
const TOKEN_ADDRESS_DIFFERENT_MOCK = '0xdef789abc012' as Hex;
const TOKEN_SPECIFIC_SLIPPAGE_MOCK = 0.02;

describe('Feature Flags Utils', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });
  });

  describe('module surface', () => {
    it('does not expose raw confirmations_pay feature flags', () => {
      expect(featureFlagsModule).not.toHaveProperty(
        'getConfirmationsPayFeatureFlags',
      );
    });

    it('does not expose route resolution from raw feature flags', () => {
      expect(featureFlagsModule).not.toHaveProperty(
        'getStrategyOrderForRouteFromFeatureFlags',
      );
    });

    it('does not expose the old route helper name', () => {
      expect(featureFlagsModule).not.toHaveProperty('getStrategiesForRoute');
    });
  });

  describe('getFeatureFlags', () => {
    it('returns default feature flags when none are set', () => {
      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags).toStrictEqual({
        relayDisabledGasStationChains: [],
        relayExecuteUrl: DEFAULT_RELAY_EXECUTE_URL,
        relayFallbackGas: {
          estimate: DEFAULT_FALLBACK_GAS_ESTIMATE,
          max: DEFAULT_FALLBACK_GAS_MAX,
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
        relayExecuteUrl: DEFAULT_RELAY_EXECUTE_URL,
        relayFallbackGas: {
          estimate: GAS_FALLBACK_ESTIMATE_MOCK,
          max: GAS_FALLBACK_MAX_MOCK,
        },
        relayQuoteUrl: RELAY_QUOTE_URL_MOCK,
        slippage: SLIPPAGE_MOCK,
      });
    });
  });

  describe('getFallbackGas', () => {
    it('returns default fallback gas when feature flag is not set', () => {
      const fallbackGas = getFallbackGas(messenger);

      expect(fallbackGas).toStrictEqual({
        estimate: DEFAULT_FALLBACK_GAS_ESTIMATE,
        max: DEFAULT_FALLBACK_GAS_MAX,
      });
    });

    it('returns fallback gas from feature flags when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            relayFallbackGas: {
              estimate: GAS_FALLBACK_ESTIMATE_MOCK,
              max: GAS_FALLBACK_MAX_MOCK,
            },
          },
        },
      });

      const fallbackGas = getFallbackGas(messenger);

      expect(fallbackGas).toStrictEqual({
        estimate: GAS_FALLBACK_ESTIMATE_MOCK,
        max: GAS_FALLBACK_MAX_MOCK,
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

  describe('getSlippage', () => {
    it('returns default slippage when no feature flags are set', () => {
      const slippage = getSlippage(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(slippage).toBe(DEFAULT_SLIPPAGE);
    });

    it('returns general slippage from feature flags when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(slippage).toBe(SLIPPAGE_MOCK);
    });

    it('returns token-specific slippage when set for specific chain and token', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
            slippageTokens: {
              [CHAIN_ID_MOCK]: {
                [TOKEN_ADDRESS_MOCK]: TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(slippage).toBe(TOKEN_SPECIFIC_SLIPPAGE_MOCK);
    });

    it('is case insensitive for chain ID', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
            slippageTokens: {
              '0X1': {
                [TOKEN_ADDRESS_MOCK]: TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(messenger, '0x1' as Hex, TOKEN_ADDRESS_MOCK);

      expect(slippage).toBe(TOKEN_SPECIFIC_SLIPPAGE_MOCK);
    });

    it('is case insensitive for token address', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
            slippageTokens: {
              [CHAIN_ID_MOCK]: {
                '0xABC123DEF456': TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_MOCK,
        '0xabc123def456' as Hex,
      );

      expect(slippage).toBe(TOKEN_SPECIFIC_SLIPPAGE_MOCK);
    });

    it('falls back to general slippage when chain exists but token not found', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
            slippageTokens: {
              [CHAIN_ID_MOCK]: {
                [TOKEN_ADDRESS_MOCK]: TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_DIFFERENT_MOCK,
      );

      expect(slippage).toBe(SLIPPAGE_MOCK);
    });

    it('falls back to general slippage when chain not found in slippageTokens', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippage: SLIPPAGE_MOCK,
            slippageTokens: {
              [CHAIN_ID_MOCK]: {
                [TOKEN_ADDRESS_MOCK]: TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_DIFFERENT_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(slippage).toBe(SLIPPAGE_MOCK);
    });

    it('falls back to default slippage when slippageTokens exists but no general slippage and token not found', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            slippageTokens: {
              [CHAIN_ID_MOCK]: {
                [TOKEN_ADDRESS_MOCK]: TOKEN_SPECIFIC_SLIPPAGE_MOCK,
              },
            },
          },
        },
      });

      const slippage = getSlippage(
        messenger,
        CHAIN_ID_DIFFERENT_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(slippage).toBe(DEFAULT_SLIPPAGE);
    });
  });

  describe('isEIP7702Chain', () => {
    it('returns false when no feature flags are set', () => {
      expect(isEIP7702Chain(messenger, CHAIN_ID_MOCK)).toBe(false);
    });

    it('returns true for a supported chain', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {
            supportedChains: [CHAIN_ID_MOCK, CHAIN_ID_DIFFERENT_MOCK],
          },
        },
      });

      expect(isEIP7702Chain(messenger, CHAIN_ID_MOCK)).toBe(true);
    });

    it('returns false for an unsupported chain', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {
            supportedChains: [CHAIN_ID_DIFFERENT_MOCK],
          },
        },
      });

      expect(isEIP7702Chain(messenger, CHAIN_ID_MOCK)).toBe(false);
    });

    it('returns false when supportedChains is undefined', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {},
        },
      });

      expect(isEIP7702Chain(messenger, CHAIN_ID_MOCK)).toBe(false);
    });
  });

  describe('isRelayExecuteEnabled', () => {
    it('returns false when no feature flags are set', () => {
      expect(isRelayExecuteEnabled(messenger)).toBe(false);
    });

    it('returns true when gaslessEnabled is true', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              relay: {
                gaslessEnabled: true,
              },
            },
          },
        },
      });

      expect(isRelayExecuteEnabled(messenger)).toBe(true);
    });

    it('returns false when gaslessEnabled is false', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              relay: {
                gaslessEnabled: false,
              },
            },
          },
        },
      });

      expect(isRelayExecuteEnabled(messenger)).toBe(false);
    });
  });

  describe('isChainExcludedFromInfura', () => {
    it('returns false when no feature flags are set', () => {
      expect(isChainExcludedFromInfura(messenger, CHAIN_ID_MOCK)).toBe(false);
    });

    it('returns false when excludeChainIdsFromInfura is empty', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: [],
          },
        },
      });

      expect(isChainExcludedFromInfura(messenger, CHAIN_ID_MOCK)).toBe(false);
    });

    it('returns true when chainId is in the exclusion list', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: [CHAIN_ID_MOCK],
          },
        },
      });

      expect(isChainExcludedFromInfura(messenger, CHAIN_ID_MOCK)).toBe(true);
    });

    it('returns false when chainId is not in the exclusion list', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: [CHAIN_ID_DIFFERENT_MOCK],
          },
        },
      });

      expect(isChainExcludedFromInfura(messenger, CHAIN_ID_MOCK)).toBe(false);
    });

    it('performs case-insensitive comparison', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: ['0xA' as Hex],
          },
        },
      });

      expect(isChainExcludedFromInfura(messenger, '0xa' as Hex)).toBe(true);
    });
  });

  describe('getRelayOriginGasOverhead', () => {
    it('returns default when no feature flags are set', () => {
      expect(getRelayOriginGasOverhead(messenger)).toBe(
        DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD,
      );
    });

    it('returns configured value when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                originGasOverhead: '500000',
              },
            },
          },
        },
      });

      expect(getRelayOriginGasOverhead(messenger)).toBe('500000');
    });
  });

  describe('getRelayPollingInterval', () => {
    it('returns default when no feature flags are set', () => {
      expect(getRelayPollingInterval(messenger)).toBe(1000);
    });

    it('returns configured value when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                pollingInterval: 5000,
              },
            },
          },
        },
      });

      expect(getRelayPollingInterval(messenger)).toBe(5000);
    });
  });

  describe('getRelayPollingTimeout', () => {
    it('returns undefined when no feature flags are set', () => {
      expect(getRelayPollingTimeout(messenger)).toBeUndefined();
    });

    it('returns configured value when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                pollingTimeout: 30000,
              },
            },
          },
        },
      });

      expect(getRelayPollingTimeout(messenger)).toBe(30000);
    });

    it('returns zero when set to zero', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                pollingTimeout: 0,
              },
            },
          },
        },
      });

      expect(getRelayPollingTimeout(messenger)).toBe(0);
    });
  });

  describe('getPayStrategiesConfig', () => {
    it('returns defaults when pay strategies config is missing', () => {
      const config = getPayStrategiesConfig(messenger);

      expect(config.across).toStrictEqual(
        expect.objectContaining({
          apiBase: DEFAULT_ACROSS_API_BASE,
          enabled: false,
          fallbackGas: {
            estimate: DEFAULT_FALLBACK_GAS_ESTIMATE,
            max: DEFAULT_FALLBACK_GAS_MAX,
          },
        }),
      );
      expect(config.relay).toStrictEqual(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });

    it('returns feature-flag values when provided', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: {
                apiBase: 'https://across.test',
                enabled: false,
                fallbackGas: {
                  estimate: 123,
                  max: 456,
                },
              },
              relay: {
                enabled: false,
              },
            },
          },
        },
      });

      const config = getPayStrategiesConfig(messenger);

      expect(config.across).toStrictEqual(
        expect.objectContaining({
          apiBase: 'https://across.test',
          enabled: false,
          fallbackGas: {
            estimate: 123,
            max: 456,
          },
        }),
      );
      expect(config.relay).toStrictEqual(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });
  });

  describe('getPayStrategiesConfig - server', () => {
    it('returns defaults when server config is missing', () => {
      const config = getPayStrategiesConfig(messenger);

      expect(config.server).toStrictEqual({
        enabled: false,
        baseUrl: DEFAULT_SERVER_BASE_URL,
        pollingInterval: 2000,
        pollingTimeout: undefined,
      });
    });

    it('returns enabled: true when the flag enables server', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              server: {
                enabled: true,
              },
            },
          },
        },
      });

      expect(getPayStrategiesConfig(messenger).server.enabled).toBe(true);
    });

    it('returns custom baseUrl when set by the feature flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              server: {
                baseUrl: 'https://server.test',
              },
            },
          },
        },
      });

      const { server } = getPayStrategiesConfig(messenger);

      expect(server.baseUrl).toBe('https://server.test');
    });
  });

  describe('getServerPollingInterval', () => {
    it('returns the default polling interval when no feature flag is set', () => {
      expect(getServerPollingInterval(messenger)).toBe(2000);
    });

    it('returns the configured polling interval when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              server: {
                pollingInterval: 7500,
              },
            },
          },
        },
      });

      expect(getServerPollingInterval(messenger)).toBe(7500);
    });
  });

  describe('getServerPollingTimeout', () => {
    it('returns undefined when no feature flag is set', () => {
      expect(getServerPollingTimeout(messenger)).toBeUndefined();
    });

    it('returns the configured polling timeout when set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            payStrategies: {
              server: {
                pollingTimeout: 45000,
              },
            },
          },
        },
      });

      expect(getServerPollingTimeout(messenger)).toBe(45000);
    });
  });

  describe('getAssetsUnifyStateFeature', () => {
    type AssetsUnifyingState =
      | {
          enabled: boolean;
          featureVersion: string | null;
        }
      | undefined;

    const failureCases: {
      description: string;
      assetsUnifyingState: AssetsUnifyingState;
    }[] = [
      {
        description: 'returns false when assetsUnifyState is not set',
        assetsUnifyingState: undefined,
      },
      {
        description: 'returns false when assetsUnifyState.enabled is false',
        assetsUnifyingState: {
          enabled: false,
          featureVersion: '1',
        },
      },
      {
        description:
          'returns false when featureVersion does not match expected version',
        assetsUnifyingState: {
          enabled: true,
          featureVersion: '2',
        },
      },
    ];

    const successCases = [
      {
        description:
          'returns true when assetsUnifyState is enabled and featureVersion matches',
        assetsUnifyingState: {
          enabled: true,
          featureVersion: '1',
        },
      },
    ];

    const arrangeMocks = (assetsUnifyState: AssetsUnifyingState): void => {
      const defaultRemoteFeatureFlagsState =
        getDefaultRemoteFeatureFlagControllerState();
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...defaultRemoteFeatureFlagsState,
        remoteFeatureFlags: {
          ...defaultRemoteFeatureFlagsState.remoteFeatureFlags,
          ...(assetsUnifyState ? { assetsUnifyState } : {}),
        },
      });
    };

    it.each(failureCases)(
      '$description',
      ({ assetsUnifyingState }: (typeof failureCases)[number]) => {
        arrangeMocks(assetsUnifyingState);

        const result = getAssetsUnifyStateFeature(messenger);

        expect(result).toBe(false);
      },
    );

    it.each(successCases)(
      '$description',
      ({ assetsUnifyingState }: (typeof successCases)[number]) => {
        arrangeMocks(assetsUnifyingState);

        const result = getAssetsUnifyStateFeature(messenger);

        expect(result).toBe(true);
      },
    );
  });

  describe('getStrategyOrder', () => {
    it('returns enabled default strategy order when none is set', () => {
      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([TransactionPayStrategy.Relay]);
    });

    it('returns strategy order from feature flags', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [
              TransactionPayStrategy.Fiat,
              TransactionPayStrategy.Relay,
            ],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([
        TransactionPayStrategy.Fiat,
        TransactionPayStrategy.Relay,
      ]);
    });

    it('filters unknown and duplicate strategies', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [
              TransactionPayStrategy.Fiat,
              'unknown-strategy',
              TransactionPayStrategy.Fiat,
              TransactionPayStrategy.Relay,
            ],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([
        TransactionPayStrategy.Fiat,
        TransactionPayStrategy.Relay,
      ]);
    });

    it('falls back to the enabled default strategy order when all entries are invalid', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: ['unknown-strategy'],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([TransactionPayStrategy.Relay]);
    });

    it('supports undefined local overrides when remote feature flags provide strategy order', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        localOverrides: undefined as never,
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [TransactionPayStrategy.Relay],
          },
        },
      });

      expect(getStrategyOrder(messenger)).toStrictEqual([
        TransactionPayStrategy.Relay,
      ]);
    });

    it('returns only Fiat strategy when fiatPaymentMethodId is provided', () => {
      const strategyOrder = getStrategyOrder(
        messenger,
        undefined,
        undefined,
        undefined,
        'card-123',
      );

      expect(strategyOrder).toStrictEqual([TransactionPayStrategy.Fiat]);
    });

    it('returns only Fiat strategy regardless of other routing config when fiatPaymentMethodId is provided', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [
              TransactionPayStrategy.Relay,
              TransactionPayStrategy.Across,
            ],
            strategyOverrides: {
              default: {
                chains: {
                  [CHAIN_ID_MOCK]: [TransactionPayStrategy.Across],
                },
              },
            },
          },
        },
      });

      const strategyOrder = getStrategyOrder(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
        'perpsDeposit',
        '/payments/debit-credit-card',
      );

      expect(strategyOrder).toStrictEqual([TransactionPayStrategy.Fiat]);
    });
  });

  describe('getStrategyOrder route-aware resolution', () => {
    it('uses default routing config when confirmations_pay flags are absent', () => {
      expect(getStrategyOrder(messenger)).toStrictEqual([
        TransactionPayStrategy.Relay,
      ]);
    });

    it('filters invalid strategy override config and dedupes strategies', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [123, 'relay', 'relay'],
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: false },
            },
            strategyOverrides: {
              transactionTypes: {
                perpsDeposit: {
                  default: [123, 'invalid'],
                  chains: {
                    '0xa4b1': [123],
                    '0xa4b2': ['relay'],
                  },
                  tokens: {
                    '0xa4b1': undefined,
                    '0xa4b2': {
                      '0xabc': [123],
                      '0xdef': ['across'],
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xa4b2', '0xdef', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Across]);
    });

    it('resolves strategy overrides in transaction-type token, chain, global token, global chain, transaction-type default, global default precedence', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              default: {
                default: ['across'],
                chains: {
                  '0x89': ['across'],
                },
                tokens: {
                  '0x1': {
                    '0xdef': ['relay', 'across'],
                  },
                },
              },
              transactionTypes: {
                perpsDeposit: {
                  default: ['relay'],
                  chains: {
                    '0xa4b1': ['across'],
                  },
                  tokens: {
                    '0xa4b1': {
                      '0xabc': ['relay', 'across'],
                    },
                  },
                },
              },
            },
            strategyOrder: ['relay', 'across'],
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xa4b1', '0xabc', 'perpsDeposit'),
      ).toStrictEqual([
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Across,
      ]);

      expect(
        getStrategyOrder(messenger, '0xa4b1', '0xdef', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Across]);

      expect(
        getStrategyOrder(messenger, '0x1', '0xdef', 'perpsDeposit'),
      ).toStrictEqual([
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Across,
      ]);

      expect(
        getStrategyOrder(messenger, '0x89', '0xdef', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Across]);

      expect(
        getStrategyOrder(messenger, '0x2', '0xdef', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Relay]);

      expect(getStrategyOrder(messenger, '0x1', '0xdef')).toStrictEqual([
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Across,
      ]);

      expect(getStrategyOrder(messenger, '0x2', '0xabc')).toStrictEqual([
        TransactionPayStrategy.Across,
      ]);
    });

    it('uses default override scope when no transaction-type-specific override matches', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              default: {
                chains: {
                  '0xa4b1': ['across'],
                },
              },
              transactionTypes: {
                perpsDeposit: {
                  default: ['relay'],
                },
              },
            },
            strategyOrder: ['relay', 'across'],
          },
        },
      });

      expect(getStrategyOrder(messenger, '0xa4b1', '0xabc')).toStrictEqual([
        TransactionPayStrategy.Across,
      ]);

      expect(
        getStrategyOrder(messenger, '0x1', '0xabc', 'unknownType'),
      ).toStrictEqual([
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Across,
      ]);
    });

    it('lets blanket global chain overrides beat transaction-type defaults', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              default: {
                chains: {
                  '0xa4b1': ['across'],
                },
              },
              transactionTypes: {
                perpsDeposit: {
                  default: ['relay'],
                },
              },
            },
            strategyOrder: ['relay'],
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xa4b1', '0xabc', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Across]);
    });

    it('matches mixed-case route context hex values against normalized overrides', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              transactionTypes: {
                perpsDeposit: {
                  default: ['relay'],
                  chains: {
                    '0xa4b1': ['across'],
                  },
                  tokens: {
                    '0xa4b1': {
                      '0xabc': ['relay'],
                    },
                  },
                },
              },
            },
            strategyOrder: ['relay', 'across'],
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xA4B1', '0xAbC', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Relay]);

      expect(
        getStrategyOrder(messenger, '0xA4B1', '0xDef', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Across]);
    });

    it('does not fall back when a matched override resolves only to disabled strategies', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: false },
              relay: { enabled: true },
            },
            strategyOverrides: {
              transactionTypes: {
                perpsDeposit: {
                  chains: {
                    '0xa4b1': ['across'],
                  },
                  default: ['relay'],
                },
              },
            },
            strategyOrder: ['across', 'relay'],
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xa4b1', '0xabc', 'perpsDeposit'),
      ).toStrictEqual([]);
    });

    it('ignores empty override entries and falls back to the global order', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              transactionTypes: {
                perpsDeposit: undefined,
              },
            },
            strategyOrder: ['relay'],
          },
        },
      });

      expect(
        getStrategyOrder(messenger, '0xa4b1', '0xabc', 'perpsDeposit'),
      ).toStrictEqual([TransactionPayStrategy.Relay]);
    });

    it('returns an empty strategy list when no enabled strategies remain', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: false },
              relay: { enabled: false },
            },
            strategyOrder: ['relay', 'across'],
          },
        },
      });

      expect(getStrategyOrder(messenger)).toStrictEqual([]);
    });

    it('filters Server out of the strategy order when payStrategies.server is disabled', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: { enabled: true },
              server: { enabled: false },
            },
            strategyOrder: ['server', 'relay'],
          },
        },
      });

      expect(getStrategyOrder(messenger)).toStrictEqual([
        TransactionPayStrategy.Relay,
      ]);
    });

    it('includes Server in the strategy order when payStrategies.server is enabled', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: { enabled: true },
            },
            strategyOrder: ['server', 'relay'],
          },
          confirmations_pay_extended: {
            payStrategies: {
              server: { enabled: true },
            },
          },
        },
      });

      expect(getStrategyOrder(messenger)).toStrictEqual([
        TransactionPayStrategy.Server,
        TransactionPayStrategy.Relay,
      ]);
    });
  });

  describe('getStrategyOrder with remote feature flag controller state', () => {
    it('falls back to defaults when remote feature flag maps are undefined', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        localOverrides: undefined as never,
        remoteFeatureFlags: undefined as never,
      });

      expect(getStrategyOrder(messenger)).toStrictEqual([
        TransactionPayStrategy.Relay,
      ]);
    });
  });

  describe('getStrategy', () => {
    it('returns the first applicable strategy for a route', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: true },
              relay: { enabled: true },
            },
            strategyOverrides: {
              transactionTypes: {
                perpsDeposit: {
                  chains: {
                    '0xa4b1': ['across', 'relay'],
                  },
                },
              },
            },
          },
        },
      });

      expect(getStrategy(messenger, '0xa4b1', '0xabc', 'perpsDeposit')).toBe(
        TransactionPayStrategy.Across,
      );
    });

    it('returns undefined when no enabled strategy remains', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              across: { enabled: false },
              relay: { enabled: false },
            },
            strategyOrder: ['relay', 'across'],
          },
        },
      });

      expect(getStrategy(messenger)).toBeUndefined();
    });
  });

  describe('getFiatAssetPerTransactionType', () => {
    const FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
      address: '0x0000000000000000000000000000000000001010',
      chainId: '0x89',
    };

    it('returns ETH mainnet fallback when transaction type is undefined', () => {
      const result = getFiatAssetPerTransactionType(messenger, undefined);

      expect(result).toStrictEqual({
        address: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
    });

    it('returns ETH mainnet fallback when confirmations_pay_fiat flag is absent', () => {
      const result = getFiatAssetPerTransactionType(
        messenger,
        TransactionType.contractInteraction,
      );

      expect(result).toStrictEqual({
        address: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
    });

    it('returns hardcoded asset when flag exists but has no entry for the transaction type', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.perpsDeposit]: FIAT_ASSET_MOCK,
            },
          },
        },
      });

      const result = getFiatAssetPerTransactionType(
        messenger,
        TransactionType.predictDeposit,
      );

      expect(result).toStrictEqual({
        address: '0x0000000000000000000000000000000000001010',
        chainId: '0x89',
      });
    });

    it('returns feature flag asset when entry matches the transaction type', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FIAT_ASSET_MOCK,
            },
          },
        },
      });

      const result = getFiatAssetPerTransactionType(
        messenger,
        TransactionType.predictDeposit,
      );

      expect(result).toStrictEqual(FIAT_ASSET_MOCK);
    });

    it('returns ETH mainnet fallback when assetPerTransactionType is not defined', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {},
        },
      });

      const result = getFiatAssetPerTransactionType(
        messenger,
        TransactionType.contractInteraction,
      );

      expect(result).toStrictEqual({
        address: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
    });

    it('prefers feature flag over hardcoded asset', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FIAT_ASSET_MOCK,
            },
          },
        },
      });

      const result = getFiatAssetPerTransactionType(
        messenger,
        TransactionType.predictDeposit,
      );

      expect(result).toStrictEqual(FIAT_ASSET_MOCK);
    });
  });

  describe('getFiatEnabledTypes', () => {
    it('returns hardcoded defaults when feature flag is absent', () => {
      const result = getFiatEnabledTypes(messenger);

      expect(result).toStrictEqual(FIAT_ENABLED_TYPES);
    });

    it('returns hardcoded defaults when confirmations_pay_fiat exists but enabledTransactionTypes is missing', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {},
        },
      });

      const result = getFiatEnabledTypes(messenger);

      expect(result).toStrictEqual(FIAT_ENABLED_TYPES);
    });

    it('returns enabled types from feature flag when set', () => {
      const customTypes = [
        TransactionType.perpsDeposit,
        TransactionType.predictDeposit,
      ];

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            enabledTransactionTypes: customTypes,
          },
        },
      });

      const result = getFiatEnabledTypes(messenger);

      expect(result).toStrictEqual(customTypes);
    });
  });

  describe('getFiatFeeReserveMultiplier', () => {
    it('returns 1.2 when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getFiatFeeReserveMultiplier(messenger)).toBe(1.2);
    });

    it('returns the configured multiplier from feature flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { feeReserveMultiplier: 1.5 },
        },
      });

      expect(getFiatFeeReserveMultiplier(messenger)).toBe(1.5);
    });

    it('returns 1.2 when multiplier is zero', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { feeReserveMultiplier: 0 },
        },
      });

      expect(getFiatFeeReserveMultiplier(messenger)).toBe(1.2);
    });

    it('returns 1.2 when multiplier is negative', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { feeReserveMultiplier: -2 },
        },
      });

      expect(getFiatFeeReserveMultiplier(messenger)).toBe(1.2);
    });
  });

  describe('getFiatMaxRateDriftPercent', () => {
    it('returns 10 when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getFiatMaxRateDriftPercent(messenger)).toBe(10);
    });

    it('returns the configured value from feature flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { maxRateDriftPercent: 25 },
        },
      });

      expect(getFiatMaxRateDriftPercent(messenger)).toBe(25);
    });

    it('returns 10 when value is zero', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { maxRateDriftPercent: 0 },
        },
      });

      expect(getFiatMaxRateDriftPercent(messenger)).toBe(10);
    });

    it('returns 10 when value is negative', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { maxRateDriftPercent: -5 },
        },
      });

      expect(getFiatMaxRateDriftPercent(messenger)).toBe(10);
    });
  });

  describe('getDirectMoneyMusdEnabled', () => {
    it('returns false when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getDirectMoneyMusdEnabled(messenger)).toBe(false);
    });

    it('returns false when confirmations_pay_fiat exists without direct mUSD flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {},
        },
      });

      expect(getDirectMoneyMusdEnabled(messenger)).toBe(false);
    });

    it('returns true when direct mUSD flag is true', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { directMoneyMusdEnabled: true },
        },
      });

      expect(getDirectMoneyMusdEnabled(messenger)).toBe(true);
    });

    it('returns false when direct mUSD flag is false', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { directMoneyMusdEnabled: false },
        },
      });

      expect(getDirectMoneyMusdEnabled(messenger)).toBe(false);
    });
  });

  describe('getFiatVaultDisabled', () => {
    it('returns false when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getFiatVaultDisabled(messenger)).toBe(false);
    });

    it('returns false when confirmations_pay_fiat exists without vault flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {},
        },
      });

      expect(getFiatVaultDisabled(messenger)).toBe(false);
    });

    it('returns true when vault disabled flag is true', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { vaultDisabled: true },
        },
      });

      expect(getFiatVaultDisabled(messenger)).toBe(true);
    });

    it('returns false when vault disabled flag is false', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { vaultDisabled: false },
        },
      });

      expect(getFiatVaultDisabled(messenger)).toBe(false);
    });
  });

  describe('getFiatOrderPollIntervalMs', () => {
    it('returns 1000 when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getFiatOrderPollIntervalMs(messenger)).toBe(1000);
    });

    it('returns the configured value from feature flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollIntervalMs: 5000 },
        },
      });

      expect(getFiatOrderPollIntervalMs(messenger)).toBe(5000);
    });

    it('returns 1000 when value is zero', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollIntervalMs: 0 },
        },
      });

      expect(getFiatOrderPollIntervalMs(messenger)).toBe(1000);
    });

    it('returns 1000 when value is negative', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollIntervalMs: -500 },
        },
      });

      expect(getFiatOrderPollIntervalMs(messenger)).toBe(1000);
    });
  });

  describe('getFiatOrderPollTimeoutMs', () => {
    it('returns 600000 when feature flag is not set', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(getFiatOrderPollTimeoutMs(messenger)).toBe(600000);
    });

    it('returns the configured value from feature flag', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollTimeoutMs: 300000 },
        },
      });

      expect(getFiatOrderPollTimeoutMs(messenger)).toBe(300000);
    });

    it('returns 600000 when value is zero', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollTimeoutMs: 0 },
        },
      });

      expect(getFiatOrderPollTimeoutMs(messenger)).toBe(600000);
    });

    it('returns 600000 when value is negative', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: { orderPollTimeoutMs: -1000 },
        },
      });

      expect(getFiatOrderPollTimeoutMs(messenger)).toBe(600000);
    });
  });

  describe('getHyperliquidActivationFeeConfig', () => {
    const TRANSACTION_TYPE = 'perpsWithdraw';

    it('returns disabled with the default fee when the flag is unset', () => {
      expect(
        getHyperliquidActivationFeeConfig(messenger, TRANSACTION_TYPE),
      ).toStrictEqual({
        enabled: false,
        amountUsd: DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD,
      });
    });

    it('reads the transaction-type override', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            overrides: {
              perpsWithdraw: {
                hyperliquidActivationFee: { enabled: true, amountUsd: 2.5 },
              },
            },
          },
        },
      });

      expect(
        getHyperliquidActivationFeeConfig(messenger, TRANSACTION_TYPE),
      ).toStrictEqual({ enabled: true, amountUsd: 2.5 });
    });

    it('falls back to the default config when there is no override', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            default: { hyperliquidActivationFee: { enabled: true } },
          },
        },
      });

      expect(
        getHyperliquidActivationFeeConfig(messenger, TRANSACTION_TYPE),
      ).toStrictEqual({
        enabled: true,
        amountUsd: DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD,
      });
    });

    it('falls back to the default config when no transaction type is provided', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            default: { hyperliquidActivationFee: { enabled: true } },
          },
        },
      });

      expect(getHyperliquidActivationFeeConfig(messenger)).toStrictEqual({
        enabled: true,
        amountUsd: DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD,
      });
    });

    it('prefers the transaction-type override over the default', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            default: { hyperliquidActivationFee: { enabled: false } },
            overrides: {
              perpsWithdraw: {
                hyperliquidActivationFee: { enabled: true },
              },
            },
          },
        },
      });

      expect(
        getHyperliquidActivationFeeConfig(messenger, TRANSACTION_TYPE).enabled,
      ).toBe(true);
    });

    it('falls back to the default fee when the amount is not positive', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_post_quote: {
            overrides: {
              perpsWithdraw: {
                hyperliquidActivationFee: { enabled: true, amountUsd: 0 },
              },
            },
          },
        },
      });

      expect(
        getHyperliquidActivationFeeConfig(messenger, TRANSACTION_TYPE)
          .amountUsd,
      ).toBe(DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD);
    });
  });

  describe('getStablecoins', () => {
    it('returns hardcoded fallback when flag is absent', () => {
      const result = getStablecoins(messenger);
      expect(result).toHaveProperty('0x1');
      expect(result['0x1' as Hex]).toContain(
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
    });

    it('returns flag value when stable-tokens is a valid object', () => {
      const flagValue = {
        '0x1': ['0xaaa', '0xbbb'],
        '0xa4b1': ['0xccc'],
      };

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          'stable-tokens': flagValue,
        },
      });

      expect(getStablecoins(messenger)).toStrictEqual(flagValue);
    });

    it('normalizes addresses and chain IDs to lowercase', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          'stable-tokens': {
            '0xA4B1': ['0xAf88d065e77c8cC2239327C5EDb3A432268e5831'],
          },
        },
      });

      const result = getStablecoins(messenger);
      expect(result).toStrictEqual({
        '0xa4b1': ['0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
      });
    });

    it('skips non-array entries in flag value', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          'stable-tokens': {
            '0x1': ['0xaaa'],
            '0xa4b1': 'not-an-array',
          },
        },
      });

      const result = getStablecoins(messenger);
      expect(result).toStrictEqual({ '0x1': ['0xaaa'] });
    });

    it('returns fallback when flag is an array', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          'stable-tokens': ['not', 'an', 'object'],
        },
      });

      const result = getStablecoins(messenger);
      expect(result).toHaveProperty('0x1');
    });

    it('returns fallback when flag is a primitive', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          'stable-tokens': true,
        },
      });

      const result = getStablecoins(messenger);
      expect(result).toHaveProperty('0x1');
    });
  });
});
