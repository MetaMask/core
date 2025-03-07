import type { GetPermissionsHooks } from './getPermissions';
import { legacyGetPermissionsHandler } from './getPermissions';
import type { RequestPermissionsHooks } from './requestPermissions';
import { legacyRequestPermissionsHandler } from './requestPermissions';
import type { RevokePermissionsHooks } from './revokePermissions';
import { legacyRevokePermissionsHandler } from './revokePermissions';

export type PermittedRpcMethodHooks = RequestPermissionsHooks &
  GetPermissionsHooks &
  RevokePermissionsHooks;

export const legacyHandlers = [
  legacyRequestPermissionsHandler,
  legacyGetPermissionsHandler,
  legacyRevokePermissionsHandler,
] as const;
