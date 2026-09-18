import {
  ApprovalController,
  ApprovalControllerMessenger,
} from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../../types.js';

/**
 * Approval types that are exempt from per-origin rate limiting, so more than one
 * request of the same type can be pending at once. These are the common EVM
 * types: signing, transactions, watch-asset, and encryption.
 *
 * Clients can replace this list via
 * `instanceOptions.approvalController.typesExcludedFromRateLimiting` — the
 * extension and mobile pass their own. `snap_dialog` will be added here once the
 * wallet wires `SnapController`.
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
      showApprovalRequest:
        options.showApprovalRequest ?? ((): void => undefined),
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
