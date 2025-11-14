import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Hex,
} from '@metamask/utils';

import type { UpgradeAccountParams } from './types';
import { UpgradeAccountParamsStruct } from './types';
import { validateParams, validateAndNormalizeAddress } from './utils';

export type WalletUpgradeAccountHooks = {
  upgradeAccount: (
    address: string,
    upgradeContractAddress: string,
    chainId?: Hex,
  ) => Promise<{ transactionHash: string; delegatedTo: string }>;
  getCurrentChainIdForDomain: (origin: string) => Hex | null;
  isEip7702Supported: (request: { address: string; chainId: Hex }) => Promise<{
    isSupported: boolean;
    upgradeContractAddress?: string;
  }>;
  getPermittedAccountsForOrigin: (origin: string) => Promise<string[]>;
};

/**
 * The RPC method handler middleware for `wallet_upgradeAccount`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks required for account upgrade functionality.
 */
export async function walletUpgradeAccount(
  req: JsonRpcRequest<UpgradeAccountParams> & { origin: string },
  res: PendingJsonRpcResponse,
  hooks: WalletUpgradeAccountHooks,
): Promise<void> {
  const { params, origin } = req;

  // Validate parameters using Superstruct
  validateParams(params, UpgradeAccountParamsStruct);

  const { account, chainId } = params;

  // Validate and normalize the account address with authorization check
  const normalizedAccount = await validateAndNormalizeAddress(
    account,
    origin,
    hooks.getPermittedAccountsForOrigin,
  );

  // Use current app selected chain ID if not passed as a param
  let targetChainId: Hex;
  if (chainId !== undefined) {
    targetChainId = chainId;
  } else {
    const currentChainIdForDomain = hooks.getCurrentChainIdForDomain(origin);
    if (!currentChainIdForDomain) {
      throw rpcErrors.invalidParams({
        message: `No network configuration found for origin: ${origin}`,
      });
    }
    targetChainId = currentChainIdForDomain;
  }

  try {
    // Get the EIP7702 network configuration for the target chain
    const hexChainId = targetChainId;
    const { isSupported, upgradeContractAddress } =
      await hooks.isEip7702Supported({
        address: normalizedAccount,
        chainId: hexChainId,
      });

    if (!isSupported) {
      throw rpcErrors.invalidParams({
        message: `Account upgrade not supported on chain ID ${targetChainId}`,
      });
    }

    if (!upgradeContractAddress) {
      throw rpcErrors.invalidParams({
        message: `No upgrade contract address available for chain ID ${targetChainId}`,
      });
    }

    // Perform the upgrade using existing EIP-7702 functionality
    const result = await hooks.upgradeAccount(
      normalizedAccount,
      upgradeContractAddress,
      targetChainId,
    );

    res.result = {
      transactionHash: result.transactionHash,
      upgradedAccount: normalizedAccount,
      delegatedTo: result.delegatedTo,
    };
  } catch (error) {
    // Re-throw RPC errors as-is
    if (error instanceof JsonRpcError) {
      throw error;
    }
    throw rpcErrors.internal({
      message: `Failed to upgrade account: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
