import { KeyringControllerOptions } from '@metamask/keyring-controller';
import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  InitializationConfiguration,
  RootMessenger,
} from './initialization';

export type WalletOptions = {
  messenger?: RootMessenger<DefaultActions, DefaultEvents>;
  state?: Record<string, Record<string, Json>>;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
  instanceOptions?: InstanceSpecificOptions;
};

export type InstanceSpecificOptions = {
  KeyringController?: Partial<
    Pick<KeyringControllerOptions, 'encryptor' | 'keyringBuilders'>
  >;
};
