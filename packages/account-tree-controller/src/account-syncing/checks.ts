// import type { AccountTreeControllerMessenger } from 'src/types';

export const isMultichainAccountSyncingEnabled =
  () // messenger: AccountTreeControllerMessenger,
  : boolean => {
    return true;

    // This will get uncommented when this PR is merged:
    // https://github.com/MetaMask/core/pull/6215

    // return messenger.call(
    //   'UserStorageController:getIsMultichainAccountSyncingEnabled',
    // );
  };
