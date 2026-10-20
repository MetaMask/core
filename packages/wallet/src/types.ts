import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults.js';
import type { AnalyticsControllerInstanceOptions } from './initialization/instances/analytics-controller/types.js';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types.js';
import type { ClaimsServiceInstanceOptions } from './initialization/instances/claims-service/types.js';
import type { ConfigRegistryApiServiceInstanceOptions } from './initialization/instances/config-registry-api-service/types.js';
import type { ConfigRegistryControllerInstanceOptions } from './initialization/instances/config-registry-controller/types.js';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types.js';
import type { GasFeeControllerInstanceOptions } from './initialization/instances/gas-fee-controller/types.js';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types.js';
import type { NetworkControllerInstanceOptions } from './initialization/instances/network-controller/types.js';
import type { PasskeyControllerInstanceOptions } from './initialization/instances/passkey-controller/types.js';
import type { PermissionControllerInstanceOptions } from './initialization/instances/permission-controller/types.js';
import type { RemoteFeatureFlagControllerInstanceOptions } from './initialization/instances/remote-feature-flag-controller/types.js';
import type { SeedlessOnboardingControllerInstanceOptions } from './initialization/instances/seedless-onboarding-controller/types.js';
import type { SelectedNetworkControllerInstanceOptions } from './initialization/instances/selected-network-controller/types.js';
import type { ShieldApiServiceInstanceOptions } from './initialization/instances/shield-api-service/types.js';
import type { ShieldControllerInstanceOptions } from './initialization/instances/shield-controller/types.js';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types.js';
import type { SubscriptionControllerInstanceOptions } from './initialization/instances/subscription-controller/types.js';
import type { SubscriptionServiceInstanceOptions } from './initialization/instances/subscription-service/types.js';
import type { TransactionControllerInstanceOptions } from './initialization/instances/transaction-controller/types.js';
import type { AnyInitializationConfiguration } from './initialization/types.js';

export type WalletOptions = {
  messenger?: RootMessenger<DefaultActions, DefaultEvents>;
  state?: Record<string, Record<string, Json> | undefined>;
  initializationConfigurations?: AnyInitializationConfiguration[];
  instanceOptions: InstanceSpecificOptions;
};

export type InstanceSpecificOptions = {
  analyticsController: AnalyticsControllerInstanceOptions;
  approvalController?: ApprovalControllerInstanceOptions;
  claimsService?: ClaimsServiceInstanceOptions;
  configRegistryApiService: ConfigRegistryApiServiceInstanceOptions;
  configRegistryController?: ConfigRegistryControllerInstanceOptions;
  connectivityController: ConnectivityControllerInstanceOptions;
  gasFeeController: GasFeeControllerInstanceOptions;
  keyringController?: KeyringControllerInstanceOptions;
  networkController: NetworkControllerInstanceOptions;
  remoteFeatureFlagController: RemoteFeatureFlagControllerInstanceOptions;
  storageService: StorageServiceInstanceOptions;
  subscriptionService?: SubscriptionServiceInstanceOptions;
  subscriptionController?: SubscriptionControllerInstanceOptions;
  transactionController?: TransactionControllerInstanceOptions;
  passkeyController?: PasskeyControllerInstanceOptions;
  permissionController?: PermissionControllerInstanceOptions;
  seedlessOnboardingController?: SeedlessOnboardingControllerInstanceOptions;
  selectedNetworkController: SelectedNetworkControllerInstanceOptions;
  shieldApiService?: ShieldApiServiceInstanceOptions;
  shieldController?: ShieldControllerInstanceOptions;
};
