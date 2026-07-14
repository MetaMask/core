import { Messenger } from '@metamask/messenger';
import { StorageService } from '@metamask/storage-service';
import { StorageServiceMessenger } from '@metamask/storage-service';

import { InitializationConfiguration } from '../../types';

export const storageService: InitializationConfiguration<
  StorageService,
  StorageServiceMessenger
> = {
  name: 'StorageService',
  init: ({ messenger, options }) =>
    new StorageService({
      messenger,
      storage: options.storage,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'StorageService',
      parent,
    }),
};
