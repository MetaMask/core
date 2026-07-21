/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { TokenAmountValues } from '@metamask/bridge-controller';
import type { TransactionReceipt } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type { BridgeHistoryItem } from '../types';

const calcGasInHexWei = (gasLimit?: string, gasPrice?: string) => {
  return gasLimit && gasPrice
    ? new BigNumber(gasLimit, 16).times(new BigNumber(gasPrice, 16))
    : null;
};

/**
 * Calculate the effective gas used for a transaction and its approval tx
 *
 * @param bridgeHistoryItem - The bridge history item
 * @param bridgeHistoryItem.pricingData - pricing data from the submitted quote
 * @param txReceipt - tx receipt from the txMeta
 * @param approvalTxReceipt - tx receipt from the approvalTxMeta
 * @returns The actual gas used for the transaction in Wei and its value in USD
 */
export const calcActualGasUsed = (
  { pricingData }: BridgeHistoryItem,
  txReceipt?: TransactionReceipt,
  approvalTxReceipt?: TransactionReceipt,
): Omit<TokenAmountValues, 'valueInCurrency'> | null => {
  const usdExchangeRate =
    pricingData?.quotedGasInUsd && pricingData?.quotedGasAmount
      ? new BigNumber(pricingData?.quotedGasInUsd).div(
          pricingData.quotedGasAmount,
        )
      : null;

  const actualGasInHexWei = calcGasInHexWei(
    txReceipt?.gasUsed,
    txReceipt?.effectiveGasPrice,
  )?.plus(
    calcGasInHexWei(
      approvalTxReceipt?.gasUsed,
      approvalTxReceipt?.effectiveGasPrice,
    ) ?? 0,
  );

  const actualGasInDecEth = actualGasInHexWei
    ?.div(new BigNumber(10).pow(18))
    .toString(10);

  return actualGasInHexWei && actualGasInDecEth
    ? {
        amount: actualGasInHexWei.toString(10),
        usd:
          usdExchangeRate?.multipliedBy(actualGasInDecEth).toString(10) ?? null,
      }
    : null;
};
