import type { CaipAssetType } from '@metamask/utils';

import type { ExchangeRate, GenericQuoteRequest } from '../types';
import { getNativeAssetForChainId } from './bridge';
import { formatAddressToAssetId } from './caip-formatters';

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
