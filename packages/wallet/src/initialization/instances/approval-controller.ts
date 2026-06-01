import {
  ApprovalController,
  ApprovalControllerMessenger,
} from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';

/**
 * Approval types whose pending requests are exempt from per-origin rate
 * limiting, allowing multiple requests of these EVM signing/transaction types
 * to be queued from the same origin.
 */
const typesExcludedFromRateLimiting = [
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
      // the user; default to a no-op so the controller works headlessly.
      showApprovalRequest: options.showApprovalRequest ?? ((): void => undefined),
      typesExcludedFromRateLimiting,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'ApprovalController',
      parent,
    }),
};
