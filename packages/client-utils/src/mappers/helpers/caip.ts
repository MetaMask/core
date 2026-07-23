import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import {
  isCaipAssetType,
  isStrictHexString,
  parseCaipChainId,
  toCaipAssetType,
} from '@metamask/utils';

import { nativeTokenAddress } from '../constants.js';

export type NativeAssetMetadata = {
  symbol: string;
  decimals: number;
  assetId: CaipChainId | string;
};

type NativeAssetEntry = {
  symbol: string;
  decimals: number;
  slip44: number;
};

const nativeAssetsByCaipChainId: Record<string, NativeAssetEntry> = {
  'eip155:1': { symbol: 'ETH', decimals: 18, slip44: 60 },
  'eip155:10': { symbol: 'ETH', decimals: 18, slip44: 60 },
  'eip155:56': { symbol: 'BNB', decimals: 18, slip44: 714 },
  'eip155:137': { symbol: 'POL', decimals: 18, slip44: 966 },
  'eip155:324': { symbol: 'ETH', decimals: 18, slip44: 60 },
  'eip155:1329': { symbol: 'SEI', decimals: 18, slip44: 19000118 },
  'eip155:8453': { symbol: 'ETH', decimals: 18, slip44: 60 },
  'eip155:42161': { symbol: 'ETH', decimals: 18, slip44: 60 },
  'eip155:43114': { symbol: 'AVAX', decimals: 18, slip44: 9005 },
  'eip155:59144': { symbol: 'ETH', decimals: 18, slip44: 60 },
};

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

  const reference = Number(chainId);
  return Number.isNaN(reference) ? undefined : `eip155:${reference}`;
}

/**
 * Looks up the native asset metadata for a chain from the canonical table.
 * Returns `undefined` (never throws) for chains outside the table — callers
 * degrade gracefully, matching the previous bridge-controller behaviour.
 *
 * @param chainId - Hex, numeric, decimal, or CAIP chain id.
 * @returns Native asset symbol/decimals/assetId, or `undefined` if unsupported.
 */
export function getNativeAsset(
  chainId: string | number,
): NativeAssetMetadata | undefined {
  const caipChainId = formatChainIdToCaip(chainId);

  if (!caipChainId) {
    return undefined;
  }

  const entry = nativeAssetsByCaipChainId[caipChainId];

  if (!entry) {
    return undefined;
  }

  return {
    symbol: entry.symbol,
    decimals: entry.decimals,
    assetId: `${caipChainId}/slip44:${entry.slip44}`,
  };
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
    const nativeAssetId = getNativeAsset(caipChainId)?.assetId;

    if (nativeAssetId) {
      return nativeAssetId as CaipAssetType;
    }
  }

  const checksummedAddress = toChecksumHexAddress(address);

  if (!isStrictHexString(checksummedAddress)) {
    return undefined;
  }

  const { namespace, reference } = parseCaipChainId(caipChainId);

  return toCaipAssetType(namespace, reference, 'erc20', checksummedAddress);
}
