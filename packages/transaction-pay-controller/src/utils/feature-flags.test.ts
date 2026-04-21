import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';
import {
  DEFAULT_ACROSS_API_BASE,
  DEFAULT_FALLBACK_GAS_ESTIMATE,
  DEFAULT_FALLBACK_GAS_MAX,
  DEFAULT_GAS_BUFFER,
  DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD,
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  getAssetsUnifyStateFeature,
  getFallbackGas,
  DEFAULT_RELAY_EXECUTE_URL,
  getRelayOriginGasOverhead,
  getRelayPollingInterval,
  getRelayPollingTimeout,
  isEIP7702Chain,
  isRelayExecuteEnabled,
  getFeatureFlags,
  getGasBuffer,
  getPayStrategiesConfig,
  getSlippage,
  getStrategy,
  getStrategyOrder,
} from './feature-flags';
import * as featureFlagsModule from './feature-flags';

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

    it('returns true when executeEnabled is true', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                executeEnabled: true,
              },
            },
          },
        },
      });

      expect(isRelayExecuteEnabled(messenger)).toBe(true);
    });

    it('returns false when executeEnabled is false', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            payStrategies: {
              relay: {
                executeEnabled: false,
              },
            },
          },
        },
      });

      expect(isRelayExecuteEnabled(messenger)).toBe(false);
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
              TransactionPayStrategy.Test,
              TransactionPayStrategy.Bridge,
              TransactionPayStrategy.Relay,
            ],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([
        TransactionPayStrategy.Test,
        TransactionPayStrategy.Bridge,
        TransactionPayStrategy.Relay,
      ]);
    });

    it('filters unknown and duplicate strategies', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: [
              TransactionPayStrategy.Test,
              'unknown-strategy',
              TransactionPayStrategy.Test,
              TransactionPayStrategy.Relay,
            ],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual([
        TransactionPayStrategy.Test,
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
});
