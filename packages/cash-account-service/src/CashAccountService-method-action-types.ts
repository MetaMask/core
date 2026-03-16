import type { CashAccountService } from './CashAccountService';

export type CashAccountServiceCreateCashAccountAction = {
  type: `CashAccountService:createCashAccount`;
  handler: CashAccountService['createCashAccount'];
};

export type CashAccountServiceMethodActions =
  CashAccountServiceCreateCashAccountAction;
