/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { AccountsControllerGetAccountByAddressAction } from '@metamask/accounts-controller';

export const getAccountByAddress = <
  MessengerType extends {
    call(
      action: AccountsControllerGetAccountByAddressAction['type'],
      address: string,
    ): ReturnType<AccountsControllerGetAccountByAddressAction['handler']>;
  },
>(
  messenger: MessengerType,
  address: string,
) => {
  return messenger.call('AccountsController:getAccountByAddress', address);
};
