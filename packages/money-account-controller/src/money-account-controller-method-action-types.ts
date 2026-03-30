import type { MoneyAccountController } from './MoneyAccountController';

export type MoneyAccountControllerGetMoneyAccountAction = {
  type: `MoneyAccountController:getMoneyAccount`;
  handler: MoneyAccountController['getMoneyAccount'];
};

export type MoneyAccountControllerMethodActions =
  MoneyAccountControllerGetMoneyAccountAction;
