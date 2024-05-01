import type { JsonRpcEngineEndCallback } from '@metamask/json-rpc-engine';
import {
  isNonEmptyArray,
  type Json,
  type JsonRpcRequest,
  type NonEmptyArray,
  type PendingJsonRpcResponse,
} from '@metamask/utils';

import { invalidParams } from '../errors';
import type { PermissionConstraint } from '../Permission';
import type { PermittedHandlerExport } from '../utils';
import { MethodNames } from '../utils';

export const revokePermissionsHandler: PermittedHandlerExport<
  RevokePermissionsHooks,
  RevokePermissionArgs,
  null
> = {
  methodNames: [MethodNames.revokePermissions],
  implementation: revokePermissionsImplementation,
  hookNames: {
    revokePermissionsForOrigin: true,
  },
};

export type RevokePermissionArgs = Record<
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
 * @param options.revokePermissionsForOrigin - A hook that revokes given permission keys for an origin
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

  const param = params?.[0];

  if (!param) {
    return end(invalidParams({ data: { request: req } }));
  }

  // For now, this API revokes the entire permission key
  // even if caveats are specified.
  const permissionKeys = Object.keys(param);

  if (!isNonEmptyArray(permissionKeys)) {
    return end(invalidParams({ data: { request: req } }));
  }

  revokePermissionsForOrigin(permissionKeys);

  res.result = null;

  return end();
}
