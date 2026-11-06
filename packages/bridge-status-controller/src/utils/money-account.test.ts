import { describe, expect, it } from 'vitest';

import type { BridgeStatusControllerMessenger } from '../types.js';
import { getPrimaryMoneyAccount } from './money-account.js';

const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111';

const messenger = ({
  moneyAccount = { address: MONEY_ACCOUNT },
}: {
  account?: { id: string; address: string } | undefined;
  moneyAccount?: { address?: string } | undefined;
  flags?: Record<string, unknown>;
} = {}): BridgeStatusControllerMessenger =>
  ({
    call: (action: string) => {
      switch (action) {
        case 'MoneyAccountController:getMoneyAccount':
          return moneyAccount;
        default:
      }
    },
  }) as BridgeStatusControllerMessenger;

describe('getPrimaryMoneyAccount', () => {
  it('returns the money account for a depositor id', () => {
    expect(getPrimaryMoneyAccount(messenger())).toStrictEqual({
      address: MONEY_ACCOUNT,
    });
  });
});
