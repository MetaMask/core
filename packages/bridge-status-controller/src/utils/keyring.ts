import type { Intent } from '@metamask/bridge-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';

import type { BridgeStatusControllerMessenger } from '../types';

export const signTypedMessage = async ({
  messenger,
  accountAddress,
  typedData,
}: {
  messenger: BridgeStatusControllerMessenger;
  accountAddress: string;
  typedData: Intent['typedData'];
}): Promise<string> => {
  return await messenger.call(
    'KeyringController:signTypedMessage',
    {
      from: accountAddress,
      data: typedData,
    },
    SignTypedDataVersion.V4,
  );
};
