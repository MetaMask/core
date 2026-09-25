import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { RpcEndpointType } from '@metamask/network-controller';
import type { NetworkConfiguration } from '@metamask/network-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { hexToBigInt } from '@metamask/utils';

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
const FROM_MOCK = '0x456' as Hex;
const ACCOUNT_ID_MOCK = 'account-id';
const NETWORK_CLIENT_ID_MOCK = '123-456';
const INFURA_NETWORK_CLIENT_ID_MOCK = 'mainnet';
const TICKER_MOCK = 'TST';
const SYMBOL_MOCK = 'TEST';
const ACCOUNT_MOCK = '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const ERC20_ADDRESS_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const PROVIDER_MOCK = { request: jest.fn() };

/**
 * Build a CAIP-19 asset ID for fixtures, mirroring how `AssetsController` keys
 * its state.
 *
 * @param chainId - Hex chain ID.
 * @param tokenAddress - Token address, or the native token address.
 * @param slip44CoinType - SLIP-44 coin type for native assets, defaulting to ETH.
 * @returns The CAIP-19 asset ID.
 */
function buildAssetId(
  chainId: Hex,
  tokenAddress: Hex,
  slip44CoinType = 60,
): CaipAssetType {
  const reference = String(hexToBigInt(chainId));
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  return isNative
    ? (`eip155:${reference}/slip44:${slip44CoinType}` as CaipAssetType)
    : (`eip155:${reference}/erc20:${tokenAddress}` as CaipAssetType);
}

