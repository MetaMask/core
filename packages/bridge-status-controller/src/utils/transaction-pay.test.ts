import { CHAIN_IDS } from '@metamask/transaction-controller';
import { PaymentOverride } from '@metamask/transaction-pay-controller';
import type {
  TransactionConfig,
  UpdatePaymentTokenRequest,
} from '@metamask/transaction-pay-controller';
import { describe, expect, it } from 'vitest';

import {
  getControllerMessenger,
  getRootMessenger,
} from '../__fixtures__/test-utils.js';
import { Operation } from '../types.js';
import {
  setTransactionConfigForMmPay,
  updatePaymentToken,
} from './transaction-pay.js';

const TX_ID = 'tx-id';
const MONEY_ACCOUNT_ID = 'money-account-id';
const REFUND_TO = '0x1111111111111111111111111111111111111111' as const;
const TOKEN = '0x8888888888888888888888888888888888888888' as const;
const MONEY_ACCOUNT = { id: MONEY_ACCOUNT_ID, address: REFUND_TO };

const setup = (): {
  messenger: ReturnType<typeof getControllerMessenger>;
  configs: TransactionConfig[];
  paymentTokens: UpdatePaymentTokenRequest[];
} => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  const configs: TransactionConfig[] = [];
  const paymentTokens: UpdatePaymentTokenRequest[] = [];

  rootMessenger.registerActionHandler(
    'TransactionPayController:setTransactionConfig',
    (_txId, updater): void => {
      const config: TransactionConfig = {};
      updater(config);
      configs.push(config);
    },
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:updatePaymentToken',
    (request): void => {
      paymentTokens.push(request);
    },
  );

  return { messenger, configs, paymentTokens };
};

describe('setTransactionConfigForMmPay', () => {
  it('sets dest-wallet override and money-account refundTo on deposit', () => {
    const { messenger, configs } = setup();
    setTransactionConfigForMmPay(
      messenger,
      TX_ID,
      MONEY_ACCOUNT,
      Operation.DEPOSIT,
    );
    expect(configs).toStrictEqual([
      {
        paymentOverride: PaymentOverride.MoneyAccount,
        accountOverride: undefined,
        refundTo: REFUND_TO,
      },
    ]);
  });

  it('only sets refundTo on withdraw', () => {
    const { messenger, configs } = setup();
    setTransactionConfigForMmPay(
      messenger,
      TX_ID,
      MONEY_ACCOUNT,
      Operation.WITHDRAW,
    );
    expect(configs).toStrictEqual([{ refundTo: REFUND_TO }]);
  });
});

describe('updatePaymentToken', () => {
  it('forwards the payment token to TransactionPayController', () => {
    const { messenger, paymentTokens } = setup();
    updatePaymentToken(messenger, TX_ID, TOKEN, CHAIN_IDS.ARBITRUM);
    expect(paymentTokens).toStrictEqual([
      {
        transactionId: TX_ID,
        assetId:
          'eip155:42161/erc20:0x8888888888888888888888888888888888888888',
      },
    ]);
  });
});
