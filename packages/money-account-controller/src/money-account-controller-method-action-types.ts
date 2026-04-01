import type { MoneyAccountController } from './MoneyAccountController';

export type MoneyAccountControllerCreateMoneyAccountAction = {
  type: `MoneyAccountController:createMoneyAccount`;
  handler: MoneyAccountController['createMoneyAccount'];
};

export type MoneyAccountControllerGetMoneyAccountAction = {
  type: `MoneyAccountController:getMoneyAccount`;
  handler: MoneyAccountController['getMoneyAccount'];
};

export type MoneyAccountControllerMethodActions =
  | MoneyAccountControllerCreateMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction;
