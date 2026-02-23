import type { Hex } from '@metamask/utils';

import {
  DEFAULT_ACROSS_API_BASE,
  DEFAULT_GAS_BUFFER,
  DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE,
  DEFAULT_RELAY_FALLBACK_GAS_MAX,
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  DEFAULT_STRATEGY_ORDER,
  getEIP7702SupportedChains,
  getFeatureFlags,
  getGasBuffer,
  getPayStrategiesConfig,
  getSlippage,
  getStrategyOrder,
} from './feature-flags';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';

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
const METAMASK_FEE_RECIPIENT_MOCK =
  '0x1234567890123456789012345678901234567890' as Hex;
const METAMASK_FEE_MOCK = '0.001';

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

    it('returns normalized metaMaskFee when fee config is valid', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: METAMASK_FEE_RECIPIENT_MOCK,
              fee: METAMASK_FEE_MOCK,
            },
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags.metaMaskFee).toStrictEqual({
        recipient: METAMASK_FEE_RECIPIENT_MOCK,
        fee: METAMASK_FEE_MOCK,
      });
    });

    it('omits metaMaskFee when recipient is missing', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              fee: METAMASK_FEE_MOCK,
            },
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags.metaMaskFee).toBeUndefined();
    });

    it('omits metaMaskFee when fee is missing', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: METAMASK_FEE_RECIPIENT_MOCK,
            },
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags.metaMaskFee).toBeUndefined();
    });

    it('omits metaMaskFee when fee is not numeric', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: METAMASK_FEE_RECIPIENT_MOCK,
              fee: 'abc',
            },
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags.metaMaskFee).toBeUndefined();
    });

    it.each(['0', '-0.1', '1', '1.1'])(
      'omits metaMaskFee when fee is out of bounds: %s',
      (fee) => {
        getRemoteFeatureFlagControllerStateMock.mockReturnValue({
          ...getDefaultRemoteFeatureFlagControllerState(),
          remoteFeatureFlags: {
            confirmations_pay: {
              metaMaskFee: {
                recipient: METAMASK_FEE_RECIPIENT_MOCK,
                fee,
              },
            },
          },
        });

        const featureFlags = getFeatureFlags(messenger);

        expect(featureFlags.metaMaskFee).toBeUndefined();
      },
    );

    it('omits metaMaskFee when recipient is not a valid EVM address', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            metaMaskFee: {
              recipient: '0x1234' as Hex,
              fee: METAMASK_FEE_MOCK,
            },
          },
        },
      });

      const featureFlags = getFeatureFlags(messenger);

      expect(featureFlags.metaMaskFee).toBeUndefined();
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

  describe('getEIP7702SupportedChains', () => {
    it('returns empty array when no feature flags are set', () => {
      const supportedChains = getEIP7702SupportedChains(messenger);

      expect(supportedChains).toStrictEqual([]);
    });

    it('returns supported chains from feature flags', () => {
      const expectedChains = [CHAIN_ID_MOCK, CHAIN_ID_DIFFERENT_MOCK];

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {
            supportedChains: expectedChains,
          },
        },
      });

      const supportedChains = getEIP7702SupportedChains(messenger);

      expect(supportedChains).toStrictEqual(expectedChains);
    });

    it('returns empty array when confirmations_eip_7702 exists but supportedChains is undefined', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {},
        },
      });

      const supportedChains = getEIP7702SupportedChains(messenger);

      expect(supportedChains).toStrictEqual([]);
    });
  });

  describe('getPayStrategiesConfig', () => {
    it('returns defaults when pay strategies config is missing', () => {
      const config = getPayStrategiesConfig(messenger);

      expect(config.across).toStrictEqual(
        expect.objectContaining({
          allowSameChain: false,
          apiBase: DEFAULT_ACROSS_API_BASE,
          enabled: false,
          postActionsEnabled: false,
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
                allowSameChain: true,
                apiBase: 'https://across.test',
                enabled: false,
                integratorId: 'metamask-test',
                postActionsEnabled: true,
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
          allowSameChain: true,
          apiBase: 'https://across.test',
          enabled: false,
          integratorId: 'metamask-test',
          postActionsEnabled: true,
        }),
      );
      expect(config.relay).toStrictEqual(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });
  });

  describe('getStrategyOrder', () => {
    it('returns default strategy order when none is set', () => {
      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual(DEFAULT_STRATEGY_ORDER);
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

    it('falls back to default strategy order when all entries are invalid', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            strategyOrder: ['unknown-strategy'],
          },
        },
      });

      const strategyOrder = getStrategyOrder(messenger);

      expect(strategyOrder).toStrictEqual(DEFAULT_STRATEGY_ORDER);
    });
  });
});
