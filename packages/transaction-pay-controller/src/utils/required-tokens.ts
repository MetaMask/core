import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenBalance, getTokenInfo } from './token';
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
  const { txParams } = transaction;
  const { data } = txParams;
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

  if (transferAmount === undefined) {
    return undefined;
  }

  return getTokenProperties(transaction, to, transferAmount, messenger);
}

/**
 * Get the full token properties for a specific token and amount.
 *
 * @param transaction - Transaction metadata.
 * @param tokenAddress - Token address.
 * @param amount - Token amount in hexadecimal format.
 * @param messenger - Controller messenger.
 * @returns The full token properties or undefined if the token data could not be retrieved.
 */
function getTokenProperties(
  transaction: TransactionMeta,
  tokenAddress: Hex,
  amount: Hex,
  messenger: TransactionPayControllerMessenger,
): TransactionTokenRequired | undefined {
  const { chainId, txParams } = transaction;
  const from = txParams.from as Hex;

  const { decimals: tokenDecimals, symbol } =
    getTokenInfo(messenger, tokenAddress, chainId) ?? {};

  const tokenBalance = getTokenBalance(messenger, from, chainId, tokenAddress);

  if (!amount || tokenDecimals === undefined || !symbol) {
    return undefined;
  }

  const { amountHuman: balanceHuman, amountRaw: balanceRaw } = calculateAmounts(
    tokenBalance,
    tokenDecimals,
  );

  const { amountHuman, amountRaw } = calculateAmounts(amount, tokenDecimals);

  return {
    address: tokenAddress,
    allowUnderMinimum: false,
    amountHuman,
    amountRaw,
    balanceHuman,
    balanceRaw,
    chainId,
    decimals: tokenDecimals,
    skipIfBalance: false,
    symbol,
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
