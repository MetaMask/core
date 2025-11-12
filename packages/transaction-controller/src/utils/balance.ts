import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

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
