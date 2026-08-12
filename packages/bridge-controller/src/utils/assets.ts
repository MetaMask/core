import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import type { ExchangeRate, GenericQuoteRequest } from '../types.js';
import { getNativeAssetForChainId } from './bridge.js';
import { formatAddressToAssetId } from './caip-formatters.js';

export const getAssetIdsForToken = (
  tokenAddress: GenericQuoteRequest['srcTokenAddress'],
  chainId: GenericQuoteRequest['srcChainId'],
) => {
  const assetIdsToFetch: CaipAssetType[] = [];

  const assetId = formatAddressToAssetId(tokenAddress, chainId);
  if (assetId) {
    assetIdsToFetch.push(assetId);
    getNativeAssetForChainId(chainId)?.assetId &&
      assetIdsToFetch.push(getNativeAssetForChainId(chainId).assetId);
  }

  return assetIdsToFetch;
};

export const toExchangeRates = (
  currency: string,
  pricesByAssetId: {
    [assetId: CaipAssetType]: { [currency: string]: string } | undefined;
  },
) => {
  const exchangeRates = Object.entries(pricesByAssetId).reduce<
    Record<CaipAssetType, ExchangeRate>
  >((acc, [assetId, prices]) => {
    if (prices) {
      acc[assetId as CaipAssetType] = {
        exchangeRate: prices[currency],
        usdExchangeRate: prices.usd,
      };
    }
    return acc;
  }, {});
  return exchangeRates;
};

export const assetIdsMatch = (
  assetId1?: CaipAssetType,
  assetId2?: CaipAssetType,
): boolean => {
  if (!assetId2 || !assetId1) {
    return false;
  }

  return (
    assetId1 === assetId2 ||
    (parseCaipAssetType(assetId1).chain.namespace ===
      KnownCaipNamespace.Eip155 &&
      assetId1.toLowerCase() === assetId2.toLowerCase())
  );
};
