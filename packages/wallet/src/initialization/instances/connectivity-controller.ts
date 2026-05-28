import {
  CONNECTIVITY_STATUSES,
  ConnectivityAdapter,
  ConnectivityController,
  ConnectivityControllerMessenger,
  ConnectivityStatus,
} from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';

import type { DefaultActions, DefaultEvents, RootMessenger } from '../defaults';
import type { InitializationConfiguration } from '../types';

// TODO: For now, we assume we are always online.
class AlwaysOnlineAdapter implements ConnectivityAdapter {
  async getStatus(): Promise<ConnectivityStatus> {
    return CONNECTIVITY_STATUSES.Online;
  }

  onConnectivityChange(_callback: (status: ConnectivityStatus) => void): void {
    // no-op
  }

  destroy(): void {
    // no-op
  }
}

export const connectivityController: InitializationConfiguration<
  ConnectivityController,
  ConnectivityControllerMessenger
> = {
  name: 'ConnectivityController',
  init: ({ messenger }) =>
    new ConnectivityController({
      messenger,
      connectivityAdapter: new AlwaysOnlineAdapter(),
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) =>
    new Messenger<'ConnectivityController', never, never, typeof parent>({
      namespace: 'ConnectivityController',
      parent,
    }),
};
