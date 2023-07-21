import type { GetPermissionsHooks } from './getPermissions';
import { getPermissionsHandler } from './getPermissions';
import type { RequestPermissionsHooks } from './requestPermissions';
import { requestPermissionsHandler } from './requestPermissions';

export type PermittedRpcMethodHooks = RequestPermissionsHooks &
  GetPermissionsHooks;

export const handlers = [
  requestPermissionsHandler,
  getPermissionsHandler,
] as const;
