import { describe, expect, it } from 'vitest';

import type { BridgeStatusControllerMessenger } from '../types.js';
import { getPrimaryMoneyAccount } from './money-account.js';

const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111';
const MONEY_ACCOUNT_ID = 'money-account-id';

const messenger = ({
  moneyAccount = { id: MONEY_ACCOUNT_ID, address: MONEY_ACCOUNT },
}: {
  moneyAccount?: { id?: string; address?: string } | undefined;
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
  it('returns the money account id and address', () => {
    expect(getPrimaryMoneyAccount(messenger())).toStrictEqual({
      id: MONEY_ACCOUNT_ID,
      address: MONEY_ACCOUNT,
    });
  });

  it('returns undefined when the money account id is missing', () => {
    expect(
      getPrimaryMoneyAccount(
        messenger({ moneyAccount: { address: MONEY_ACCOUNT } }),
      ),
    ).toBeUndefined();
  });
});
