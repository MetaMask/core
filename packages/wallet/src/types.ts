import { KeyringControllerOptions } from '@metamask/keyring-controller';
import { StorageAdapter } from '@metamask/storage-service';
import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults';
import { GenericEncryptor } from './initialization/instances/keyring-controller';
import { InitializationConfiguration } from './initialization/types';

export type WalletOptions = {
  messenger?: RootMessenger<DefaultActions, DefaultEvents>;
  state?: Record<string, Record<string, Json> | undefined>;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
  instanceOptions: InstanceSpecificOptions;
};

export type InstanceSpecificOptions = {
  keyringController?: {
    encryptor?: GenericEncryptor;
    keyringBuilders?: KeyringControllerOptions['keyringBuilders'];
    keyringV2Builders?: KeyringControllerOptions['keyringV2Builders'];
  };
  storageService: {
    storage: StorageAdapter;
  };
};
