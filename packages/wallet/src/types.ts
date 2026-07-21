import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
<<<<<<< HEAD
} from './initialization/defaults';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types';
import type { NetworkControllerInstanceOptions } from './initialization/instances/network-controller/types';
import { PasskeyControllerInstanceOptions } from './initialization/instances/passkey-controller/types';
import type { RemoteFeatureFlagControllerInstanceOptions } from './initialization/instances/remote-feature-flag-controller/types';
import { SeedlessOnboardingControllerInstanceOptions } from './initialization/instances/seedless-onboarding-controller/types';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types';
import type { TransactionControllerInstanceOptions } from './initialization/instances/transaction-controller/types';
import type { InitializationConfiguration } from './initialization/types';
=======
} from './initialization/defaults.js';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types.js';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types.js';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types.js';
import type { NetworkControllerInstanceOptions } from './initialization/instances/network-controller/types.js';
import type { RemoteFeatureFlagControllerInstanceOptions } from './initialization/instances/remote-feature-flag-controller/types.js';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types.js';
import type { TransactionControllerInstanceOptions } from './initialization/instances/transaction-controller/types.js';
import type { InitializationConfiguration } from './initialization/types.js';
>>>>>>> origin/main

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
  connectivityController: ConnectivityControllerInstanceOptions;
  keyringController?: KeyringControllerInstanceOptions;
  networkController: NetworkControllerInstanceOptions;
  passkeyController?: PasskeyControllerInstanceOptions;
  remoteFeatureFlagController: RemoteFeatureFlagControllerInstanceOptions;
  seedlessOnboardingController?: SeedlessOnboardingControllerInstanceOptions;
  storageService: StorageServiceInstanceOptions;
  transactionController?: TransactionControllerInstanceOptions;
};
