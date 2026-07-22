import {
  ClaimsController,
  type ClaimsControllerMessenger,
} from '@metamask/claims-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const claimsController: InitializationConfiguration<
  ClaimsController,
  ClaimsControllerMessenger
> = {
  name: 'ClaimsController',
  init: ({ state, messenger }) =>
    new ClaimsController({
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: ClaimsControllerMessenger = new Messenger({
      namespace: 'ClaimsController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'ClaimsService:fetchClaimsConfigurations',
        'ClaimsService:getRequestHeaders',
        'ClaimsService:getClaimsApiUrl',
        'ClaimsService:generateMessageForClaimSignature',
        'ClaimsService:getClaims',
        'KeyringController:signPersonalMessage',
      ],
    });

    return messenger;
  },
};
