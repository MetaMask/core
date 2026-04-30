import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { SubjectType } from '@metamask/permission-controller';
import {
  ExecutionService,
  ExecutionServiceMessenger,
  NodeThreadExecutionService,
} from '@metamask/snaps-controllers/node';
import { Duplex } from 'readable-stream';

import { WalletCreateProviderRpcAction } from '../defaults';
import { InitializationConfiguration } from '../types';

type AllowedActions =
  | MessengerActions<ExecutionServiceMessenger>
  | WalletCreateProviderRpcAction;

type AllowedEvents = MessengerEvents<ExecutionServiceMessenger>;

type WalletExecutionServiceMessenger = Messenger<
  'ExecutionService',
  AllowedActions,
  AllowedEvents
>;

export const executionService: InitializationConfiguration<
  ExecutionService,
  WalletExecutionServiceMessenger
> = {
  name: 'ExecutionService',
  init: ({ messenger }) => {
    function setupSnapProvider(snapId: string, stream: Duplex) {
      messenger.call('Wallet:createProviderRpc', {
        origin: snapId,
        stream,
        subjectType: SubjectType.Snap,
      });
    }

    const instance = new NodeThreadExecutionService({
      messenger: messenger as ExecutionServiceMessenger,
      // @ts-expect-error Type mismatch due to readable-stream types.
      setupSnapProvider,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const serviceMessenger: WalletExecutionServiceMessenger = new Messenger({
      namespace: 'ExecutionService',
      parent,
    });

    parent.delegate({
      messenger: serviceMessenger,
      actions: ['Wallet:createProviderRpc'],
    });

    return serviceMessenger;
  },
};
