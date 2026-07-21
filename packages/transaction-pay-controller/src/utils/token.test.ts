import { Interface } from '@ethersproject/abi';
import { jest } from '@jest/globals';
import type { TokensControllerState } from '@metamask/assets-controllers';
import type { AccountTrackerControllerState } from '@metamask/assets-controllers';
import type { TokenRatesControllerState } from '@metamask/assets-controllers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { RpcEndpointType } from '@metamask/network-controller';
import type { NetworkConfiguration } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import {
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  POLYGON_USDCE_ADDRESS,
} from '../constants.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  computeTokenAmounts,
  getTokenBalance,
  getTokenInfo,
  getTokenFiatRate,
  getNativeToken,
  isSameToken,
  getLiveTokenBalance,
  normalizeTokenAddress,
  TokenAddressTarget,
} from './token.js';

const TOKEN_ADDRESS_MOCK = '0x559B65722aD62AD6DAC4Fa5a1c6B23A2e8ce57Ec' as Hex;
const TOKEN_ADDRESS_2_MOCK = '0x123456789abcdef1234567890abcdef12345678' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const DECIMALS_MOCK = 6;
const BALANCE_MOCK = '0x123' as Hex;
const FROM_MOCK = '0x456' as Hex;
const NETWORK_CLIENT_ID_MOCK = '123-456';
const INFURA_NETWORK_CLIENT_ID_MOCK = 'mainnet';
const TICKER_MOCK = 'TST';
const SYMBOL_MOCK = 'TEST';
const ACCOUNT_MOCK = '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const ERC20_ADDRESS_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const PROVIDER_MOCK = { request: jest.fn() };

