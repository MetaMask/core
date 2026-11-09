import { PaymentOverride } from '@metamask/transaction-pay-controller';
import type { TransactionConfig } from '@metamask/transaction-pay-controller';

import type { BridgeStatusControllerMessenger } from '../types.js';
import { Operation } from '../types.js';

export const setTransactionConfigForMmPay = (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
  refundTo: `0x${string}`,
  operation: Operation,
) => {
  messenger.call(
    'TransactionPayController:setTransactionConfig',
    txMetaId,
    (config: TransactionConfig) => {
      if (operation === Operation.WITHDRAW) {
        config.isPostQuote = true;
      }
      if (operation === Operation.DEPOSIT) {
        config.paymentOverride = PaymentOverride.MoneyAccount;
        config.accountOverride = refundTo;
      }
      config.refundTo = refundTo; // failed fill returns here
    },
  );
};

// Updates transaction payment quotes, required for withdraws
export const updatePaymentToken = (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
  tokenAddress: `0x${string}`,
  chainId: `0x${string}`,
) => {
  messenger.call('TransactionPayController:updatePaymentToken', {
    transactionId: txMetaId,
    tokenAddress,
    chainId,
  });
};
