import { formatAddressToAssetId } from '@metamask/bridge-controller';
import { PaymentOverride } from '@metamask/transaction-pay-controller';
import type { TransactionConfig } from '@metamask/transaction-pay-controller';

import type { BridgeStatusControllerMessenger } from '../types.js';
import { Operation } from '../types.js';

export const setTransactionConfigForMmPay = (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
  moneyAccount: { address: `0x${string}` },
  operation: Operation,
): void => {
  messenger.call(
    'TransactionPayController:setTransactionConfig',
    txMetaId,
    (config: TransactionConfig) => {
      if (operation === Operation.WITHDRAW) {
        config.isPostQuote = true;
      }
      if (operation === Operation.DEPOSIT) {
        config.paymentOverride = PaymentOverride.MoneyAccount;
        config.accountOverride = undefined;
      }
      config.refundTo = moneyAccount.address; // failed fill returns here
    },
  );
};

// Updates transaction payment quotes, required for withdraws/deposit
export const updatePaymentToken = (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
  tokenAddress: `0x${string}`,
  chainId: `0x${string}`,
): void => {
  const assetId = formatAddressToAssetId(tokenAddress, chainId);
  if (!assetId) {
    throw new Error('Invalid token address or chain ID');
  }

  messenger.call('TransactionPayController:updatePaymentToken', {
    transactionId: txMetaId,
    assetId,
  });
};
