import contractMap from '@metamask/contract-metadata';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { CaipChainId, Hex } from '@metamask/utils';

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

const mainnetTokens = contractMap as Record<string, ContractMetadataEntry>;

const mainnetAssetIdPrefix = 'eip155:1/';

export function getKnownTokenMetadata(
  chainId: CaipChainId | Hex,
  contractAddress?: string,
): KnownTokenMetadata | undefined {
  if (!contractAddress) {
    return undefined;
  }

  const assetId = formatAddressToAssetId(contractAddress, chainId);

  if (!assetId?.startsWith(mainnetAssetIdPrefix)) {
    return undefined;
  }

  const entry = mainnetTokens[toChecksumHexAddress(contractAddress)];

  if (!entry) {
    return undefined;
  }

  return {
    symbol: entry.symbol,
    decimals: entry.decimals,
    assetId,
  };
}
