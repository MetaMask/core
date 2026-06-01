import {
  ApprovalController,
  ApprovalControllerMessenger,
} from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';

/**
 * The platform-agnostic baseline of approval types whose pending requests are
 * exempt from per-origin rate limiting, allowing multiple requests of these EVM
 * signing/transaction types to be queued from the same origin.
 *
 * Clients can override this entirely via
 * `instanceOptions.approvalController.typesExcludedFromRateLimiting`. The set
 * differs per platform — the extension and mobile each append client-specific
 * types (e.g. their smart-transaction status page and `snap_dialog`), and even
 * use different string values for the same concept — so there is no single
 * correct list to hardcode here.
 */
const DEFAULT_TYPES_EXCLUDED_FROM_RATE_LIMITING = [
  ApprovalType.PersonalSign,
  ApprovalType.EthSignTypedData,
  ApprovalType.Transaction,
  ApprovalType.WatchAsset,
  ApprovalType.EthGetEncryptionPublicKey,
  ApprovalType.EthDecrypt,
];

export const approvalController: InitializationConfiguration<
  ApprovalController,
  ApprovalControllerMessenger
> = {
  name: 'ApprovalController',
  init: ({ state, messenger, options }) =>
    new ApprovalController({
      state,
      messenger,
      // The consumer supplies the callback that surfaces a pending request to
      // the user; default to a no-op so the controller works headlessly (this
      // matches mobile, which drives approvals through state; the extension
      // injects its own).
      showApprovalRequest: options.showApprovalRequest ?? ((): void => undefined),
      typesExcludedFromRateLimiting:
        options.typesExcludedFromRateLimiting ??
        DEFAULT_TYPES_EXCLUDED_FROM_RATE_LIMITING,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'ApprovalController',
      parent,
    }),
};
