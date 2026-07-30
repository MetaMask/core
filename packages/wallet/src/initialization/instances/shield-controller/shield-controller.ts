import { Messenger } from '@metamask/messenger';
import type { ShieldControllerMessenger } from '@metamask/shield-controller';
import {
  createShieldRemoteBackend,
  ShieldController,
} from '@metamask/shield-controller';

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
      backend:
        options.backend ??
        createShieldRemoteBackend({
          messenger,
          env: options.env,
          fetch: options.fetchFunction,
          getAccessToken: options.getAccessToken,
          captureException: options.captureException,
          getCoverageResultTimeout: options.getCoverageResultTimeout,
          getCoverageResultPollInterval: options.getCoverageResultPollInterval,
        }),
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
      actions: ['AuthenticationController:getBearerToken'],
      events: [
        // ShieldController subscribes to :stateChange internally; the
        // delegation must match until those controllers migrate to :stateChanged.
        // eslint-disable-next-line no-restricted-syntax
        'TransactionController:stateChange',
        // eslint-disable-next-line no-restricted-syntax
        'SignatureController:stateChange',
      ],
    });

    return messenger;
  },
};
