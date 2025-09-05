import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { GetCapabilitiesStruct } from '../constants';
import type { GetCapabilitiesHook } from '../types';
import { validateAndNormalizeKeyholder, validateParams } from '../utils';

/**
 *
 * @param req a
 * @param res a
 * @param param2 s
 * @param param2.getAccounts s
 * @param param2.getCapabilities a
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
