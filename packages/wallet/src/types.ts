import {
  ActionConstraint,
  EventConstraint,
  Messenger,
} from '@metamask/messenger';
import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';

export type RootMessenger<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AllowedActions extends ActionConstraint = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AllowedEvents extends EventConstraint = any,
> = Messenger<'Root', AllowedActions, AllowedEvents>;

export type WalletOptions = {
  infuraProjectId: string;
  clientVersion: string;
  showApprovalRequest: () => void;
  clientConfigApiService: ClientConfigApiService;
  getMetaMetricsId: () => string;
};
