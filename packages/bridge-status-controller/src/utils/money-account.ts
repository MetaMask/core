import type { BridgeStatusControllerMessenger } from '../types.js';

export const getPrimaryMoneyAccount = (
  messenger: BridgeStatusControllerMessenger,
): { id: string; address: `0x${string}` } | undefined => {
  const moneyAccount = messenger.call('MoneyAccountController:getMoneyAccount');
  if (!moneyAccount?.id || !moneyAccount.address) {
    return undefined;
  }
  return {
    id: moneyAccount.id,
    address: moneyAccount.address as `0x${string}`,
  };
};
