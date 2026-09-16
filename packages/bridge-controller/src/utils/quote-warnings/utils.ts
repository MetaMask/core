import { BigNumber } from 'bignumber.js';
import { assetIdsMatch } from '../assets.js';
import type { CaipAssetType } from '@metamask/utils';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { DeepPartial } from '../../types.js';

/**
 * Compares balances to a list of fees aggregated by assetId
 *
 * @param balances - normalized balances for the wallet address by assetId
 * @param totalFees - an array of fees aggregated by assetId
 * @returns true if all the balances exist and are greater than or equal to the total fees, false otherwise
 */
export const balanceGte = (
  balances: Record<
    CaipAssetType,
    AmountsAndAsset['normalizedAmount'] | undefined
  >,
  totalFees: DeepPartial<AmountsAndAsset>[],
): boolean => {
  if (totalFees.length === 0) {
    return true;
  }

  // Compare total fees to the balance of the wallet
  return totalFees.every((fee): boolean => {
    if (!fee.normalizedAmount) {
      return true;
    }

    const balanceKey = Object.keys(balances).find((assetId) => {
      return assetIdsMatch(assetId as CaipAssetType, fee.asset?.assetId);
    });
    const balance = balances[balanceKey as CaipAssetType];

    if (balance) {
      return new BigNumber(balance).gte(fee.normalizedAmount);
    }

    return false;
  });
};
