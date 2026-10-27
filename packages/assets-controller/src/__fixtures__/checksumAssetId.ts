import { toChecksumAddress } from '@ethereumjs/util';
import type { Json } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

/**
 * Checksum an EVM ERC-20 CAIP-19 asset ID. Other IDs are returned unchanged.
 *
 * Captured API bodies are keyed in lowercase. Mocks look captures up that way,
 * then put this ID on the response so it matches the checksummed IDs the
 * Accounts API, Tokens API, Price API, and websocket return.
 *
 * @param assetId - A CAIP-19 asset ID, any casing.
 * @returns The checksummed asset ID.
 */
export function checksumAssetId(assetId: string): string {
  const parsed = parseCaipAssetType(assetId);
  const chainIdParsed = parseCaipChainId(parsed.chainId);

  if (
    chainIdParsed.namespace === 'eip155' &&
    parsed.assetNamespace === 'erc20'
  ) {
    return `${parsed.chainId}/${parsed.assetNamespace}:${toChecksumAddress(
      parsed.assetReference,
    )}`;
  }

  return assetId;
}

/**
 * Copy a response row with its `assetId` checksummed.
 *
 * @param row - A captured API row.
 * @returns The row, with a checksummed `assetId`.
 */
export function withChecksummedAssetId<Row extends { assetId: string }>(
  row: Row,
): Row {
  const assetId = checksumAssetId(row.assetId);
  if (assetId === row.assetId) {
    return row;
  }
  return { ...row, assetId };
}

/**
 * Copy a spot-price entry and checksum its asset `id`.
 *
 * @param captured - A captured `/v3/spot-prices` entry.
 * @param assetId - The asset ID the request asked about.
 * @returns The entry, with a checksummed `id`.
 */
export function withChecksummedPrice(captured: Json, assetId: string): Json {
  if (
    captured === null ||
    typeof captured !== 'object' ||
    Array.isArray(captured)
  ) {
    return captured;
  }
  return { ...captured, id: checksumAssetId(assetId) };
}
