import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenBalance, getTokenDecimals } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionTokenRequired,
} from '../types';

/**
 * Parse required tokens from a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns An array of required tokens.
 */
export function parseRequiredTokens(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionTokenRequired[] {
  return [parseTokenTransfer(transaction, messenger)].filter(
    Boolean,
  ) as TransactionTokenRequired[];
}

/**
 * Parse a required token from a token transfer.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns The required token or undefined if the transaction is not a token transfer.
 */
function parseTokenTransfer(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionTokenRequired | undefined {
  const { chainId, txParams } = transaction;
  const { data } = txParams;
  const from = txParams.from as Hex;
  const to = txParams.to as Hex | undefined;

  if (!to || !data) {
    return undefined;
  }

  let transferAmount: Hex | undefined;

  try {
    const result = new Interface(abiERC20).decodeFunctionData('transfer', data);
    transferAmount = toHex(result._value);
  } catch {
    // Intentionally empty
  }

  const tokenDecimals = getTokenDecimals(messenger, to, chainId);
  const tokenBalance = getTokenBalance(messenger, from, chainId, to);

  if (!transferAmount || tokenDecimals === undefined) {
    return undefined;
  }

  const { amountHuman: balanceHuman, amountRaw: balanceRaw } = calculateAmounts(
    tokenBalance,
    tokenDecimals,
  );

  const { amountHuman, amountRaw } = calculateAmounts(
    transferAmount,
    tokenDecimals,
  );

  return {
    address: to,
    allowUnderMinimum: false,
    amountHuman,
    amountRaw,
    balanceHuman,
    balanceRaw,
    chainId,
    decimals: tokenDecimals,
    skipIfBalance: false,
  };
}

/**
 * Calculates human and raw amounts for a value based on the token decimals.
 *
 * @param amountRawInput - The raw input.
 * @param decimals - The number of decimals for the token.
 * @returns An object containing both the human-readable and raw amounts as strings.
 */
function calculateAmounts(amountRawInput: BigNumber.Value, decimals: number) {
  const amountRawValue = new BigNumber(amountRawInput);
  const amountHumanValue = amountRawValue.shiftedBy(-decimals);
  const amountRaw = amountRawValue.toFixed(0);
  const amountHuman = amountHumanValue.toString(10);

  return {
    amountHuman,
    amountRaw,
  };
}
