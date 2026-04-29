import { Messenger } from '@metamask/messenger';
import {
  InMemoryStorageAdapter,
  StorageService,
  StorageServiceMessenger,
} from '@metamask/storage-service';

import { InitializationConfiguration } from '../types';

export const storageService: InitializationConfiguration<
  StorageService,
  StorageServiceMessenger
> = {
  name: 'StorageService',
  init: ({ messenger }) => {
    const instance = new StorageService({
      messenger,
      // TODO: Make this configurable
      storage: new InMemoryStorageAdapter(),
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'StorageService', never, never, typeof parent>({
      namespace: 'StorageService',
      parent,
    }),
};
