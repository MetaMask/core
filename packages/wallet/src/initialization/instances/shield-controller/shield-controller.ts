import { Messenger } from '@metamask/messenger';
import type { ShieldControllerMessenger } from '@metamask/shield-controller';
import {
  ShieldController,
  ShieldRemoteBackend,
} from '@metamask/shield-controller';
import type { ShieldControllerState } from '@metamask/shield-controller';

import type { InitializationConfiguration } from '../../types.js';
import type {
  ShieldBackend,
  ShieldControllerInitializationMessenger,
  ShieldControllerInstanceOptions,
} from './types.js';

export type {
  ShieldControllerInitializationMessenger,
  ShieldControllerInstanceOptions,
} from './types.js';

function resolveShieldBackend(
  messenger: ShieldControllerInitializationMessenger,
  options: ShieldControllerInstanceOptions,
): ShieldBackend {
  if (options.backend) {
    return options.backend;
  }

  const getAccessToken =
    options.getAccessToken ??
    ((): Promise<string> =>
      messenger.call('AuthenticationController:getBearerToken'));

  return new ShieldRemoteBackend({
    baseUrl: options.baseUrl,
    fetch: options.fetchFunction,
    getAccessToken,
    captureException: options.captureException,
    getCoverageResultTimeout: options.getCoverageResultTimeout,
    getCoverageResultPollInterval: options.getCoverageResultPollInterval,
  });
}

export const shieldController: InitializationConfiguration<
  ShieldController,
  ShieldControllerInitializationMessenger
> = {
  name: 'ShieldController',
  init: ({
    state,
    messenger,
    options,
  }: {
    state: Partial<ShieldControllerState> | undefined;
    messenger: ShieldControllerInitializationMessenger;
    options: ShieldControllerInstanceOptions;
  }) => {
    return new ShieldController({
      messenger: messenger as unknown as ShieldControllerMessenger,
      state,
      backend: resolveShieldBackend(messenger, options),
      transactionHistoryLimit: options.transactionHistoryLimit,
      coverageHistoryLimit: options.coverageHistoryLimit,
      normalizeSignatureRequest: options.normalizeSignatureRequest,
    });
  },
  getMessenger: (parent) => {
    const messenger: ShieldControllerInitializationMessenger = new Messenger({
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
