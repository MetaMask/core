import { getPermissionsHandler, GetPermissionsHooks } from './getPermissions';
import {
  requestPermissionsHandler,
  RequestPermissionsHooks,
} from './requestPermissions';

export type PermittedRpcMethodHooks = RequestPermissionsHooks &
  GetPermissionsHooks;

export const handlers = [requestPermissionsHandler, getPermissionsHandler];
