import type { MoneyAccountService } from './MoneyAccountService';

export type MoneyAccountServiceCreateMoneyAccountAction = {
  type: `MoneyAccountService:createMoneyAccount`;
  handler: MoneyAccountService['createMoneyAccount'];
};

export type MoneyAccountServiceGetMoneyAccountAction = {
  type: `MoneyAccountService:getMoneyAccount`;
  handler: MoneyAccountService['getMoneyAccount'];
};

export type MoneyAccountServiceMethodActions =
  | MoneyAccountServiceCreateMoneyAccountAction
  | MoneyAccountServiceGetMoneyAccountAction;
