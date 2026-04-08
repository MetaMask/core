import {
  ActionConstraint,
  EventConstraint,
  Messenger,
} from '@metamask/messenger';

export type RootMessenger<
  AllowedActions extends ActionConstraint = ActionConstraint,
  AllowedEvents extends EventConstraint = EventConstraint,
> = Messenger<'Root', AllowedActions, AllowedEvents>;

export type WalletOptions = {
  infuraProjectId: string;
  clientVersion: string;
  showApprovalRequest: () => void;
};
