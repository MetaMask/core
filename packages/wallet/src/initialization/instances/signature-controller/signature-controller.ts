import { Messenger } from '@metamask/messenger';
import type { SignatureControllerMessenger } from '@metamask/signature-controller';
import { SignatureController } from '@metamask/signature-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { SignatureControllerInstanceOptions } from './types.js';

export const signatureController: InitializationConfiguration<
  SignatureController,
  SignatureControllerMessenger
> = {
  name: 'SignatureController',
  reference: SignatureController,
  init: ({ state, messenger, options }) =>
    new SignatureController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: SignatureControllerMessenger = new Messenger({
      namespace: 'SignatureController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getState',
        'ApprovalController:addRequest',
        'GatorPermissionsController:decodePermissionFromPermissionContextForOrigin',
        'KeyringController:signMessage',
        'KeyringController:signPersonalMessage',
        'KeyringController:signTypedMessage',
        'LoggingController:add',
        'NetworkController:getNetworkClientById',
      ],
    });

    return messenger;
  },
};
