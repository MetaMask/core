import { Caip25EndowmentPermissionName } from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
  MethodHandler,
} from '@metamask/json-rpc-engine';
import { invalidParams } from '@metamask/permission-controller';
import type { GenericPermissionController } from '@metamask/permission-controller';
import { isNonEmptyArray } from '@metamask/utils';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { EndowmentTypes, RestrictedMethods } from './types';

export type RevokePermissionsHooks = {
  revokePermissionsForOrigin: (
    permissionKeys: string[],
  ) => ReturnType<GenericPermissionController['revokePermissions']>;
};

export type RevokePermissionsHandler = MethodHandler<
  RevokePermissionsHooks,
  never,
  Json[],
  Json,
  { origin: string }
>;

export const revokePermissionsHandler = {
  implementation: revokePermissionsImplementation,
  hookNames: {
    revokePermissionsForOrigin: true,
  },
} satisfies RevokePermissionsHandler;

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
  res: PendingJsonRpcResponse,
  _next: JsonRpcEngineNextCallback,
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
