import type { CaipChainId, Hex } from '@metamask/utils';

import contractMap from './contract-metadata-index.json';
import { formatAddressToAssetId } from './caip.js';

export type KnownTokenMetadata = {
  symbol?: string;
  decimals?: number;
  assetId?: string;
};

type ContractMetadataEntry = {
  name?: string;
  symbol?: string;
  decimals?: number;
  erc20?: boolean;
};

const metadataByAssetId = contractMap as Record<string, ContractMetadataEntry>;

export function getKnownTokenMetadata(
  chainId: CaipChainId | Hex,
  contractAddress?: string,
): KnownTokenMetadata | undefined {
  if (!contractAddress) {
    return undefined;
  }

  const assetId = formatAddressToAssetId(contractAddress, chainId);

  if (!assetId) {
    return undefined;
  }

  const entry = metadataByAssetId[assetId];

  if (!entry) {
    return undefined;
  }

  return {
    symbol: entry.symbol,
    decimals: entry.decimals,
    assetId,
  };
}