describe('Token Utils', () => {
  const {
    messenger,
    getAssetsControllerStateMock,
    getRemoteFeatureFlagControllerStateMock,
    getTokensControllerStateMock,
    getNetworkClientByIdMock,
    getNetworkConfigurationByChainIdMock,
    getTokenBalanceControllerStateMock,
    getAccountTrackerControllerStateMock,
    getTokenRatesControllerStateMock,
    getCurrencyRateControllerStateMock,
    findNetworkClientIdByChainIdMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    getNetworkConfigurationByChainIdMock.mockReturnValue(undefined);

    getNetworkClientByIdMock.mockReturnValue({
      configuration: { ticker: TICKER_MOCK },
      provider: PROVIDER_MOCK,
    } as never);
  });

  function enableAssetsUnifyState(): void {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        assetsUnifyState: {
          enabled: true,
          featureVersion: '1',
          minimumVersion: null,
        },
      },
    });
  }

  describe('getTokenInfo', () => {
    it('returns decimals and symbol from AssetsController when assets unify state feature is enabled', () => {
      enableAssetsUnifyState();
      getAssetsControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
                decimals: DECIMALS_MOCK,
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      });

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns decimals and symbol from controller state', () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
                decimals: DECIMALS_MOCK,
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      } as never);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns normalized decimals', () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
                decimals: '6',
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      } as never);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns undefined if token is not found', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toBeUndefined();
    });

    it('returns native token info', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        decimals: 18,
        symbol: TICKER_MOCK,
      });
    });

    it('returns undefined if native ticker is not found', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);
      getNetworkClientByIdMock.mockReturnValue(undefined as never);

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('supports non-standard native token address', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      const result = getTokenInfo(
        messenger,
        '0x0000000000000000000000000000000000001010',
        '0x89',
      );

      expect(result).toStrictEqual({
        decimals: 18,
        symbol: TICKER_MOCK,
      });
    });
  });

  describe('getTokenBalance', () => {
    it('returns token balance from AssetsController when assets unify state feature is enabled', () => {
      enableAssetsUnifyState();
      getAssetsControllerStateMock.mockReturnValue({
        tokenBalances: {
          [FROM_MOCK]: {
            [CHAIN_ID_MOCK]: {
              [TOKEN_ADDRESS_MOCK]: BALANCE_MOCK,
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('291');
    });

    it('returns native balance from AssetsController when assets unify state feature is enabled', () => {
      enableAssetsUnifyState();
      getAssetsControllerStateMock.mockReturnValue({
        tokenBalances: {},
        accountsByChainId: {
          [CHAIN_ID_MOCK]: {
            [FROM_MOCK]: {
              balance: '0x123',
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('291');
    });

    it('returns balance from controller state', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {
          [FROM_MOCK]: {
            [CHAIN_ID_MOCK]: {
              [TOKEN_ADDRESS_MOCK]: BALANCE_MOCK,
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('291');
    });

    it('returns zero if token not found', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('0');
    });

    it('returns native balance', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      getAccountTrackerControllerStateMock.mockReturnValue({
        accountsByChainId: {
          [CHAIN_ID_MOCK]: {
            [FROM_MOCK]: {
              balance: '0x123',
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('291');
    });

    it('returns zero if native balance not found', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      getAccountTrackerControllerStateMock.mockReturnValue({
        accountsByChainId: {
          [CHAIN_ID_MOCK]: {
            [FROM_MOCK]: {},
          },
        },
      } as AccountTrackerControllerState);

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('0');
    });
  });

  describe('getTokenFiatRate', () => {
    it('returns fiat rates from AssetsController when assets unify state feature is enabled', () => {
      enableAssetsUnifyState();

      getAssetsControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '6',
        usdRate: '8',
      });
    });

    it('returns fiat rates', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '6',
        usdRate: '8',
      });
    });

    it('returns undefined if no network configuration', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
      getNetworkClientByIdMock.mockReturnValue(undefined as never);

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no price', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {},
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no currency rate', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {},
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns native rate if native token', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {},
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '3',
        usdRate: '4',
      });
    });

    it('returns fixed usd rate for stablecoins', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_POLYGON]: {
            [POLYGON_USDCE_ADDRESS]: {
              price: 1.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        POLYGON_USDCE_ADDRESS,
        CHAIN_ID_POLYGON,
      );

      expect(result).toStrictEqual({
        fiatRate: '3',
        usdRate: '1',
      });
    });
  });

  describe('getNativeToken', () => {
    it('returns alternate address for polygon', () => {
      expect(getNativeToken('0x89')).toBe(
        '0x0000000000000000000000000000000000001010',
      );
    });

    it('returns zero address for other chains', () => {
      expect(getNativeToken('0x1')).toBe(NATIVE_TOKEN_ADDRESS);
    });
  });

  describe('normalizeTokenAddress', () => {
    const POLYGON_NATIVE_TOKEN =
      '0x0000000000000000000000000000000000001010' as Hex;

    it('returns Relay native token address for Polygon native token', () => {
      const result = normalizeTokenAddress(
        POLYGON_NATIVE_TOKEN,
        CHAIN_ID_POLYGON,
        TokenAddressTarget.Relay,
      );

      expect(result).toBe(NATIVE_TOKEN_ADDRESS);
    });

    it('returns Polygon native token address for MetaMask target', () => {
      const result = normalizeTokenAddress(
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_POLYGON,
        TokenAddressTarget.MetaMask,
      );

      expect(result).toBe(POLYGON_NATIVE_TOKEN);
    });

    it('returns original address for non-Polygon chains', () => {
      const result = normalizeTokenAddress(
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
        TokenAddressTarget.MetaMask,
      );

      expect(result).toBe(NATIVE_TOKEN_ADDRESS);
    });

    it('returns original address for non-native Polygon token', () => {
      const result = normalizeTokenAddress(
        POLYGON_USDCE_ADDRESS,
        CHAIN_ID_POLYGON,
        TokenAddressTarget.Relay,
      );

      expect(result).toBe(POLYGON_USDCE_ADDRESS);
    });
  });

  describe('getLiveTokenBalance', () => {
    it('returns ERC-20 balance via eth_call', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x4C4B40');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('5000000');
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        NETWORK_CLIENT_ID_MOCK,
      );
      expect(PROVIDER_MOCK.request).toHaveBeenCalledWith({
        method: 'eth_call',
        params: [
          {
            to: ERC20_ADDRESS_MOCK,
            data: new Interface(abiERC20).encodeFunctionData('balanceOf', [
              ACCOUNT_MOCK,
            ]),
          },
          'pending',
        ],
      });
    });

    it('returns native balance via eth_getBalance', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0xde0b6b3a7640000');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('1000000000000000000');
      expect(PROVIDER_MOCK.request).toHaveBeenCalledWith({
        method: 'eth_getBalance',
        params: [ACCOUNT_MOCK, 'pending'],
      });
    });

    it('returns native balance for polygon native address', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x1bc16d674ec80000');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        '0x89' as Hex,
        '0x0000000000000000000000000000000000001010' as Hex,
      );

      expect(result).toBe('2000000000000000000');
      expect(PROVIDER_MOCK.request).toHaveBeenCalledWith({
        method: 'eth_getBalance',
        params: [ACCOUNT_MOCK, 'pending'],
      });
    });

    it('treats native address comparison as case-insensitive', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x1f4');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS.toUpperCase() as Hex,
      );

      expect(result).toBe('500');
      expect(PROVIDER_MOCK.request).toHaveBeenCalledWith({
        method: 'eth_getBalance',
        params: [ACCOUNT_MOCK, 'pending'],
      });
    });

    it('uses Infura network client when Infura endpoint is available', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x895440');

      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('9000000');
      expect(getNetworkConfigurationByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        INFURA_NETWORK_CLIENT_ID_MOCK,
      );
      expect(findNetworkClientIdByChainIdMock).not.toHaveBeenCalled();
    });

    it('falls back to default network client when no Infura endpoint is configured', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x6ACFC0');

      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Custom,
            networkClientId: 'custom-rpc-id',
          },
        ],
      } as NetworkConfiguration);

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('7000000');
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('falls back to default network client when getNetworkConfigurationByChainId throws', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x2DC6C0');

      getNetworkConfigurationByChainIdMock.mockImplementation(() => {
        throw new Error('Network configuration not found');
      });

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('3000000');
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('skips Infura when chain is in excludeChainIdsFromInfura flag', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x4C4B40');

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: [CHAIN_ID_MOCK],
          },
        },
      });

      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('5000000');
      expect(getNetworkConfigurationByChainIdMock).not.toHaveBeenCalled();
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('uses Infura when chain is not in excludeChainIdsFromInfura flag', async () => {
      PROVIDER_MOCK.request.mockResolvedValue('0x895440');

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_extended: {
            excludeChainIdsFromInfura: ['0x89' as Hex],
          },
        },
      });

      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('9000000');
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        INFURA_NETWORK_CLIENT_ID_MOCK,
      );
      expect(findNetworkClientIdByChainIdMock).not.toHaveBeenCalled();
    });
  });

  describe('computeTokenAmounts', () => {
    it('computes amount fields from raw value, decimals, and fiat rates', () => {
      const result = computeTokenAmounts('1230000', 6, {
        usdRate: '3.0',
        fiatRate: '2.0',
      });

      expect(result).toStrictEqual({
        raw: '1230000',
        human: '1.23',
        usd: '3.69',
        fiat: '2.46',
      });
    });

    it('handles zero balance', () => {
      const result = computeTokenAmounts('0', 18, {
        usdRate: '2000',
        fiatRate: '1500',
      });

      expect(result).toStrictEqual({
        raw: '0',
        human: '0',
        usd: '0',
        fiat: '0',
      });
    });

    it('accepts BigNumber.Value input types', () => {
      const result = computeTokenAmounts('0x12d687', 6, {
        usdRate: '1.0',
        fiatRate: '0.85',
      });

      expect(result).toStrictEqual({
        raw: '1234567',
        human: '1.234567',
        usd: '1.234567',
        fiat: '1.04938195',
      });
    });
  });

  describe('computeRawFromFiatAmount', () => {
    it('converts fiat amount to raw token amount', () => {
      // fiat=10, decimals=6, usdRate=2 => human=5, raw=5000000
      const result = computeRawFromFiatAmount('10', 6, '2');
      expect(result).toBe('5000000');
    });

    it('handles 18-decimal tokens', () => {
      // fiat=10, decimals=18, usdRate=2 => human=5, raw=5e18
      const result = computeRawFromFiatAmount('10', 18, '2');
      expect(result).toBe('5000000000000000000');
    });

    it('rounds down to nearest integer', () => {
      // fiat=1, decimals=6, usdRate=3 => human=0.333..., raw=333333
      const result = computeRawFromFiatAmount('1', 6, '3');
      expect(result).toBe('333333');
    });

    it('returns undefined for zero usdRate', () => {
      const result = computeRawFromFiatAmount('10', 6, '0');
      expect(result).toBeUndefined();
    });

    it('returns undefined for negative usdRate', () => {
      const result = computeRawFromFiatAmount('10', 6, '-1');
      expect(result).toBeUndefined();
    });

    it('returns undefined for zero fiat amount', () => {
      const result = computeRawFromFiatAmount('0', 6, '2');
      expect(result).toBeUndefined();
    });

    it('returns undefined for negative fiat amount', () => {
      const result = computeRawFromFiatAmount('-5', 6, '2');
      expect(result).toBeUndefined();
    });

    it('returns undefined when raw rounds down to zero', () => {
      // Very small fiat amount with low decimals
      const result = computeRawFromFiatAmount('0.0000001', 0, '1');
      expect(result).toBeUndefined();
    });
  });

  describe('isSameToken', () => {
    it('returns true for same address and chain', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };

      expect(isSameToken(token1, token2)).toBe(true);
    });

    it('returns true for same address with different case', () => {
      const token1 = {
        address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
        chainId: CHAIN_ID_MOCK,
      };
      const token2 = {
        address: TOKEN_ADDRESS_MOCK.toUpperCase() as Hex,
        chainId: CHAIN_ID_MOCK,
      };

      expect(isSameToken(token1, token2)).toBe(true);
    });

    it('returns false for different addresses', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_2_MOCK, chainId: CHAIN_ID_MOCK };

      expect(isSameToken(token1, token2)).toBe(false);
    });

    it('returns false for different chains', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_MOCK, chainId: '0x89' as Hex };

      expect(isSameToken(token1, token2)).toBe(false);
    });

    it('returns false for different address and chain', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_2_MOCK, chainId: '0x89' as Hex };

      expect(isSameToken(token1, token2)).toBe(false);
    });
  });

  describe('buildCaipAssetType', () => {
    it('returns slip44 asset type for native token on mainnet', () => {
      expect(buildCaipAssetType('0x1' as Hex, NATIVE_TOKEN_ADDRESS)).toBe(
        'eip155:1/slip44:60',
      );
    });

    it('returns slip44 asset type for Polygon native token with auto-mapped coin type', () => {
      const polygonNative = '0x0000000000000000000000000000000000001010' as Hex;

      expect(buildCaipAssetType('0x89' as Hex, polygonNative)).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns slip44 asset type with explicit coin type override', () => {
      const polygonNative = '0x0000000000000000000000000000000000001010' as Hex;

      expect(buildCaipAssetType('0x89' as Hex, polygonNative, 966)).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns erc20 asset type for ERC-20 token', () => {
      const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;

      expect(buildCaipAssetType('0x1' as Hex, usdcAddress)).toBe(
        `eip155:1/erc20:${usdcAddress}`,
      );
    });

    it('defaults slip44CoinType to 60 for native tokens', () => {
      expect(buildCaipAssetType('0xa4b1' as Hex, NATIVE_TOKEN_ADDRESS)).toBe(
        'eip155:42161/slip44:60',
      );
    });
  });
});
