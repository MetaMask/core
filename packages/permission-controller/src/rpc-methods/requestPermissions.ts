import { isPlainObject } from '@metamask/controller-utils';
import type { JsonRpcEngineEndCallback } from '@metamask/json-rpc-engine';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { invalidParams } from '../errors';
import type { PermissionConstraint, RequestedPermissions } from '../Permission';
import type { PermittedHandlerExport } from '../utils';
import { MethodNames } from '../utils';

export const requestPermissionsHandler: PermittedHandlerExport<
  RequestPermissionsHooks,
  [RequestedPermissions],
  PermissionConstraint[]
> = {
  methodNames: [MethodNames.RequestPermissions],
  implementation: requestPermissionsImplementation,
  hookNames: {
    requestPermissionsForOrigin: true,
  },
};

type RequestPermissions = (
  requestedPermissions: RequestedPermissions,
) => Promise<
  [Record<string, PermissionConstraint>, { id: string; origin: string }]
>;

export type RequestPermissionsHooks = {
  requestPermissionsForOrigin: RequestPermissions;
};

/**
 * Request Permissions implementation to be used in JsonRpcEngine middleware.
 *
 * @param req - The JsonRpcEngine request
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.requestPermissionsForOrigin - The specific method hook needed for this method implementation
 * @returns A promise that resolves to nothing
 */
async function requestPermissionsImplementation(
  req: JsonRpcRequest<[RequestedPermissions]>,
  res: PendingJsonRpcResponse<PermissionConstraint[]>,
  _next: unknown,
  end: JsonRpcEngineEndCallback,
  { requestPermissionsForOrigin }: RequestPermissionsHooks,
): Promise<void> {
  const { params } = req;

  if (!Array.isArray(params) || !isPlainObject(params[0])) {
    return end(invalidParams({ data: { request: req } }));
  }

  const [requestedPermissions] = params;
  const [grantedPermissions] = await requestPermissionsForOrigin(
    requestedPermissions,
  );

  // `wallet_requestPermission` is specified to return an array.
  res.result = Object.values(grantedPermissions);
  return end();
}
