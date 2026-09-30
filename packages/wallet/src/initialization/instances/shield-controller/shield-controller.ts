import { Messenger } from '@metamask/messenger';
import type { ShieldControllerMessenger } from '@metamask/shield-controller';
import { ShieldController } from '@metamask/shield-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { ShieldControllerInstanceOptions } from './types.js';

export const shieldController: InitializationConfiguration<
  ShieldController,
  ShieldControllerMessenger
> = {
  name: 'ShieldController',
  init: ({ state, messenger, options }) =>
    new ShieldController({
      messenger,
      state,
      transactionHistoryLimit: options.transactionHistoryLimit,
      coverageHistoryLimit: options.coverageHistoryLimit,
      normalizeSignatureRequest: options.normalizeSignatureRequest,
    }),
  getMessenger: (parent) => {
    const messenger: ShieldControllerMessenger = new Messenger({
      namespace: 'ShieldController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'ShieldApiService:checkCoverage',
        'ShieldApiService:checkSignatureCoverage',
        'ShieldApiService:logSignature',
        'ShieldApiService:logTransaction',
      ],
      events: [
        // ShieldController subscribes to :stateChange internally; the
        // delegation must match until those controllers migrate to :stateChanged.

        'TransactionController:stateChange',

        'SignatureController:stateChange',
      ],
    });

    return messenger;
  },
};
