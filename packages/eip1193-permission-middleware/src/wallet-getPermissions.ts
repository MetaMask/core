import type { Caip25CaveatValue } from '@metamask/chain-agnostic-permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getPermittedEthChainIds,
} from '@metamask/chain-agnostic-permission';
import type {
  AsyncJsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
} from '@metamask/json-rpc-engine';
import {
  type CaveatSpecificationConstraint,
  MethodNames,
  type PermissionController,
  type PermissionSpecificationConstraint,
} from '@metamask/permission-controller';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { CaveatTypes, EndowmentTypes, RestrictedMethods } from './types';

export const getPermissionsHandler = {
  methodNames: [MethodNames.GetPermissions],
  implementation: getPermissionsImplementation,
  hookNames: {
    getPermissionsForOrigin: true,
    getAccounts: true,
  },
};

/**
 * Get Permissions implementation to be used in JsonRpcEngine middleware, specifically for `wallet_getPermissions` RPC method.
 * It makes use of a CAIP-25 endowment permission returned by `getPermissionsForOrigin` hook, if it exists.
 *
 * @param _req - The JsonRpcEngine request - unused
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.getPermissionsForOrigin - The specific method hook needed for this method implementation
 * @param options.getAccounts - A hook that returns the permitted eth accounts for the origin sorted by lastSelected.
 * @returns A promise that resolves to nothing
 */
async function getPermissionsImplementation(
  _req: JsonRpcRequest<Json[]>,
  res: PendingJsonRpcResponse<Json>,
  _next: AsyncJsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  {
    getPermissionsForOrigin,
    getAccounts,
  }: {
    getPermissionsForOrigin: () => ReturnType<
      PermissionController<
        PermissionSpecificationConstraint,
        CaveatSpecificationConstraint
      >['getPermissions']
    >;
    getAccounts: (options?: { ignoreLock?: boolean }) => string[];
  },
) {
  const permissions = { ...getPermissionsForOrigin() };
  const caip25Endowment = permissions[Caip25EndowmentPermissionName];
  const caip25CaveatValue = caip25Endowment?.caveats?.find(
    ({ type }) => type === Caip25CaveatType,
  )?.value as Caip25CaveatValue | undefined;
  delete permissions[Caip25EndowmentPermissionName];

  if (caip25CaveatValue) {
    // We cannot derive ethAccounts directly from the CAIP-25 permission
    // because the accounts will not be in order of lastSelected
    const ethAccounts = getAccounts({ ignoreLock: true });

    if (ethAccounts.length > 0) {
      permissions[RestrictedMethods.EthAccounts] = {
        ...caip25Endowment,
        parentCapability: RestrictedMethods.EthAccounts,
        caveats: [
          {
            type: CaveatTypes.RestrictReturnedAccounts,
            value: ethAccounts,
          },
        ],
      };
    }

    const ethChainIds = getPermittedEthChainIds(caip25CaveatValue);

    if (ethChainIds.length > 0) {
      permissions[EndowmentTypes.PermittedChains] = {
        ...caip25Endowment,
        parentCapability: EndowmentTypes.PermittedChains,
        caveats: [
          {
            type: CaveatTypes.RestrictNetworkSwitching,
            value: ethChainIds,
          },
        ],
      };
    }
  }

  res.result = Object.values(permissions);
  return end();
}
