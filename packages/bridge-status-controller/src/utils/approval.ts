import type { BridgeStatusControllerMessenger } from '../types.js';

export const acceptApprovalRequest = async (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
) => {
  await messenger.call(
    'ApprovalController:acceptRequest',
    txMetaId,
    undefined,
    {
      waitForResult: true,
    },
  );
};
