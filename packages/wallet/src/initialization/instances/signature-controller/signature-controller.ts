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
  getMessenger: (parent) =>
    parent.buildChild({
      namespace: 'SignatureController',
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
    }),
};
