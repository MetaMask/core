import { Messenger } from '@metamask/messenger';
import { InitializationConfiguration } from '../../types';
import { PasskeyController, PasskeyControllerMessenger } from '@metamask/passkey-controller';

const DEFAULT_PASSKEY_RP_NAME = 'MetaMask';
const DEFAULT_PASSKEY_USER_NAME = 'MetaMask Wallet';
const DEFAULT_PASSKEY_USER_DISPLAY_NAME = 'MetaMask Wallet';

export const passkeyController: InitializationConfiguration<PasskeyController, PasskeyControllerMessenger> = {
  name: 'PasskeyController',
  init: ({ state, messenger, options }) => new PasskeyController({
    messenger,
    state,
    rpId: undefined,
    rpName: options.rpName ?? DEFAULT_PASSKEY_RP_NAME,
    expectedRPID: options.expectedRPID,
    expectedOrigin: options.expectedOrigin,
    userName: options.userName ?? DEFAULT_PASSKEY_USER_NAME,
    userDisplayName: options.userDisplayName ?? DEFAULT_PASSKEY_USER_DISPLAY_NAME,
  }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'PasskeyController',
      parent,
    }),
}
