import { getPermissionsHandler } from './wallet-getPermissions';
import { requestPermissionsHandler } from './wallet-requestPermissions';
import { revokePermissionsHandler } from './wallet-revokePermissions';

type MethodHandlers = typeof getPermissionsHandler &
  typeof requestPermissionsHandler &
  typeof revokePermissionsHandler;

export const methodHandlers: Readonly<MethodHandlers> = {
  ...getPermissionsHandler,
  ...requestPermissionsHandler,
  ...revokePermissionsHandler,
} as const;
