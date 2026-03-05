import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  computeTokenAmounts,
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from './token';
import type {
  FiatRates,
  TransactionPayControllerMessenger,
  TransactionPayRequiredToken,
} from '../types';

const FOUR_BYTE_TOKEN_TRANSFER = '0xa9059cbb';

/**
 * Parse required tokens from a transaction.
 *
 * If the transaction has `requiredAssets`, those are used to determine required tokens.
 * Otherwise, falls back to parsing the transaction data for token transfers.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns An array of required tokens.
 */
export function parseRequiredTokens(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayRequiredToken[] {
  const { requiredAssets } = transaction;

  if (requiredAssets?.length) {
    const assetTokens = requiredAssets
      .map((asset) =>
        buildRequiredToken(transaction, asset.address, asset.amount, messenger),
      )
      .filter(Boolean) as TransactionPayRequiredToken[];

    return assetTokens;
  }

  return [
    getTokenTransferToken(transaction, messenger),
    getGasFeeToken(transaction, messenger),
  ].filter(Boolean) as TransactionPayRequiredToken[];
}

/**
 * Parse a required token from a token transfer.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns The required token or undefined if the transaction is not a token transfer.
 */
function getTokenTransferToken(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayRequiredToken | undefined {
  const { data, to } = getTokenTransferData(transaction) ?? {};

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

  return buildRequiredToken(transaction, to, transferAmount, messenger);
}

/**
 * Get the gas fee token required for a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns The gas fee token or undefined if it could not be determined.
 */
function getGasFeeToken(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayRequiredToken | undefined {
  const { chainId, txParams } = transaction;
  const { gas, maxFeePerGas } = txParams;
  const nativeTokenAddress = getNativeToken(chainId);

  const maxGasCostRawHex = add0x(
    new BigNumber(gas ?? '0x0')
      .multipliedBy(new BigNumber(maxFeePerGas ?? '0x0'))
      .toString(16),
  );

  const token = buildRequiredToken(
    transaction,
    nativeTokenAddress,
    maxGasCostRawHex,
    messenger,
  );

  if (!token) {
    return undefined;
  }

  const amountUsdValue = new BigNumber(token.amountUsd);

  const hasBalance = new BigNumber(token.balanceRaw).isGreaterThanOrEqualTo(
    token.amountRaw,
  );

  if (hasBalance || amountUsdValue.isGreaterThanOrEqualTo(1)) {
    return {
      ...token,
      allowUnderMinimum: true,
      skipIfBalance: true,
    };
  }

  const fiatRates = getTokenFiatRate(
    messenger,
    nativeTokenAddress,
    chainId,
  ) as FiatRates;

  const oneDollarRawHex = add0x(
    new BigNumber(1).dividedBy(fiatRates.usdRate).shiftedBy(18).toString(16),
  );

  const oneDollarToken = buildRequiredToken(
    transaction,
    nativeTokenAddress,
    oneDollarRawHex,
    messenger,
  );

  /* istanbul ignore next */
  if (!oneDollarToken) {
    return undefined;
  }

  return {
    ...oneDollarToken,
    allowUnderMinimum: true,
    skipIfBalance: true,
  };
}

/**
 * Get the full token properties for a specific token and amount.
 *
 * @param transaction - Transaction metadata.
 * @param tokenAddress - Token address.
 * @param amountRawHex - Raw token amount in hexadecimal format.
 * @param messenger - Controller messenger.
 * @returns The full token properties or undefined if the token data could not be retrieved.
 */
function buildRequiredToken(
  transaction: TransactionMeta,
  tokenAddress: Hex,
  amountRawHex: Hex,
  messenger: TransactionPayControllerMessenger,
): TransactionPayRequiredToken | undefined {
  const { chainId, txParams } = transaction;
  const from = txParams.from as Hex;

  const { decimals: tokenDecimals, symbol } =
    getTokenInfo(messenger, tokenAddress, chainId) ?? {};

  const fiatRates = getTokenFiatRate(messenger, tokenAddress, chainId);
  const tokenBalance = getTokenBalance(messenger, from, chainId, tokenAddress);

  if (tokenDecimals === undefined || !symbol || fiatRates === undefined) {
    return undefined;
  }

  const {
    human: balanceHuman,
    raw: balanceRaw,
    fiat: balanceFiat,
    usd: balanceUsd,
  } = computeTokenAmounts(tokenBalance, tokenDecimals, fiatRates);

  const {
    human: amountHuman,
    raw: amountRaw,
    fiat: amountFiat,
    usd: amountUsd,
  } = computeTokenAmounts(amountRawHex, tokenDecimals, fiatRates);

  return {
    address: tokenAddress,
    allowUnderMinimum: false,
    amountFiat,
    amountHuman,
    amountRaw,
    amountUsd,
    balanceFiat,
    balanceHuman,
    balanceRaw,
    balanceUsd,
    chainId,
    decimals: tokenDecimals,
    skipIfBalance: false,
    symbol,
  };
}

/**
 * Find token transfer data in a transaction.
 *
 * @param transactionMeta - Transaction metadata.
 * @returns - Token transfer data or undefined if not found.
 */
function getTokenTransferData(transactionMeta: TransactionMeta):
  | {
      data: Hex;
      to: Hex;
      index?: number;
    }
  | undefined {
  const { nestedTransactions, txParams } = transactionMeta;
  const { data: singleData } = txParams;
  const singleTo = txParams?.to as Hex | undefined;

  if (singleData?.startsWith(FOUR_BYTE_TOKEN_TRANSFER) && singleTo) {
    return { data: singleData as Hex, to: singleTo, index: undefined };
  }

  const nestedCallIndex = nestedTransactions?.findIndex((call) =>
    call.data?.startsWith(FOUR_BYTE_TOKEN_TRANSFER),
  );

  const nestedCall =
    nestedCallIndex === undefined || nestedCallIndex === -1
      ? undefined
      : nestedTransactions?.[nestedCallIndex];

  if (nestedCall?.data && nestedCall.to) {
    return {
      data: nestedCall.data,
      to: nestedCall.to,
      index: nestedCallIndex,
    };
  }

  return undefined;
}
