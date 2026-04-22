import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

export type WalletOptions = {
  state?: Record<string, Record<string, Json>>;
  infuraProjectId: string;
  clientVersion: string;
  showApprovalRequest: () => void;
  clientConfigApiService: ClientConfigApiService;
  getMetaMetricsId: () => string;
};
