import { getAddress } from '@ethersproject/address';
import { AddressZero } from '@ethersproject/constants';
import { convertHexToDecimal } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import {
  type Hex,
  type CaipChainId,
  isCaipChainId,
  isStrictHexString,
  parseCaipChainId,
  isCaipReference,
  numberToHex,
} from '@metamask/utils';

import { ChainId } from '../types';

// Returns true if the address looka like a native asset
export const isNativeAddress = (address?: string | null) =>
  address === AddressZero ||
  address === '' ||
  !address ||
  [`${SolScope.Mainnet}/slip44:501`].some(
    (assetId) => assetId.includes(address) && !isStrictHexString(address),
  );

// Converts a chainId to a CaipChainId
export const formatChainIdToCaip = (
  chainId: Hex | number | CaipChainId | string,
): CaipChainId => {
  if (isCaipChainId(chainId)) {
    return chainId;
  } else if (isStrictHexString(chainId)) {
    return toEvmCaipChainId(chainId);
  }
  const chainIdString = chainId.toString();
  if (chainIdString === ChainId.SOLANA.toString()) {
    return SolScope.Mainnet;
  }
  return toEvmCaipChainId(numberToHex(Number(chainIdString)));
};

// Converts a chainId to a decimal number that can be used for bridge-api requests
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

// Converts a chainId to a hex string used to read controller data within the app
// Hex chainIds are also used for fetching exchange rates
export const formatChainIdToHex = (
  chainId: Hex | CaipChainId | string | number,
) => {
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

// Converts an asset or account address to a string that can be used for bridge-api requests
export const formatAddressToString = (address: string) => {
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

export const formatChainIdToHexOrCaip = (chainId: number) => {
  if (chainId === ChainId.SOLANA) {
    return SolScope.Mainnet;
  }
  return formatChainIdToHex(chainId);
};
