import type { BridgeStatusControllerMessenger } from '../types.js';

export const getPrimaryMoneyAccount = (
  messenger: BridgeStatusControllerMessenger,
): { address: `0x${string}` } | undefined => {
  return messenger.call('MoneyAccountController:getMoneyAccount') as
    | { address: `0x${string}` }
    | undefined;
};
