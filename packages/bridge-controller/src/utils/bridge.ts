import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { BtcScope, SolScope, TrxScope } from '@metamask/keyring-api';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { isCaipChainId, isStrictHexString } from '@metamask/utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';

import {
  formatChainIdToCaip,
  formatChainIdToDec,
  formatChainIdToHex,
} from './caip-formatters';
import {
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  ETH_USDT_ADDRESS,
  METABRIDGE_ETHEREUM_ADDRESS,
} from '../constants/bridge';
import { CHAIN_IDS } from '../constants/chains';
import { SWAPS_CONTRACT_ADDRESSES } from '../constants/swaps';
import {
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
  SYMBOL_TO_SLIP44_MAP,
} from '../constants/tokens';
import type { SupportedSwapsNativeCurrencySymbols } from '../constants/tokens';
import type {
  BridgeAsset,
  BridgeControllerState,
  GenericQuoteRequest,
  QuoteResponse,
  TxData,
} from '../types';
import { ChainId } from '../types';

/**
 * Checks whether the transaction is a cross-chain transaction by comparing the source and destination chainIds
 *
 * @param srcChainId - The source chainId
 * @param destChainId - The destination chainId
 * @returns Whether the transaction is a cross-chain transaction
 */
export const isCrossChain = (
  srcChainId: GenericQuoteRequest['srcChainId'],
  destChainId?: GenericQuoteRequest['destChainId'],
) => {
  try {
    if (!destChainId) {
      return false;
    }
    return formatChainIdToCaip(srcChainId) !== formatChainIdToCaip(destChainId);
  } catch {
    return false;
  }
};

export const getDefaultBridgeControllerState = (): BridgeControllerState => {
  return DEFAULT_BRIDGE_CONTROLLER_STATE;
};

/**
 * Returns the native assetType for a given chainId and native currency symbol
 * Note that the return value is used as the assetId although it is a CaipAssetType
 *
 * @param chainId - The chainId to get the native assetType for
 * @param nativeCurrencySymbol - The native currency symbol for the given chainId
 * @returns The native assetType for the given chainId
 */
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
 * @throws If no native asset is defined for the given chainId
 */
export const getNativeAssetForChainId = (
  chainId: string | number | Hex | CaipChainId,
): BridgeAsset => {
  const chainIdInCaip = formatChainIdToCaip(chainId);
  const nativeToken =
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      formatChainIdToCaip(
        chainId,
      ) as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ] ??
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      formatChainIdToHex(
        chainId,
      ) as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ];

  if (!nativeToken) {
    throw new Error(
      `No XChain Swaps native asset found for chainId: ${chainId}`,
    );
  }

  return {
    ...nativeToken,
    chainId: formatChainIdToDec(chainId),
    assetId: getNativeAssetCaipAssetType(chainIdInCaip, nativeToken.symbol),
  };
};

/**
 * A function to return the txParam data for setting allowance to 0 for USDT on Ethereum
 *
 * @param destChainId - The destination chain ID
 * @returns The txParam data that will reset allowance to 0, combine it with the approval tx params received from Bridge API
 */
export const getEthUsdtResetData = (
  destChainId: GenericQuoteRequest['destChainId'],
) => {
  const spenderAddress = isCrossChain(CHAIN_IDS.MAINNET, destChainId)
    ? METABRIDGE_ETHEREUM_ADDRESS
    : SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
  const UsdtContractInterface = new Contract(ETH_USDT_ADDRESS, abiERC20)
    .interface;
  const data = UsdtContractInterface.encodeFunctionData('approve', [
    spenderAddress,
    '0',
  ]);

  return data;
};

export const isEthUsdt = (
  chainId: GenericQuoteRequest['srcChainId'],
  address: string,
) =>
  formatChainIdToDec(chainId) === ChainId.ETH &&
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
  (!isStrictHexString(address) &&
    Object.values(SYMBOL_TO_SLIP44_MAP).some(
      // check if it matches any supported SLIP44 references
      (reference) => address.includes(reference) || reference.endsWith(address),
    ));

const SOLANA_MAINNET_CHAIN_ID_STRING = SolScope.Mainnet.toString();
const SOLANA_CHAIN_ID_STRING = ChainId.SOLANA.toString();
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
    return chainId === SOLANA_MAINNET_CHAIN_ID_STRING;
  }
  return chainId.toString() === SOLANA_CHAIN_ID_STRING;
};

const BITCOIN_MAINNET_CHAIN_ID_STRING = BtcScope.Mainnet.toString();
const BITCOIN_CHAIN_ID_STRING = ChainId.BTC.toString();

export const isBitcoinChainId = (
  chainId: Hex | number | CaipChainId | string,
) => {
  if (isCaipChainId(chainId)) {
    return chainId === BITCOIN_MAINNET_CHAIN_ID_STRING;
  }
  return chainId.toString() === BITCOIN_CHAIN_ID_STRING;
};

const TRON_MAINNET_CHAIN_ID_STRING = TrxScope.Mainnet.toString();
const TRON_CHAIN_ID_STRING = ChainId.TRON.toString();

export const isTronChainId = (chainId: Hex | number | CaipChainId | string) => {
  if (isCaipChainId(chainId)) {
    return chainId === TRON_MAINNET_CHAIN_ID_STRING;
  }
  return chainId.toString() === TRON_CHAIN_ID_STRING;
};

/**
 * Checks if a chain ID represents a non-EVM blockchain supported by swaps
 * Currently supports Solana, Bitcoin and Tron
 *
 * @param chainId - The chain ID to check
 * @returns True if the chain is a supported non-EVM chain, false otherwise
 */
export const isNonEvmChainId = (
  chainId: GenericQuoteRequest['srcChainId'],
): boolean => {
  return (
    isSolanaChainId(chainId) ||
    isBitcoinChainId(chainId) ||
    isTronChainId(chainId)
  );
};

export const isEvmQuoteResponse = (
  quoteResponse: QuoteResponse,
): quoteResponse is QuoteResponse<TxData, TxData> => {
  return !isNonEvmChainId(quoteResponse.quote.srcChainId);
};
