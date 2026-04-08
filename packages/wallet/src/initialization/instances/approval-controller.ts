import {
  ApprovalController,
  ApprovalControllerMessenger,
} from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';

export const approvalController: InitializationConfiguration<
  ApprovalController,
  ApprovalControllerMessenger
> = {
  name: 'ApprovalController',
  init: ({ state, messenger, options }) => {
    const instance = new ApprovalController({
      state,
      messenger,
      showApprovalRequest: options.showApprovalRequest,
      typesExcludedFromRateLimiting: [
        ApprovalType.PersonalSign,
        ApprovalType.EthSignTypedData,
        ApprovalType.Transaction,
        ApprovalType.WatchAsset,
        ApprovalType.EthGetEncryptionPublicKey,
        ApprovalType.EthDecrypt,

        // Exclude Smart TX Status Page from rate limiting to allow sequential
        // transactions.
        'smartTransaction:showSmartTransactionStatusPage',

        // Allow one flavor of snap_dialog to be queued.
        'snap_dialog',
      ],
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'ApprovalController', never, never, typeof parent>({
      namespace: 'ApprovalController',
      parent,
    }),
};
