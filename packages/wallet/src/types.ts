import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';

export type WalletOptions = {
  infuraProjectId: string;
  clientVersion: string;
  showApprovalRequest: () => void;
  clientConfigApiService: ClientConfigApiService;
  getMetaMetricsId: () => string;
};
