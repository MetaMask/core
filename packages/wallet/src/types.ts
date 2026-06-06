import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types';
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
  approvalController?: ApprovalControllerInstanceOptions;
  keyringController?: KeyringControllerInstanceOptions;
  storageService: StorageServiceInstanceOptions;
};
