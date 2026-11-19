import { toChecksumHexAddress } from '@metamask/controller-utils';
// @ts-expect-error: No type definitions for '@metamask/slip44'
import slip44data from '@metamask/slip44';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import {
  isCaipAssetType,
  isStrictHexString,
  KnownCaipNamespace,
  parseCaipChainId,
  toCaipAssetType,
} from '@metamask/utils';
import { getChainById } from 'eth-chainlist';

import { nativeTokenAddress, nativeTokenDecimals } from '../constants.js';

const slip44BySymbol = ((): Map<string, string> => {
  const coinTypeBySymbol = new Map<string, string>();

  for (const [coinType, entry] of Object.entries(
    slip44data as Record<string, { symbol: string }>,
  )) {
    const normalizedSymbol = entry.symbol.toUpperCase();

    if (!coinTypeBySymbol.has(normalizedSymbol)) {
      coinTypeBySymbol.set(normalizedSymbol, coinType);
    }
  }

  return coinTypeBySymbol;
})();

function getCoinType(symbol: string): string | undefined {
  const normalizedSymbol = symbol.toUpperCase();
  return (
    slip44BySymbol.get(normalizedSymbol) ??
    (normalizedSymbol === 'POL' ? slip44BySymbol.get('MATIC') : undefined)
  );
}

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

  if (chainId === '') {
    return undefined;
  }

  const reference = Number(chainId);
  return Number.isNaN(reference) ? undefined : `eip155:${reference}`;
}

export function resolveNativeAssetId(
  chainId: string | number | undefined,
  symbol: string | undefined,
): CaipAssetType | undefined {
  if (chainId === undefined) {
    return undefined;
  }

  const caipChainId = formatChainIdToCaip(chainId);

  if (!caipChainId) {
    return undefined;
  }

  const { namespace, reference } = parseCaipChainId(caipChainId);
  const assetReference = symbol ? getCoinType(symbol) : undefined;

  if (assetReference) {
    return toCaipAssetType(namespace, reference, 'slip44', assetReference);
  }

  if (namespace === KnownCaipNamespace.Eip155) {
    return (
      getNativeAsset(caipChainId)?.assetId ??
      toCaipAssetType(namespace, reference, 'erc20', nativeTokenAddress)
    );
  }

  return undefined;
}

/**
 * Resolves EVM native symbol, decimals, and CAIP asset id for a chain.
 * Prefers eth-chainlist slip44 except testnet coin type 1, then falls back to
 * `@metamask/slip44` by native symbol.
 *
 * @param chainId - CAIP-2 chain id (eip155 only).
 * @returns Native asset metadata, or undefined when it cannot be resolved.
 */
export function getNativeAsset(chainId: CaipChainId):
  | {
      symbol: string;
      decimals: number;
      assetId: CaipAssetType;
    }
  | undefined {
  const { namespace, reference } = parseCaipChainId(chainId);
  if (namespace !== KnownCaipNamespace.Eip155) {
    return undefined;
  }

  const chain = getChainById(Number(reference));
  if (!chain) {
    return undefined;
  }

  const { nativeCurrency, slip44 } = chain;
  if (!nativeCurrency?.symbol) {
    return undefined;
  }

  const slip44TestnetCoinType = 1;
  const assetReference =
    typeof slip44 === 'number' && slip44 !== slip44TestnetCoinType
      ? String(slip44)
      : getCoinType(nativeCurrency.symbol);

  const assetId = assetReference
    ? toCaipAssetType(namespace, reference, 'slip44', assetReference)
    : toCaipAssetType(namespace, reference, 'erc20', nativeTokenAddress);

  return {
    symbol: nativeCurrency.symbol,
    decimals: nativeCurrency.decimals ?? nativeTokenDecimals,
    assetId,
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
    return undefined;
  }

  const checksummedAddress = toChecksumHexAddress(address);

  if (!isStrictHexString(checksummedAddress)) {
    return undefined;
  }

  const { namespace, reference } = parseCaipChainId(caipChainId);

  return toCaipAssetType(namespace, reference, 'erc20', checksummedAddress);
}
