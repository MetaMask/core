import { MethodNames } from '@metamask/permission-controller';

import { getPermissionsHandler } from './wallet-getPermissions';
import { requestPermissionsHandler } from './wallet-requestPermissions';
import { revokePermissionsHandler } from './wallet-revokePermissions';

type MethodHandlers = {
  [MethodNames.GetPermissions]: typeof getPermissionsHandler;
  [MethodNames.RequestPermissions]: typeof requestPermissionsHandler;
  [MethodNames.RevokePermissions]: typeof revokePermissionsHandler;
};

export const methodHandlers: Readonly<MethodHandlers> = {
  [MethodNames.GetPermissions]: getPermissionsHandler,
  [MethodNames.RequestPermissions]: requestPermissionsHandler,
  [MethodNames.RevokePermissions]: revokePermissionsHandler,
};
