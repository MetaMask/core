import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';

import { GatorPermissionsProviderError } from './errors';
import { GatorPermissionsControllerMessenger } from './GatorPermissionsController';
import { utilsLog } from './logger';
import type { GatorPermissionsSnapRpcMethod } from './types';

/**
 * Executes an RPC request against a Snap and returns the typed response.
 *
 * @param params - The parameters for the request.
 * @param params.messenger - Messenger that supports SnapController:handleRequest.
 * @param params.snapId - The Snap ID to target.
 * @param params.method - The RPC method name (e.g. permissionsProvider_getGrantedPermissions).
 * @param params.params - Optional JSON-serializable params for the method.
 * @returns A promise that resolves with the Snap's response (typed by caller).
 * @throws {GatorPermissionsProviderError} If the Snap request fails.
 */
export async function executeSnapRpc<TReturn = unknown>({
  messenger,
  snapId,
  method,
  params,
}: {
  messenger: GatorPermissionsControllerMessenger;
  snapId: SnapId;
  method: GatorPermissionsSnapRpcMethod | string;
  params?: Json;
}): Promise<TReturn> {
  try {
    const response = await messenger.call('SnapController:handleRequest', {
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        jsonrpc: '2.0',
        method,
        ...(params !== undefined && { params }),
      },
    });
    return response as TReturn;
  } catch (error) {
    utilsLog('Snap RPC request failed', { method, error });
    throw new GatorPermissionsProviderError({
      method: method as GatorPermissionsSnapRpcMethod,
      cause: error as Error,
    });
  }
}
