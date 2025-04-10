import type { CaipAssetType } from '@metamask/utils';
import type { ExchangeRate, GenericQuoteRequest } from 'src/types';

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
    [assetId: CaipAssetType]: { [currency: string]: string };
  },
) => {
  const exchangeRates = Object.entries(pricesByAssetId).reduce(
    (acc, [assetId, prices]) => {
      acc[assetId as CaipAssetType] = {
        exchangeRate: prices[currency],
        usdExchangeRate: prices.usd,
      };
      return acc;
    },
    {} as Record<CaipAssetType, ExchangeRate>,
  );
  return exchangeRates;
};
