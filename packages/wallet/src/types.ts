import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

export type WalletOptions = {
  state?: Record<string, Record<string, Json>>;
  infuraProjectId: string;
  clientVersion: string;
  prevClientVersion?: string;
  fetch?: typeof globalThis.fetch;
  showApprovalRequest: () => void;
  clientConfigApiService: ClientConfigApiService;
  getMetaMetricsId: () => string;
  logger?: Pick<Console, 'info'>;
};
