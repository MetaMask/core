import { USDC_DECIMALS } from '@metamask/perps-controller/constants/hyperLiquidConfig';
import { add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { walletPayErrors } from '../../errors.js';
import type { TransactionPayMiddlewareMessenger } from '../../types.js';

/**
 * Converts a USDC amount to its raw hex value.
 *
 * @param amount - The decimal amount, or `undefined` for no amount.
 * @returns The raw amount, or `0x0` when no amount is given.
 */
export function toUsdcAmountRaw(amount: string | undefined): Hex {
  if (amount === undefined) {
    return '0x0';
  }

  return add0x(new BigNumber(amount).shiftedBy(USDC_DECIMALS).toString(16));
}

/**
 * Throws the geo-block error when the user isn't eligible for perps.
 *
 * @param messenger - The middleware messenger.
 */
export async function assertPerpsEligible(
  messenger: TransactionPayMiddlewareMessenger,
): Promise<void> {
  if (messenger.call('PerpsController:getState').isEligible) {
    return;
  }

  // `isEligible` starts as false until the first check completes, so refresh
  // once before blocking.
  await messenger.call('PerpsController:refreshEligibility');

  if (!messenger.call('PerpsController:getState').isEligible) {
    throw walletPayErrors.perpsNotEligible();
  }
}
