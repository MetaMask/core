import { rpcErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { upgradeAccount } from '../hooks/upgradeAccount';
import type { UpgradeAccountHooks } from '../types';

/**
 * The RPC method handler middleware for `wallet_upgradeAccount`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks object containing upgrade functionality.
 */
export async function walletUpgradeAccount(
  req: JsonRpcRequest<Json[]> & { origin: string },
  res: PendingJsonRpcResponse,
  hooks: UpgradeAccountHooks,
): Promise<void> {
  if (!hooks.upgradeAccount) {
    throw rpcErrors.methodNotSupported();
  }

  const result = await upgradeAccount(req, res, hooks);
  res.result = result;
}
