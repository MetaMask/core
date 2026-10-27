/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { AccountsControllerGetAccountByAddressAction } from '../../../../accounts-controller/src/AccountsController-method-action-types.js';

export const getAccountByAddress = <
  T extends {
    call(
      action: AccountsControllerGetAccountByAddressAction['type'],
      address: string,
    ): ReturnType<AccountsControllerGetAccountByAddressAction['handler']>;
  },
>(
  messenger: T,
  address: string,
) => {
  return messenger.call('AccountsController:getAccountByAddress', address);
};
