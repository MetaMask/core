import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults.js';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types.js';
import type { ClaimsControllerInstanceOptions } from './initialization/instances/claims-controller/types.js';
import type { ClaimsServiceInstanceOptions } from './initialization/instances/claims-service/types.js';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types.js';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types.js';
import type { NetworkControllerInstanceOptions } from './initialization/instances/network-controller/types.js';
import type { PasskeyControllerInstanceOptions } from './initialization/instances/passkey-controller/types.js';
import type { RemoteFeatureFlagControllerInstanceOptions } from './initialization/instances/remote-feature-flag-controller/types.js';
import type { SeedlessOnboardingControllerInstanceOptions } from './initialization/instances/seedless-onboarding-controller/types.js';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types.js';
import type { TransactionControllerInstanceOptions } from './initialization/instances/transaction-controller/types.js';
import type { InitializationConfiguration } from './initialization/types.js';

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
  claimsService: ClaimsServiceInstanceOptions;
  claimsController?: ClaimsControllerInstanceOptions;
  connectivityController: ConnectivityControllerInstanceOptions;
  keyringController?: KeyringControllerInstanceOptions;
  networkController: NetworkControllerInstanceOptions;
  remoteFeatureFlagController: RemoteFeatureFlagControllerInstanceOptions;
  storageService: StorageServiceInstanceOptions;
  transactionController?: TransactionControllerInstanceOptions;
  passkeyController?: PasskeyControllerInstanceOptions;
  seedlessOnboardingController?: SeedlessOnboardingControllerInstanceOptions;
};
