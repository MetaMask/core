import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionMeta } from '..';

/**
 * Get the native balance for an address.
 *
 * @param address - Address to get the balance for.
 * @param ethQuery - EthQuery instance to use.
 * @returns Balance in both human-readable and raw format.
 */
export async function getNativeBalance(address: Hex, ethQuery: EthQuery) {
  const balanceRawHex = (await query(ethQuery, 'getBalance', [
    address,
    'latest',
  ])) as Hex;

  const balanceRaw = new BigNumber(balanceRawHex).toString(10);
  const balanceHuman = new BigNumber(balanceRaw).shiftedBy(-18).toString(10);

  return {
    balanceHuman,
    balanceRaw,
  };
}

/**
 * Determine if the native balance is sufficient to cover max gas cost.
 *
 * @param transaction - Transaction metadata.
 * @param ethQuery - EthQuery instance.
 * @returns True if the native balance is sufficient, false otherwise.
 */
export async function isNativeBalanceSufficientForGas(
  transaction: TransactionMeta,
  ethQuery: EthQuery,
): Promise<boolean> {
  const from = transaction.txParams.from as Hex;

  const gasCostRawValue = new BigNumber(
    transaction.txParams.gas ?? '0x0',
  ).multipliedBy(
    transaction.txParams.maxFeePerGas ?? transaction.txParams.gasPrice ?? '0x0',
  );

  const { balanceRaw } = await getNativeBalance(from, ethQuery);

  return gasCostRawValue.isLessThanOrEqualTo(balanceRaw);
}
