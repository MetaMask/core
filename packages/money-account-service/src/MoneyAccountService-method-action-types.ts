import type { MoneyAccountService } from './MoneyAccountService';

export type MoneyAccountServiceCreateMoneyAccountAction = {
  type: `MoneyAccountService:createMoneyAccount`;
  handler: MoneyAccountService['createMoneyAccount'];
};

export type MoneyAccountServiceMethodActions =
  MoneyAccountServiceCreateMoneyAccountAction;
