import type { Web3Provider } from '@ethersproject/providers';
import type { TokenAmountValues } from '@metamask/bridge-controller';
import { isNativeAddress } from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type { BridgeHistoryItem } from '../types.js';

const getReceivedNativeAmount = (
  historyItem: BridgeHistoryItem,
  actualGas: Omit<TokenAmountValues, 'valueInCurrency'> | null,
  txMeta: TransactionMeta,
): string | BigNumber | null => {
  const { preTxBalance, postTxBalance } = txMeta;

  if (!preTxBalance || !postTxBalance || preTxBalance === postTxBalance) {
    // If preTxBalance and postTxBalance are equal, postTxBalance hasn't been updated on time
    // because of the RPC provider delay, so we return an estimated receiving amount instead.
    return new BigNumber(historyItem.quote.destTokenAmount)
      .div(new BigNumber(10).pow(historyItem.quote.destAsset.decimals))
      .toString(10);
  }

  return actualGas && postTxBalance && preTxBalance
    ? new BigNumber(postTxBalance, 16)
        .minus(preTxBalance, 16)
        .minus(actualGas.amount)
        .div(10 ** historyItem.quote.destAsset.decimals)
    : null;
};

export const getReceivedERC20Amount = (
  walletAddress: string,
  destAssetAddress: string,
  logs?: { address?: string; topics?: string[]; data?: string }[],
): BigNumber | null => {
  if (!logs) {
    return null;
  }

  const TOKEN_TRANSFER_LOG_TOPIC_HASH =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  const tokenTransferLogs = logs.filter((txReceiptLog) => {
    const isTokenTransfer = txReceiptLog.topics?.[0]
      ?.toLowerCase()
      .startsWith(TOKEN_TRANSFER_LOG_TOPIC_HASH);
    const isTransferFromGivenToken =
      txReceiptLog.address?.toLowerCase() === destAssetAddress?.toLowerCase();
    const isTransferFromGivenAddress =
      txReceiptLog.topics?.[2] &&
      (txReceiptLog.topics[2].toLowerCase() === walletAddress?.toLowerCase() ||
        txReceiptLog.topics[2]
          .toLowerCase()
          .match(walletAddress?.slice(2).toLowerCase()));

    return (
      isTokenTransfer && isTransferFromGivenToken && isTransferFromGivenAddress
    );
  });

  const totalReceivedAmount = tokenTransferLogs.reduce(
    (sum, tokenTransferLog) =>
      tokenTransferLog?.data ? sum.plus(tokenTransferLog.data, 16) : sum,
    new BigNumber(0),
  );

  return totalReceivedAmount.gt(0) ? totalReceivedAmount : null;
};

/**
 * Calculate the amount received after a swap transaction based on the txMeta
 *
 * @param historyItem - The bridge history item
 * @param actualGas - The actual gas used for the transaction
 * @param txMeta - The transaction meta from the TransactionController
 * @returns The actual amount received for the swap transaction
 */
export const getActualSwapReceivedAmount = (
  historyItem: BridgeHistoryItem,
  actualGas: Omit<TokenAmountValues, 'valueInCurrency'> | null,
  txMeta?: TransactionMeta,
): null | { amount?: BigNumber | string | null; usd: BigNumber | null } => {
  const { pricingData } = historyItem;
  const quotedReturnAmount = historyItem.quote.destTokenAmount;

  if (!txMeta?.txReceipt || txMeta?.txReceipt.status === '0x0') {
    return null;
  }

  const actualReturnAmount = isNativeAddress(
    historyItem.quote.destAsset.address,
  )
    ? getReceivedNativeAmount(historyItem, actualGas, txMeta)
    : getReceivedERC20Amount(
        historyItem.account,
        historyItem.quote.destAsset.address,
        // @ts-expect-error - txReceipt.logs is not typed correctly
        txMeta?.txReceipt?.logs,
      )?.div(new BigNumber(10).pow(historyItem.quote.destAsset.decimals));

  const returnUsdExchangeRate =
    pricingData?.quotedReturnInUsd && quotedReturnAmount
      ? new BigNumber(pricingData.quotedReturnInUsd)
          .div(quotedReturnAmount)
          .multipliedBy(10 ** historyItem.quote.destAsset.decimals)
      : null;

  return {
    amount: actualReturnAmount,
    usd:
      actualReturnAmount && returnUsdExchangeRate
        ? returnUsdExchangeRate.multipliedBy(actualReturnAmount)
        : null,
  };
};

/**
 * Calculate the amount received after a bridge transaction based on the getTxStatus's
 * amount field
 *
 * @param historyItem - The bridge history item
 * @returns The actual amount received for the bridge transaction
 */
export const getActualBridgeReceivedAmount = (
  historyItem: BridgeHistoryItem,
): Omit<TokenAmountValues, 'valueInCurrency'> | null => {
  const { quote, pricingData, status } = historyItem;

  const usdExchangeRate = pricingData?.quotedReturnInUsd
    ? new BigNumber(pricingData.quotedReturnInUsd).div(quote.destTokenAmount)
    : null;

  const actualAmount = status.destChain?.amount;
  return actualAmount && usdExchangeRate
    ? {
        amount: actualAmount,
        usd: usdExchangeRate.multipliedBy(actualAmount).toString(10),
      }
    : null;
};

export const getReceivedAmountFromTxHash = async (
  txHash: string,
  walletAddress: string,
  tokenAddress: string,
  provider: Web3Provider,
): Promise<BigNumber> => {
  const txReceipt = await provider.getTransactionReceipt(txHash);
  const receivedAmount = getReceivedERC20Amount(
    walletAddress,
    tokenAddress,
    txReceipt?.logs,
  );

  if (!receivedAmount) {
    throw new Error(`Missing received amount`);
  }

  return receivedAmount;
};
