import {
  ApprovalController,
  ApprovalControllerMessenger,
} from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../../types';

/**
 * The baseline of approval types whose pending requests are exempt from
 * per-origin rate limiting, so multiple requests of the same type can be queued
 * from one origin. Covers the EVM signing (`personal_sign`,
 * `eth_signTypedData`), transaction, asset-watch (`wallet_watchAsset`), and
 * encryption (`eth_getEncryptionPublicKey`, `eth_decrypt`) approval types, plus
 * `snap_dialog` — the union of what the extension and mobile exempt that is
 * stable across both. Their smart-transaction status type is intentionally left
 * out: its string differs per platform, so clients inject it themselves.
 *
 * Clients can override this entirely via
 * `instanceOptions.approvalController.typesExcludedFromRateLimiting`.
 */
const DEFAULT_TYPES_EXCLUDED_FROM_RATE_LIMITING = [
  ApprovalType.PersonalSign,
  ApprovalType.EthSignTypedData,
  ApprovalType.Transaction,
  ApprovalType.WatchAsset,
  ApprovalType.EthGetEncryptionPublicKey,
  ApprovalType.EthDecrypt,
  // `snap_dialog` (the `DIALOG_APPROVAL_TYPES.default` value from
  // `@metamask/snaps-rpc-methods`); hardcoded as a literal to avoid depending on
  // the snaps package for a single constant while `SnapController` isn't wired
  // into the wallet yet.
  'snap_dialog',
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