describe('Token Utils', () => {
  const {
    messenger,
    getAccountsControllerStateMock,
    getAssetsControllerStateMock,
    getRemoteFeatureFlagControllerStateMock,
    getNetworkClientByIdMock,
    getNetworkConfigurationByChainIdMock,
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
    });
  });

  describe('getTokenInfo', () => {
    it('finds token info using a lowercase address', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: {
            decimals: DECIMALS_MOCK,
            name: SYMBOL_MOCK,
            symbol: SYMBOL_MOCK,
            type: 'erc20',
          },
        },
      });

      const result = getTokenInfo(
        messenger,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('skips non-matching assets when searching by lowercase address', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_2_MOCK)]: {
            decimals: 18,
            name: 'OTHER',
            symbol: 'OTHER',
            type: 'erc20',
          },
          [assetId]: {
            decimals: DECIMALS_MOCK,
            name: SYMBOL_MOCK,
            symbol: SYMBOL_MOCK,
            type: 'erc20',
          },
        },
      });

      const result = getTokenInfo(
        messenger,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns normalized decimals', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: {
            decimals: String(DECIMALS_MOCK),
            name: SYMBOL_MOCK,
            symbol: SYMBOL_MOCK,
            type: 'erc20',
          },
        },
      });

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns undefined if token is not found', () => {
      getAssetsControllerStateMock.mockReturnValue({ assetsInfo: {} });

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toBeUndefined();
    });

    it('returns native token info', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, NATIVE_TOKEN_ADDRESS);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: {
            decimals: 18,
            name: TICKER_MOCK,
            symbol: TICKER_MOCK,
            type: 'native',
          },
        },
      });

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

    it('supports non-standard native token address', () => {
      const nativeTokenAddress =
        '0x0000000000000000000000000000000000001010' as Hex;
      const assetId = buildAssetId(CHAIN_ID_POLYGON, nativeTokenAddress);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: {
            decimals: 18,
            name: TICKER_MOCK,
            symbol: TICKER_MOCK,
            type: 'native',
          },
        },
      });

      const result = getTokenInfo(
        messenger,
        nativeTokenAddress,
        CHAIN_ID_POLYGON,
      );

      expect(result).toStrictEqual({
        decimals: 18,
        symbol: TICKER_MOCK,
      });
    });

    it('returns undefined if native token is missing from assets info', () => {
      getAssetsControllerStateMock.mockReturnValue({ assetsInfo: {} });

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('does not consult the network controller for a missing native token', () => {
      getAssetsControllerStateMock.mockReturnValue({ assetsInfo: {} });

      getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, CHAIN_ID_MOCK);

      expect(getNetworkClientByIdMock).not.toHaveBeenCalled();
      expect(findNetworkClientIdByChainIdMock).not.toHaveBeenCalled();
    });

    it('resolves a native asset after missing metadata arrives', () => {
      getAssetsControllerStateMock.mockReturnValue({ assetsInfo: {} });
      expect(
        getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, '0x38'),
      ).toBeUndefined();
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          'eip155:56/slip44:714': {
            decimals: 18,
            symbol: 'BNB',
            type: 'native',
          },
        },
      });

      const result = getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, '0x38');

      expect(result).toStrictEqual({ decimals: 18, symbol: 'BNB' });
    });

    it('ignores same-chain non-native assets and other-chain natives', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [`eip155:${hexToBigInt(CHAIN_ID_MOCK)}/erc20:${TOKEN_ADDRESS_MOCK}`]:
            { decimals: 6, symbol: 'TST', type: 'erc20' },
          'eip155:137/slip44:966': {
            decimals: 18,
            symbol: 'POL',
            type: 'native',
          },
        },
      });

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('resolves native assets represented by an ERC-20 asset ID', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          'eip155:100/erc20:0x0000000000000000000000000000000000000000': {
            decimals: 18,
            symbol: 'XDAI',
            type: 'native',
          },
        },
      });

      const result = getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, '0x64');

      expect(result).toStrictEqual({ decimals: 18, symbol: 'XDAI' });
    });

    it('ignores assets belonging to another chain', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          'eip155:1/slip44:60': { decimals: 18, symbol: 'ETH', type: 'native' },
        },
      });

      expect(
        getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, '0x38'),
      ).toBeUndefined();
    });
  });

  describe('getTokenBalance', () => {
    beforeEach(() => {
      getAccountsControllerStateMock.mockReturnValue({
        accountIdByAddress: { [FROM_MOCK]: ACCOUNT_ID_MOCK },
        internalAccounts: { accounts: {}, selectedAccount: '' },
      });
    });

    it('returns zero when the native asset is absent from assets info', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: { [ACCOUNT_ID_MOCK]: {} },
        assetsInfo: {},
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('0');
    });

    it('finds a token balance using a lowercase address', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '291' },
          },
        },
        assetsInfo: {
          [assetId]: { decimals: 6, symbol: 'TST' },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('291000000');
    });

    it('converts the human-readable amount to raw base units', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '1.5' },
          },
        },
        assetsInfo: {
          [assetId]: { decimals: 6, symbol: 'TST' },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('1500000');
    });

    it('returns zero if the token decimals are unknown', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '291' },
          },
        },
        assetsInfo: {},
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('0');
    });

    it('finds a token balance when the account address is checksummed', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);
      const checksummedFrom =
        '0xAbC0000000000000000000000000000000000123' as Hex;

      getAccountsControllerStateMock.mockReturnValue({
        accountIdByAddress: {
          [checksummedFrom.toLowerCase()]: ACCOUNT_ID_MOCK,
        },
        internalAccounts: { accounts: {}, selectedAccount: '' },
      });

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '291' },
          },
        },
        assetsInfo: {
          [assetId]: { decimals: 6, symbol: 'TST' },
        },
      });

      const result = getTokenBalance(
        messenger,
        checksummedFrom,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('291000000');
    });

    it('reads a checksummed asset ID directly', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [`eip155:1/erc20:${TOKEN_ADDRESS_MOCK}`]: { amount: '291' },
          },
        },
        assetsInfo: {
          [`eip155:1/erc20:${TOKEN_ADDRESS_MOCK}`]: {
            decimals: 6,
            symbol: 'TST',
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('291000000');
    });

    it('returns native balance from AssetsController', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, NATIVE_TOKEN_ADDRESS);

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '291' },
          },
        },
        assetsInfo: {
          [assetId]: { decimals: 18, symbol: 'ETH', type: 'native' },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('291000000000000000000');
    });

    it('returns zero if the token is not found', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {},
        assetsInfo: {},
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('0');
    });

    it('returns zero if the account is not found', () => {
      getAccountsControllerStateMock.mockReturnValue({
        accountIdByAddress: {},
        internalAccounts: { accounts: {}, selectedAccount: '' },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('0');
      expect(getAssetsControllerStateMock).not.toHaveBeenCalled();
    });

    it('preserves base-unit precision for large fractional balances', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);
      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: {
            [assetId]: { amount: '9007199254740993.123456789012345678' },
          },
        },
        assetsInfo: { [assetId]: { decimals: 18, symbol: SYMBOL_MOCK } },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );

      expect(result).toBe('9007199254740993123456789012345678');
    });

    it('reads native BNB metadata and balance using its SLIP-44 ID', () => {
      const assetId = 'eip155:56/slip44:714';
      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: { [assetId]: { amount: '1.5' } },
        },
        assetsInfo: {
          [assetId]: { decimals: 18, symbol: 'BNB', type: 'native' },
        },
      });

      const info = getTokenInfo(messenger, NATIVE_TOKEN_ADDRESS, '0x38');
      const balance = getTokenBalance(
        messenger,
        FROM_MOCK,
        '0x38',
        NATIVE_TOKEN_ADDRESS,
      );

      expect(info).toStrictEqual({ decimals: 18, symbol: 'BNB' });
      expect(balance).toBe('1500000000000000000');
    });

    it('returns zero for a native token if the chain has no native metadata', () => {
      const erc20AssetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsBalance: {
          [ACCOUNT_ID_MOCK]: { [erc20AssetId]: { amount: '1' } },
        },
        assetsInfo: {
          [erc20AssetId]: { decimals: 18, symbol: SYMBOL_MOCK, type: 'erc20' },
        },
      });

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
    it('returns undefined when the native asset is absent from assets info', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {},
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('finds fiat rates using a lowercase address', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: {
            decimals: DECIMALS_MOCK,
            symbol: SYMBOL_MOCK,
            type: 'erc20',
          },
        },
        assetsPrice: {
          [assetId]: {
            assetPriceType: 'fungible',
            lastUpdated: 0,
            price: 6,
            usdPrice: 8,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '6',
        usdRate: '8',
      });
    });

    it('returns undefined if no price', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {},
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined for a non-fungible asset price', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, TOKEN_ADDRESS_MOCK);
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {
          [assetId]: {
            assetPriceType: 'nft',
            lastUpdated: 0,
            price: 6,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns native rate if native token', () => {
      const assetId = buildAssetId(CHAIN_ID_MOCK, NATIVE_TOKEN_ADDRESS);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          [assetId]: { decimals: 18, symbol: 'ETH', type: 'native' },
        },
        assetsPrice: {
          [assetId]: {
            assetPriceType: 'fungible',
            lastUpdated: 0,
            price: 3,
            usdPrice: 4,
          },
        },
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
      const assetId = buildAssetId(CHAIN_ID_POLYGON, POLYGON_USDCE_ADDRESS);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {
          [assetId]: {
            assetPriceType: 'fungible',
            lastUpdated: 0,
            price: 3,
            usdPrice: 4,
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

    it('returns undefined for stablecoins with no price in the selected currency', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {},
        selectedCurrency: 'eur',
      });

      const result = getTokenFiatRate(
        messenger,
        POLYGON_USDCE_ADDRESS,
        CHAIN_ID_POLYGON,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined for stablecoins with a non-fungible price entry', () => {
      const assetId = buildAssetId(CHAIN_ID_POLYGON, POLYGON_USDCE_ADDRESS);

      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {
          [assetId]: {
            assetPriceType: 'nft',
            lastUpdated: 0,
            price: 3,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        POLYGON_USDCE_ADDRESS,
        CHAIN_ID_POLYGON,
      );

      expect(result).toBeUndefined();
    });

    it('reads native AVAX rates using its SLIP-44 ID', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          'eip155:43114/slip44:9005': {
            decimals: 18,
            symbol: 'AVAX',
            type: 'native',
          },
        },
        assetsPrice: {
          'eip155:43114/slip44:9005': {
            assetPriceType: 'fungible',
            lastUpdated: 0,
            price: 20,
            usdPrice: 25,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        '0xa86a',
      );

      expect(result).toStrictEqual({ fiatRate: '20', usdRate: '25' });
    });

    it('uses native asset metadata for custom networks', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {
          'eip155:12345/slip44:123': {
            decimals: 18,
            symbol: 'CUSTOM',
            type: 'native',
          },
        },
        assetsPrice: {
          'eip155:12345/slip44:123': {
            assetPriceType: 'fungible',
            lastUpdated: 0,
            price: 2,
            usdPrice: 3,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        '0x3039',
      );

      expect(result).toStrictEqual({ fiatRate: '2', usdRate: '3' });
    });

    it('returns undefined for native rates on an unknown network', () => {
      getAssetsControllerStateMock.mockReturnValue({
        assetsInfo: {},
        assetsPrice: {},
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        '0x3039',
      );

      expect(result).toBeUndefined();
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
        '0x89',
        '0x0000000000000000000000000000000000001010',
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
      });

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
      });

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
      });

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
      });

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

    it('falls back to latest block when pending native balance query throws', async () => {
      PROVIDER_MOCK.request
        .mockRejectedValueOnce(new Error('pending not supported'))
        .mockResolvedValueOnce('0xde0b6b3a7640000');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('1000000000000000000');
      expect(PROVIDER_MOCK.request).toHaveBeenNthCalledWith(1, {
        method: 'eth_getBalance',
        params: [ACCOUNT_MOCK, 'pending'],
      });
      expect(PROVIDER_MOCK.request).toHaveBeenNthCalledWith(2, {
        method: 'eth_getBalance',
        params: [ACCOUNT_MOCK, 'latest'],
      });
    });

    it('falls back to latest block when pending ERC-20 balance query throws', async () => {
      PROVIDER_MOCK.request
        .mockRejectedValueOnce(new Error('pending not supported'))
        .mockResolvedValueOnce('0x4C4B40');

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('5000000');

      const calldata = new Interface(abiERC20).encodeFunctionData('balanceOf', [
        ACCOUNT_MOCK,
      ]);

      expect(PROVIDER_MOCK.request).toHaveBeenNthCalledWith(1, {
        method: 'eth_call',
        params: [{ to: ERC20_ADDRESS_MOCK, data: calldata }, 'pending'],
      });
      expect(PROVIDER_MOCK.request).toHaveBeenNthCalledWith(2, {
        method: 'eth_call',
        params: [{ to: ERC20_ADDRESS_MOCK, data: calldata }, 'latest'],
      });
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
      expect(buildCaipAssetType('0x1', NATIVE_TOKEN_ADDRESS)).toBe(
        'eip155:1/slip44:60',
      );
    });

    it('returns slip44 asset type for Polygon native token with auto-mapped coin type', () => {
      const polygonNative = '0x0000000000000000000000000000000000001010' as Hex;

      expect(buildCaipAssetType('0x89', polygonNative)).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns slip44 asset type with explicit coin type override', () => {
      const polygonNative = '0x0000000000000000000000000000000000001010' as Hex;

      expect(buildCaipAssetType('0x89', polygonNative, 966)).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns erc20 asset type for ERC-20 token', () => {
      const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;

      expect(buildCaipAssetType('0x1', usdcAddress)).toBe(
        `eip155:1/erc20:${usdcAddress}`,
      );
    });

    it('defaults slip44CoinType to 60 for native tokens', () => {
      expect(buildCaipAssetType('0xa4b1', NATIVE_TOKEN_ADDRESS)).toBe(
        'eip155:42161/slip44:60',
      );
    });
  });
});
