import type { RemoteFeatureFlagController } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './initialization/defaults';
import type { ApprovalControllerInstanceOptions } from './initialization/instances/approval-controller/types';
import type { ConnectivityControllerInstanceOptions } from './initialization/instances/connectivity-controller/types';
import type { KeyringControllerInstanceOptions } from './initialization/instances/keyring-controller/types';
import type { StorageServiceInstanceOptions } from './initialization/instances/storage-service/types';
import { InitializationConfiguration } from './initialization/types';

type RemoteFeatureFlagControllerOptions = ConstructorParameters<
  typeof RemoteFeatureFlagController
>[0];

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
  // The wallet injects neutral defaults for `clientConfigApiService` (a
  // network-free service that returns no flags), `getMetaMetricsId` (`''`), and
  // `clientVersion` (`'0.0.0'`) when omitted, so a headless consumer can pass
  // `{}`. The remaining options merely tune behavior and fall through to the
  // controller's own defaults when omitted.
  remoteFeatureFlagController?: {
    clientConfigApiService?: RemoteFeatureFlagControllerOptions['clientConfigApiService'];
    getMetaMetricsId?: RemoteFeatureFlagControllerOptions['getMetaMetricsId'];
    clientVersion?: RemoteFeatureFlagControllerOptions['clientVersion'];
    prevClientVersion?: RemoteFeatureFlagControllerOptions['prevClientVersion'];
    fetchInterval?: RemoteFeatureFlagControllerOptions['fetchInterval'];
    disabled?: RemoteFeatureFlagControllerOptions['disabled'];
  };
  storageService: StorageServiceInstanceOptions;
};
