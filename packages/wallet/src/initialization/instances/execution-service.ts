import { Messenger } from '@metamask/messenger';
import { SubjectType } from '@metamask/permission-controller';
import {
  ExecutionService,
  ExecutionServiceMessenger,
  NodeThreadExecutionService,
} from '@metamask/snaps-controllers/node';
import { Duplex } from 'readable-stream';

import { InitializationConfiguration } from '../types';

export const executionService: InitializationConfiguration<
  ExecutionService,
  ExecutionServiceMessenger
> = {
  name: 'ExecutionService',
  init: ({ messenger, createProviderRpc }) => {
    function setupSnapProvider(snapId: string, stream: Duplex) {
      createProviderRpc({
        origin: snapId,
        stream,
        subjectType: SubjectType.Snap,
      });
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
