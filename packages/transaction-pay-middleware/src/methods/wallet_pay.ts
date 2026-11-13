import type { StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex, PendingJsonRpcResponse } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

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
 * flags and the account, selects the requested account, then adds the
 * transaction for the requesting dapp and waits for its hash.
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

  assertAmountAllowed(flow, request.amount);

  await assertPermittedAccount(hooks, request.from);
  await flow.assertPreconditions?.(messenger);

  const transaction = flow.build(request);
  const networkClientId = getNetworkClientId(messenger, transaction.chainId);

  selectAccount(messenger, request.from);

  const hash = await addTransaction(
    messenger,
    transaction,
    networkClientId,
    req,
  );

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

function assertAmountAllowed(
  flow: WalletPayFlow,
  amount: string | undefined,
): void {
  if (
    amount !== undefined &&
    !flow.allowZeroAmount &&
    new BigNumber(amount).isZero()
  ) {
    throw walletPayErrors.invalidParams('amount - Expected a positive amount');
  }
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

/**
 * Selects the requested account, so the confirmation shows the balances and
 * data of the account the transaction is sent from. Runs only once every other
 * check has passed, so an invalid request never changes the selected account.
 *
 * @param messenger - The middleware messenger.
 * @param from - The requested account.
 */
function selectAccount(
  messenger: TransactionPayMiddlewareMessenger,
  from: Hex,
): void {
  const account = messenger.call(
    'AccountsController:getAccountByAddress',
    from,
  );

  if (!account) {
    throw walletPayErrors.unauthorizedAccount();
  }

  const selectedAccount = messenger.call(
    'AccountsController:getSelectedAccount',
  );

  if (account.id === selectedAccount.id) {
    return;
  }

  messenger.call(
    'AccountTreeController:setSelectedAccountGroupByAccountId',
    account.id,
  );
}

async function addTransaction(
  messenger: TransactionPayMiddlewareMessenger,
  { transactionParams, type, skipInitialGasEstimate }: WalletPayTransaction,
  networkClientId: string,
  req: WalletPayJsonRpcRequest,
): Promise<string> {
  const { result } = await messenger.call(
    'TransactionController:addTransaction',
    transactionParams,
    {
      networkClientId,
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
