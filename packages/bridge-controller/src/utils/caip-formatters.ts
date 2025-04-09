import { getAddress } from '@ethersproject/address';
import { AddressZero } from '@ethersproject/constants';
import { convertHexToDecimal } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type { CaipAssetType } from '@metamask/utils';
import {
  type Hex,
  type CaipChainId,
  isCaipChainId,
  isStrictHexString,
  parseCaipChainId,
  isCaipReference,
  numberToHex,
  isCaipAssetType,
  CaipAssetTypeStruct,
} from '@metamask/utils';

import {
  getNativeAssetForChainId,
  isNativeAddress,
  isSolanaChainId,
} from './bridge';
import type { GenericQuoteRequest } from '../types';
import { ChainId } from '../types';

/**
 * Converts a chainId to a CaipChainId
 *
 * @param chainId - The chainId to convert
 * @returns The CaipChainId
 */
export const formatChainIdToCaip = (
  chainId: Hex | number | CaipChainId | string,
): CaipChainId => {
  if (isCaipChainId(chainId)) {
    return chainId;
  }
  if (isStrictHexString(chainId)) {
    return toEvmCaipChainId(chainId);
  }
  if (isSolanaChainId(chainId)) {
    return SolScope.Mainnet;
  }
  return toEvmCaipChainId(numberToHex(Number(chainId)));
};

/**
 * Converts a chainId to a decimal number that can be used for bridge-api requests
 *
 * @param chainId - The chainId to convert
 * @returns The decimal number
 */
export const formatChainIdToDec = (
  chainId: number | Hex | CaipChainId | string,
) => {
  if (isStrictHexString(chainId)) {
    return convertHexToDecimal(chainId);
  }
  if (chainId === SolScope.Mainnet) {
    return ChainId.SOLANA;
  }
  if (isCaipChainId(chainId)) {
    return Number(chainId.split(':').at(-1));
  }
  if (typeof chainId === 'string') {
    return parseInt(chainId, 10);
  }
  return chainId;
};

/**
 * Converts a chainId to a hex string used to read controller data within the app
 * Hex chainIds are also used for fetching exchange rates
 *
 * @param chainId - The chainId to convert
 * @returns The hex string
 */
export const formatChainIdToHex = (
  chainId: Hex | CaipChainId | string | number,
): Hex => {
  if (isStrictHexString(chainId)) {
    return chainId;
  }
  if (typeof chainId === 'number' || parseInt(chainId, 10)) {
    return numberToHex(Number(chainId));
  }
  if (isCaipChainId(chainId)) {
    const { reference } = parseCaipChainId(chainId);
    if (isCaipReference(reference) && !isNaN(Number(reference))) {
      return numberToHex(Number(reference));
    }
  }
  // Throw an error if a non-evm chainId is passed to this function
  // This should never happen, but it's a sanity check
  throw new Error(`Invalid cross-chain swaps chainId: ${chainId}`);
};

/**
 * Converts an asset or account address to a string that can be used for bridge-api requests
 *
 * @param address - The address to convert
 * @returns The converted address
 */
export const formatAddressToCaipReference = (address: string) => {
  if (isStrictHexString(address)) {
    return getAddress(address);
  }
  // If the address looks like a native token, return the zero address because it's
  // what bridge-api uses to represent a native asset
  if (isNativeAddress(address)) {
    return AddressZero;
  }
  const addressWithoutPrefix = address.split(':').at(-1);
  // If the address is not a valid hex string or CAIP address, throw an error
  // This should never happen, but it's a sanity check
  if (!addressWithoutPrefix) {
    throw new Error('Invalid address');
  }
  return addressWithoutPrefix;
};

/**
 * Converts an address or assetId to a CaipAssetType
 *
 * @param addressOrAssetId - The address or assetId to convert
 * @param chainId - The chainId of the asset
 * @returns The CaipAssetType
 */
export const formatAddressToAssetId = (
  addressOrAssetId: Hex | CaipAssetType | string,
  chainId: GenericQuoteRequest['srcChainId'],
): CaipAssetType | undefined => {
  if (isCaipAssetType(addressOrAssetId)) {
    return addressOrAssetId;
  }
  if (isNativeAddress(addressOrAssetId)) {
    return getNativeAssetForChainId(chainId).assetId as CaipAssetType;
  }
  if (chainId === SolScope.Mainnet) {
    return CaipAssetTypeStruct.create(`${chainId}/token:${addressOrAssetId}`);
  }
  // EVM assets
  if (!isStrictHexString(addressOrAssetId)) {
    return undefined;
  }
  return CaipAssetTypeStruct.create(`${chainId}/erc20:${addressOrAssetId}`);
};
