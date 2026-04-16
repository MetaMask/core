import { Messenger } from '@metamask/messenger';
import {
  ExecutionService,
  ExecutionServiceMessenger,
  NodeThreadExecutionService,
} from '@metamask/snaps-controllers/node';
import { Duplex } from 'stream';

import { InitializationConfiguration } from '../types';

export const executionService: InitializationConfiguration<
  ExecutionService,
  ExecutionServiceMessenger
> = {
  name: 'ExecutionService',
  init: ({ messenger, createProviderRpc }) => {
    function setupSnapProvider(snapId: string, stream: Duplex) {
      createProviderRpc(stream);
    }

    const instance = new NodeThreadExecutionService({
      messenger,
      setupSnapProvider,
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'ExecutionService', never, never, typeof parent>({
      namespace: 'ExecutionService',
      parent,
    }),
};
