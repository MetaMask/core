import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { GetCapabilitiesStruct } from '../types';
import type { GetCapabilitiesHook } from '../types';
import { validateAndNormalizeKeyholder, validateParams } from '../utils';

/**
 * The RPC method handler middleware for `wallet_getCapabilities`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks object.
 * @param hooks.getAccounts - Function that retrieves available accounts.
 * @param hooks.getCapabilities - Function that retrieves the capabilities for atomic transactions on specified chains.
 */
export async function walletGetCapabilities(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse,
  {
    getAccounts,
    getCapabilities,
  }: {
    getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
    getCapabilities?: GetCapabilitiesHook;
  },
): Promise<void> {
  if (!getCapabilities) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, GetCapabilitiesStruct);

  const address = req.params[0];
  const chainIds = req.params[1];

  await validateAndNormalizeKeyholder(address, req, {
    getAccounts,
  });

  const capabilities = await getCapabilities(address, chainIds, req);

  res.result = capabilities;
}
