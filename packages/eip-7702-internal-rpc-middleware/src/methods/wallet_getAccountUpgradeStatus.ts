import { rpcErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { getAccountUpgradeStatus } from '../hooks/getAccountUpgradeStatus';
import type { GetAccountUpgradeStatusHooks } from '../types';

/**
 * The RPC method handler middleware for `wallet_getAccountUpgradeStatus`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks object containing status check functionality.
 */
export async function walletGetAccountUpgradeStatus(
  req: JsonRpcRequest<Json[]> & { origin: string },
  res: PendingJsonRpcResponse,
  hooks: GetAccountUpgradeStatusHooks,
): Promise<void> {
  if (!hooks.getCode) {
    throw rpcErrors.methodNotSupported();
  }

  const result = await getAccountUpgradeStatus(req, res, hooks);
  res.result = result;
}
