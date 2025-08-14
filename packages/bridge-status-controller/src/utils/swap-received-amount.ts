import type { TokenAmountValues } from '@metamask/bridge-controller';
import { isNativeAddress } from '@metamask/bridge-controller';
import { type TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type { BridgeHistoryItem } from '../types';

const getReceivedNativeAmount = (
  historyItem: BridgeHistoryItem,
  actualGas: Omit<TokenAmountValues, 'valueInCurrency'> | null,
  txMeta: TransactionMeta,
) => {
  const { preTxBalance, postTxBalance } = txMeta;

  if (!preTxBalance || !postTxBalance || preTxBalance === postTxBalance) {
    // If preTxBalance and postTxBalance are equal, postTxBalance hasn't been updated on time
    // because of the RPC provider delay, so we return an estimated receiving amount instead.
    return new BigNumber(historyItem.quote.destTokenAmount)
      .div(new BigNumber(10).pow(historyItem.quote.destAsset.decimals))
      .toString(10);
  }

  return actualGas
    ? new BigNumber(postTxBalance, 16)
        .minus(preTxBalance, 16)
        .minus(actualGas.amount)
        .div(10 ** historyItem.quote.destAsset.decimals)
    : null;
};

const getReceivedERC20Amount = (
  historyItem: BridgeHistoryItem,
  txMeta: TransactionMeta,
) => {
  const { txReceipt } = txMeta;
  if (!txReceipt || !txReceipt.logs || txReceipt.status === '0x0') {
    return null;
  }
  const { account: accountAddress, quote } = historyItem;

  const TOKEN_TRANSFER_LOG_TOPIC_HASH =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  const tokenTransferLog = txReceipt.logs.find((txReceiptLog) => {
    const isTokenTransfer =
      txReceiptLog.topics &&
      txReceiptLog.topics[0].startsWith(TOKEN_TRANSFER_LOG_TOPIC_HASH);
    const isTransferFromGivenToken =
      txReceiptLog.address?.toLowerCase() ===
      quote.destAsset.address?.toLowerCase();
    const isTransferFromGivenAddress =
      txReceiptLog.topics &&
      txReceiptLog.topics[2] &&
      (txReceiptLog.topics[2] === accountAddress ||
        txReceiptLog.topics[2].match(accountAddress?.slice(2)));

    return (
      isTokenTransfer && isTransferFromGivenToken && isTransferFromGivenAddress
    );
  });

  if (tokenTransferLog?.data) {
    return new BigNumber(tokenTransferLog.data, 16).div(
      new BigNumber(10).pow(quote.destAsset.decimals),
    );
  }

  return null;
};

export const getActualSwapReceivedAmount = (
  historyItem: BridgeHistoryItem,
  actualGas: Omit<TokenAmountValues, 'valueInCurrency'> | null,
  txMeta?: TransactionMeta,
) => {
  const { pricingData } = historyItem;
  const quotedReturnAmount = historyItem.quote.destTokenAmount;

  if (!txMeta?.txReceipt) {
    return null;
  }

  const actualReturnAmount = isNativeAddress(
    historyItem.quote.destAsset.address,
  )
    ? getReceivedNativeAmount(historyItem, actualGas, txMeta)
    : getReceivedERC20Amount(historyItem, txMeta);

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
