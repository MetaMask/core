import type { StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex, PendingJsonRpcResponse } from '@metamask/utils';

import { walletPayErrors } from '../errors.js';
import { getWalletPayFlow } from '../flows/index.js';
import { WalletPayParamsStruct } from '../types.js';
import type {
  TransactionPayMiddlewareMessenger,
  WalletPayFlow,
  WalletPayHooks,
  WalletPayJsonRpcRequest,
  WalletPayRequest,
  WalletPayResult,
  WalletPayTransaction,
} from '../types.js';
import { isWalletPayTypeAllowed } from '../utils/feature-flags.js';

// Some providers resolve with this placeholder when there is no hash.
const FALLBACK_TRANSACTION_HASH = '0x0';

/**
 * The RPC method handler for `wallet_pay`: validates the request, checks the
 * flags and the account, then adds the transaction for the requesting dapp and
 * waits for its hash.
 *
 * @param req - The JSON-RPC request.
 * @param res - The pending JSON-RPC response.
 * @param hooks - Client hooks.
 * @param messenger - The middleware messenger.
 */
export async function walletPay(
  req: WalletPayJsonRpcRequest,
  res: PendingJsonRpcResponse,
  hooks: WalletPayHooks,
  messenger: TransactionPayMiddlewareMessenger,
): Promise<void> {
  const request = validateRequest(req.params);
  const flow = getAllowedFlow(messenger, req.origin, request.type);

  await assertPermittedAccount(hooks, request.from);
  await flow.assertPreconditions?.(messenger);

  const hash = await addTransaction(messenger, flow.build(request), req);

  const result: WalletPayResult =
    hash && hash !== FALLBACK_TRANSACTION_HASH
      ? { transactionHash: hash as Hex }
      : {};

  res.result = result;
}

function validateRequest(params: unknown): WalletPayRequest {
  const [error, validated] = validate(params, WalletPayParamsStruct);

  if (error) {
    throw walletPayErrors.invalidParams(formatValidationError(error));
  }

  return validated[0];
}

function getAllowedFlow(
  messenger: TransactionPayMiddlewareMessenger,
  origin: string,
  transactionType: string,
): WalletPayFlow {
  const flow = getWalletPayFlow(transactionType);
  const { remoteFeatureFlags } = messenger.call(
    'RemoteFeatureFlagController:getState',
  );

  if (
    !flow ||
    !isWalletPayTypeAllowed(remoteFeatureFlags, origin, transactionType) ||
    !(flow.isEnabled?.(remoteFeatureFlags) ?? true)
  ) {
    throw walletPayErrors.unsupportedType(transactionType);
  }

  return flow;
}

async function assertPermittedAccount(
  hooks: WalletPayHooks,
  from: Hex,
): Promise<void> {
  const permittedAccounts = await hooks.getPermittedAccountsForOrigin();
  const isPermitted = permittedAccounts.some(
    (account) => account.toLowerCase() === from.toLowerCase(),
  );

  if (!isPermitted) {
    throw walletPayErrors.unauthorizedAccount();
  }
}

async function addTransaction(
  messenger: TransactionPayMiddlewareMessenger,
  {
    chainId,
    transactionParams,
    type,
    skipInitialGasEstimate,
  }: WalletPayTransaction,
  req: WalletPayJsonRpcRequest,
): Promise<string> {
  const { result } = await messenger.call(
    'TransactionController:addTransaction',
    transactionParams,
    {
      networkClientId: getNetworkClientId(messenger, chainId),
      origin: req.origin,
      requestId: String(req.id),
      method: req.method,
      requireApproval: true,
      type,
      skipInitialGasEstimate,
    },
  );

  return await result;
}

function getNetworkClientId(
  messenger: TransactionPayMiddlewareMessenger,
  chainId: Hex,
): string {
  try {
    return messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );
  } catch {
    throw walletPayErrors.networkUnavailable(chainId);
  }
}

function formatValidationError(error: StructError): string {
  return error
    .failures()
    .map(
      ({ path, message }) =>
        `${path.join(' > ')}${path.length ? ' - ' : ''}${message}`,
    )
    .join('\n');
}
