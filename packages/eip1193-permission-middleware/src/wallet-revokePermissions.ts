import {
  Caip25EndowmentPermissionName,
  EndowmentTypes,
  RestrictedMethods,
} from '@metamask/chain-agnostic-permission';
import type {
  AsyncJsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
} from '@metamask/json-rpc-engine';
import { invalidParams, MethodNames } from '@metamask/permission-controller';
import {
  isNonEmptyArray,
  type Json,
  type JsonRpcRequest,
  type PendingJsonRpcResponse,
} from '@metamask/utils';

export const revokePermissionsHandler = {
  methodNames: [MethodNames.RevokePermissions],
  implementation: revokePermissionsImplementation,
  hookNames: {
    revokePermissionsForOrigin: true,
    updateCaveat: true,
  },
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
 * @returns Nothing.
 */
function revokePermissionsImplementation(
  req: JsonRpcRequest<Json[]>,
  res: PendingJsonRpcResponse<Json>,
  _next: AsyncJsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  {
    revokePermissionsForOrigin,
  }: {
    revokePermissionsForOrigin: (permissionKeys: string[]) => void;
  },
) {
  const { params } = req;

  const param = params?.[0];

  if (!param) {
    return end(invalidParams({ data: { request: req } }));
  }

  // For now, this API revokes the entire permission key
  // even if caveats are specified.
  const permissionKeys = Object.keys(param).filter(
    (name) => name !== Caip25EndowmentPermissionName,
  );

  if (!isNonEmptyArray(permissionKeys)) {
    return end(invalidParams({ data: { request: req } }));
  }

  const caip25EquivalentPermissions: string[] = [
    RestrictedMethods.EthAccounts,
    EndowmentTypes.PermittedChains,
  ];
  const relevantPermissionKeys = permissionKeys.filter(
    (name: string) => !caip25EquivalentPermissions.includes(name),
  );

  const shouldRevokeLegacyPermission =
    relevantPermissionKeys.length !== permissionKeys.length;

  if (shouldRevokeLegacyPermission) {
    relevantPermissionKeys.push(Caip25EndowmentPermissionName);
  }

  revokePermissionsForOrigin(relevantPermissionKeys);

  res.result = null;

  return end();
}
