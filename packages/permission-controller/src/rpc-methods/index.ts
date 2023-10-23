import type { GetPermissionsHooks } from './getPermissions';
import { getPermissionsHandler } from './getPermissions';
import type { RequestPermissionsHooks } from './requestPermissions';
import { requestPermissionsHandler } from './requestPermissions';
import { RevokePermissionsHooks, revokePermissionsHandler } from './revokePermissions';

export type PermittedRpcMethodHooks = RequestPermissionsHooks &
  GetPermissionsHooks & RevokePermissionsHooks;

export const handlers = [
  requestPermissionsHandler,
  getPermissionsHandler,
  revokePermissionsHandler,
] as const;
