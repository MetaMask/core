import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types';
import type { NetworkControllerInstanceOptions } from './initialization/instances/network-controller/types';
import type { RemoteFeatureFlagControllerInstanceOptions } from './initialization/instances/remote-feature-flag-controller/types';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types';
import type { TransactionControllerInstanceOptions } from './initialization/instances/transaction-controller/types';
import type { InitializationConfiguration } from './initialization/types';

export type WalletOptions = {
  messenger?: RootMessenger<DefaultActions, DefaultEvents>;
  state?: Record<string, Record<string, Json> | undefined>;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
  instanceOptions: InstanceSpecificOptions;
  /**
   * An optional logger used to emit initialization diagnostics. When provided,
   * a breadcrumb is logged immediately after each controller's `init()`
   * completes, in initialization order. Defaults to no output.
   */
  logger?: Pick<Console, 'info'>;
};

export type InstanceSpecificOptions = {
  approvalController?: ApprovalControllerInstanceOptions;
  connectivityController: ConnectivityControllerInstanceOptions;
  keyringController?: KeyringControllerInstanceOptions;
  networkController: NetworkControllerInstanceOptions;
  remoteFeatureFlagController: RemoteFeatureFlagControllerInstanceOptions;
  storageService: StorageServiceInstanceOptions;
  transactionController?: TransactionControllerInstanceOptions;
};
