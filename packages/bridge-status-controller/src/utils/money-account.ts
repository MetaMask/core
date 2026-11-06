import type { BridgeStatusControllerMessenger } from '../types.js';

export const getPrimaryMoneyAccount = (
  messenger: BridgeStatusControllerMessenger,
) => {
  return messenger.call('MoneyAccountController:getMoneyAccount') as
    | { address: `0x${string}` }
    | undefined;
};
