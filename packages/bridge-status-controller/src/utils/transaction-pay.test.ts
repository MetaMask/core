import { CHAIN_IDS } from '@metamask/transaction-controller';
import { PaymentOverride } from '@metamask/transaction-pay-controller';
import type { TransactionConfig } from '@metamask/transaction-pay-controller';
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
const REFUND_TO = '0x1111111111111111111111111111111111111111' as const;
const TOKEN = '0x8888888888888888888888888888888888888888' as const;

const setup = (): {
  messenger: ReturnType<typeof getControllerMessenger>;
  configs: TransactionConfig[];
  paymentTokens: {
    transactionId: string;
    tokenAddress: `0x${string}`;
    chainId: `0x${string}`;
  }[];
} => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  const configs: TransactionConfig[] = [];
  const paymentTokens: {
    transactionId: string;
    tokenAddress: `0x${string}`;
    chainId: `0x${string}`;
  }[] = [];

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
  it('sets money-account override and refundTo on deposit', () => {
    const { messenger, configs } = setup();
    setTransactionConfigForMmPay(
      messenger,
      TX_ID,
      REFUND_TO,
      Operation.DEPOSIT,
    );
    expect(configs).toStrictEqual([
      {
        paymentOverride: PaymentOverride.MoneyAccount,
        accountOverride: REFUND_TO,
        refundTo: REFUND_TO,
      },
    ]);
  });

  it('only sets refundTo on withdraw', () => {
    const { messenger, configs } = setup();
    setTransactionConfigForMmPay(
      messenger,
      TX_ID,
      REFUND_TO,
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
        tokenAddress: TOKEN,
        chainId: CHAIN_IDS.ARBITRUM,
      },
    ]);
  });
});
