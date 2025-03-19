import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { SolScope } from '@metamask/keyring-api';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { isCaipChainId, isStrictHexString, type Hex } from '@metamask/utils';

import { formatChainIdToCaip, formatChainIdToDec } from './caip-formatters';
import {
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  ETH_USDT_ADDRESS,
  METABRIDGE_ETHEREUM_ADDRESS,
} from '../constants/bridge';
import { CHAIN_IDS } from '../constants/chains';
import {
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
  SYMBOL_TO_SLIP44_MAP,
  type SupportedSwapsNativeCurrencySymbols,
} from '../constants/tokens';
import type { BridgeAsset, BridgeControllerState } from '../types';
import { ChainId } from '../types';

export const getDefaultBridgeControllerState = (): BridgeControllerState => {
  return DEFAULT_BRIDGE_CONTROLLER_STATE;
};

const getNativeAssetCaipAssetType = (
  chainId: CaipChainId,
  nativeCurrencySymbol: SupportedSwapsNativeCurrencySymbols,
): CaipAssetType => {
  return `${formatChainIdToCaip(chainId)}/${SYMBOL_TO_SLIP44_MAP[nativeCurrencySymbol]}`;
};

/**
 * Returns the native swaps or bridge asset for a given chainId
 *
 * @param chainId - The chainId to get the default token for
 * @returns The native asset for the given chainId
 */
export const getNativeAssetForChainId = (
  chainId: string | number | Hex | CaipChainId,
): BridgeAsset => {
  const chainIdInCaip = formatChainIdToCaip(chainId);
  const nativeToken = SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainIdInCaip];
  return {
    ...nativeToken,
    chainId: formatChainIdToDec(chainId),
    assetId: getNativeAssetCaipAssetType(chainIdInCaip, nativeToken.symbol),
  };
};

/**
 * A function to return the txParam data for setting allowance to 0 for USDT on Ethereum
 *
 * @returns The txParam data that will reset allowance to 0, combine it with the approval tx params received from Bridge API
 */
export const getEthUsdtResetData = () => {
  const UsdtContractInterface = new Contract(ETH_USDT_ADDRESS, abiERC20)
    .interface;
  const data = UsdtContractInterface.encodeFunctionData('approve', [
    METABRIDGE_ETHEREUM_ADDRESS,
    '0',
  ]);

  return data;
};

export const isEthUsdt = (chainId: Hex, address: string) =>
  chainId === CHAIN_IDS.MAINNET &&
  address.toLowerCase() === ETH_USDT_ADDRESS.toLowerCase();

export const sumHexes = (...hexStrings: string[]): Hex => {
  if (hexStrings.length === 0) {
    return '0x0';
  }

  const sum = hexStrings.reduce((acc, hex) => acc + BigInt(hex), BigInt(0));
  return `0x${sum.toString(16)}`;
};

/**
 * Checks whether the provided address is strictly equal to the address for
 * the default swaps token of the provided chain.
 *
 * @param address - The string to compare to the default token address
 * @param chainId - The hex encoded chain ID of the default swaps token to check
 * @returns Whether the address is the provided chain's default token address
 */
export const isSwapsDefaultTokenAddress = (
  address: string,
  chainId: Hex | CaipChainId,
) => {
  if (!address || !chainId) {
    return false;
  }

  return address === getNativeAssetForChainId(chainId)?.address;
};

/**
 * Checks whether the provided symbol is strictly equal to the symbol for
 * the default swaps token of the provided chain.
 *
 * @param symbol - The string to compare to the default token symbol
 * @param chainId - The hex encoded chain ID of the default swaps token to check
 * @returns Whether the symbol is the provided chain's default token symbol
 */
export const isSwapsDefaultTokenSymbol = (
  symbol: string,
  chainId: Hex | CaipChainId,
) => {
  if (!symbol || !chainId) {
    return false;
  }

  return symbol === getNativeAssetForChainId(chainId)?.symbol;
};

/**
 * Checks whether the address is a native asset in any supported xchain swaps network
 *
 * @param address - The address to check
 * @returns Whether the address is a native asset
 */
export const isNativeAddress = (address?: string | null) =>
  address === AddressZero || // bridge and swap apis set the native asset address to zero
  address === '' || // assets controllers set the native asset address to an empty string
  !address ||
  address.endsWith('11111111111111111111111111111111') || // token-api and bridge-api use this as the solana native assetId
  [getNativeAssetForChainId(ChainId.SOLANA).assetId].some(
    (assetId) => assetId.includes(address) && !isStrictHexString(address),
  ); // solana native assetId used in the extension client

/**
 * Checks whether the chainId matches Solana in CaipChainId or number format
 *
 * @param chainId - The chainId to check
 * @returns Whether the chainId is Solana
 */
export const isSolanaChainId = (
  chainId: Hex | number | CaipChainId | string,
) => {
  if (isCaipChainId(chainId)) {
    return chainId === SolScope.Mainnet.toString();
  }
  return chainId.toString() === ChainId.SOLANA.toString();
};
