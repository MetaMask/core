import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '../types';

/**
 * Get the token balance for a specific account and token.
 *
 * @param messenger - Controller messenger.
 * @param account - Address of the account.
 * @param chainId - Id of the chain.
 * @param tokenAddress - Address of the token contract.
 * @returns The token balance as a BigNumber.
 */
export function getTokenBalance(
  messenger: TransactionPayControllerMessenger,
  account: Hex,
  chainId: Hex,
  tokenAddress: Hex,
): BigNumber {
  const controllerState = messenger.call('TokenBalancesController:getState');
  const normalizedAccount = toChecksumHexAddress(account) as Hex;
  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;

  const balanceHex =
    controllerState.tokenBalances?.[normalizedAccount]?.[chainId]?.[
      normalizedTokenAddress
    ];

  return new BigNumber(balanceHex ?? '0x0', 16);
}

/**
 * Get the token decimals for a specific token.
 *
 * @param messenger - Controller messenger.
 * @param tokenAddress - Address of the token contract.
 * @param chainId - Id of the chain.
 * @returns The token decimals or undefined if the token is not found.
 */
export function getTokenDecimals(
  messenger: TransactionPayControllerMessenger,
  tokenAddress: Hex,
  chainId: Hex,
): number | undefined {
  const controllerState = messenger.call('TokenListController:getState');
  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;

  return controllerState.tokensChainsCache?.[chainId]?.data[
    normalizedTokenAddress
  ]?.decimals;
}
