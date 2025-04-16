import type { CaipAssetType } from '@metamask/utils';

import { getNativeAssetForChainId } from './bridge';
import { formatAddressToAssetId } from './caip-formatters';
import type { ExchangeRate, GenericQuoteRequest } from '../types';

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
  const exchangeRates = Object.entries(pricesByAssetId).reduce(
    (acc, [assetId, prices]) => {
      if (prices) {
        acc[assetId as CaipAssetType] = {
          exchangeRate: prices[currency],
          usdExchangeRate: prices.usd,
        };
      }
      return acc;
    },
    {} as Record<CaipAssetType, ExchangeRate>,
  );
  return exchangeRates;
};
