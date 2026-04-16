import { Messenger } from '@metamask/messenger';
import {
  ExecutionService,
  ExecutionServiceMessenger,
  NodeThreadExecutionService,
} from '@metamask/snaps-controllers/node';

import { InitializationConfiguration } from '../types';

export const executionService: InitializationConfiguration<
  ExecutionService,
  ExecutionServiceMessenger
> = {
  name: 'ExecutionService',
  init: ({ messenger }) => {
    const instance = new NodeThreadExecutionService({
      messenger,
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
