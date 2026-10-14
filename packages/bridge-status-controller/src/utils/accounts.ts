/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BridgeStatusControllerMessenger } from '../types.js';

export const getAccountByAddress = (
  messenger: BridgeStatusControllerMessenger,
  address: string,
) => {
  return messenger.call('AccountsController:getAccountByAddress', address);
};
