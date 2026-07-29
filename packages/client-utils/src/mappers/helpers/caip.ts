import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import {
  isCaipAssetType,
  isStrictHexString,
  parseCaipChainId,
  toCaipAssetType,
} from '@metamask/utils';

import { nativeTokenAddress } from '../constants.js';

/**
 * Normalizes a hex, decimal, numeric, or CAIP chain id to its CAIP-2 form.
 * Only EVM (eip155) chains are normalized here; CAIP ids are returned as-is.
 *
 * @param chainId - Hex (`0x1`), numeric, decimal string, or CAIP chain id.
 * @returns The CAIP-2 chain id, or `undefined` when it can't be normalized.
 */
export function formatChainIdToCaip(
  chainId: string | number,
): CaipChainId | undefined {
  if (typeof chainId === 'number') {
    return `eip155:${chainId}`;
  }

  if (chainId.includes(':')) {
    return chainId as CaipChainId;
  }

  if (chainId.startsWith('0x')) {
    const reference = Number.parseInt(chainId, 16);
    return Number.isNaN(reference) ? undefined : `eip155:${reference}`;
  }

  if (!chainId) {
    return undefined;
  }

  const reference = Number(chainId);
  return Number.isNaN(reference) ? undefined : `eip155:${reference}`;
}

function isNativeAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === nativeTokenAddress ||
    normalized === '0x0' ||
    /^0x0+$/u.test(normalized)
  );
}

/**
 * Encodes an EVM token address + chain id into a CAIP-19 asset id.
 *
 * @param address - Hex contract address, native sentinel, or CAIP asset id.
 * @param chainId - CAIP-2 or hex chain id.
 * @returns The CAIP-19 asset id, or `undefined` when it can't be encoded.
 */
export function formatAddressToAssetId(
  address: Hex | CaipAssetType | string,
  chainId?: CaipChainId | Hex,
): CaipAssetType | undefined {
  if (isCaipAssetType(address)) {
    return address;
  }

  const caipChainId = chainId ? formatChainIdToCaip(chainId) : undefined;

  if (!caipChainId) {
    return undefined;
  }

  if (isNativeAddress(address)) {
    return undefined;
  }

  const checksummedAddress = toChecksumHexAddress(address);

  if (!isStrictHexString(checksummedAddress)) {
    return undefined;
  }

  const { namespace, reference } = parseCaipChainId(caipChainId);

  return toCaipAssetType(namespace, reference, 'erc20', checksummedAddress);
}
