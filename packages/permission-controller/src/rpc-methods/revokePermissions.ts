import { isPlainObject } from '@metamask/controller-utils';
import type { JsonRpcEngineEndCallback } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcRequest,
  NonEmptyArray,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { invalidParams } from '../errors';
import type { PermissionConstraint, RequestedPermissions } from '../Permission';
import { ExtractPermission } from '../PermissionController';
import type { PermittedHandlerExport } from '../utils';
import { MethodNames } from '../utils';

export const revokePermissionsHandler: PermittedHandlerExport<
  RevokePermissionsHooks,
  RevokePermissionArgs,
  null
> = {
  methodNames: [MethodNames.requestPermissions],
  implementation: revokePermissionsImplementation,
  hookNames: {
    revokePermissionsForOrigin: true,
  },
};

type RevokePermissionArgs = Record<
  PermissionConstraint['parentCapability'],
  Json
>;

type RevokePermissions = (
  permissions: NonEmptyArray<PermissionConstraint['parentCapability']>,
) => void;

export type RevokePermissionsHooks = {
  revokePermissionsForOrigin: RevokePermissions;
};

/**
 * Revoke Permissions implementation to be used in JsonRpcEngine middleware.
 *
 * @param req - The JsonRpcEngine request
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.revokePermissionsForOrigin - A hook that revokes given permission keys for an origin.
 * @returns A promise that resolves to nothing
 */
async function revokePermissionsImplementation(
  req: JsonRpcRequest<RevokePermissionArgs>,
  res: PendingJsonRpcResponse<null>,
  _next: unknown,
  end: JsonRpcEngineEndCallback,
  { revokePermissionsForOrigin }: RevokePermissionsHooks,
): Promise<void> {
  const { params } = req;

  if (!isPlainObject(params)) {
    return end(invalidParams({ data: { request: req } }));
  }

  // For now, this API revokes the entire permission key
  // even if caveats are specified.
  const permissionKeys = Object.keys(params);

  if (permissionKeys.length === 0) {
    return end(invalidParams({ data: { request: req } }));
  }

  revokePermissionsForOrigin(
    permissionKeys as NonEmptyArray<PermissionConstraint['parentCapability']>,
  );

  res.result = null;

  return end();
}
