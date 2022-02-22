import type {
  JsonRpcEngineEndCallback,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import type { PermittedHandlerExport } from '../../util';
import { MethodNames } from '../utils';

import type { PermissionConstraint } from '../Permission';
import type { SubjectPermissions } from '../PermissionController';

export const getPermissionsHandler: PermittedHandlerExport<
  GetPermissionsHooks,
  void,
  PermissionConstraint[]
> = {
  methodNames: [MethodNames.getPermissions],
  implementation: getPermissionsImplementation,
  hookNames: {
    getPermissionsForOrigin: true,
  },
};

export type GetPermissionsHooks = {
  // This must be bound to the requesting origin.
  getPermissionsForOrigin: () => SubjectPermissions<PermissionConstraint>;
};

/**
 * Get Permissions implementation to be used in JsonRpcEngine middleware.
 *
 * @param _req - The JsonRpcEngine request - unused
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.getPermissionsForOrigin - The specific method hook needed for this method implementation
 * @returns A promise that resolves to nothing
 */
async function getPermissionsImplementation(
  _req: unknown,
  res: PendingJsonRpcResponse<PermissionConstraint[]>,
  _next: unknown,
  end: JsonRpcEngineEndCallback,
  { getPermissionsForOrigin }: GetPermissionsHooks,
): Promise<void> {
  res.result = Object.values(getPermissionsForOrigin() || {});
  return end();
}
