import type { NetworkClientId } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionMeta } from '..';
import type { TransactionControllerMessenger } from '../TransactionController';
import { rpcRequest } from './provider';

/**
 * Get the native balance for an address.
 *
 * @param address - Address to get the balance for.
 * @param messenger - The TransactionController messenger.
 * @param networkClientId - The network client ID.
 * @returns Balance in both human-readable and raw format.
 */
export async function getNativeBalance(
  address: Hex,
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): Promise<{
  balanceHuman: string;
  balanceRaw: string;
}> {
  const balanceRawHex = (await rpcRequest({
    messenger,
    networkClientId,
    method: 'eth_getBalance',
    params: [address, 'latest'],
  })) as Hex;

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
 * @param messenger - The TransactionController messenger.
 * @param networkClientId - The network client ID.
 * @returns True if the native balance is sufficient, false otherwise.
 */
export async function isNativeBalanceSufficientForGas(
  transaction: TransactionMeta,
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): Promise<boolean> {
  const from = transaction.txParams.from as Hex;

  const gasCostRawValue = new BigNumber(
    transaction.txParams.gas ?? '0x0',
  ).multipliedBy(
    transaction.txParams.maxFeePerGas ?? transaction.txParams.gasPrice ?? '0x0',
  );

  const { balanceRaw } = await getNativeBalance(
    from,
    messenger,
    networkClientId,
  );

  return gasCostRawValue.isLessThanOrEqualTo(balanceRaw);
}
