import {
  requestPermissionsHandler,
  RequestPermissionsHooks,
} from './requestPermissions';
import { getPermissionsHandler, GetPermissionsHooks } from './getPermissions';

export type PermittedRpcMethodHooks = RequestPermissionsHooks &
  GetPermissionsHooks;

export const handlers: [
  typeof requestPermissionsHandler,
  typeof getPermissionsHandler,
] = [requestPermissionsHandler, getPermissionsHandler];
