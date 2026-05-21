import { KeyringControllerOptions } from '@metamask/keyring-controller';
import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults';
import { InitializationConfiguration } from './initialization/types';

export type WalletOptions = {
  messenger?: RootMessenger<DefaultActions, DefaultEvents>;
  state?: Record<string, Record<string, Json> | undefined>;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
  instanceOptions?: InstanceSpecificOptions;
};

export type InstanceSpecificOptions = {
  keyringController?: Partial<
    Pick<KeyringControllerOptions, 'encryptor' | 'keyringBuilders'>
  >;
};
