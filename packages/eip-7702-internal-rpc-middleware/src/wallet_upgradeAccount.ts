import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import { tuple } from '@metamask/superstruct';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
  Hex,
} from '@metamask/utils';

import type {
  UpgradeAccountParams,
  UpgradeAccountResult,
} from './types';
import { UpgradeAccountParamsStruct } from './types';
import { validateParams, validateAndNormalizeAddress } from './utils';

export type WalletUpgradeAccountDependencies = {
  upgradeAccount: jest.MockedFunction<(
    address: string,
    upgradeContractAddress: string,
    chainId?: Hex,
  ) => Promise<{ transactionHash: string; delegatedTo: string }>>;
  getCurrentChainIdForDomain: jest.MockedFunction<(origin: string) => Hex | null>;
  isEip7702Supported: jest.MockedFunction<(request: {
    address: string;
    chainIds: string[];
  }) => Promise<
    {
      chainId: string;
      isSupported: boolean;
      delegationAddress?: string;
      upgradeContractAddress?: string;
    }[]
  >>;
  getAccounts: jest.MockedFunction<(req: JsonRpcRequest) => Promise<string[]>>;
};

/**
 * The RPC method handler middleware for `wallet_upgradeAccount`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param dependencies - The dependencies required for account upgrade functionality.
 */
export async function walletUpgradeAccount(
  req: JsonRpcRequest<Json[]> & { origin: string },
  res: PendingJsonRpcResponse,
  dependencies: WalletUpgradeAccountDependencies,
): Promise<void> {
  const { params, origin } = req;

  // Validate parameters using Superstruct
  validateParams(params, tuple([UpgradeAccountParamsStruct]));

  const [upgradeParams] = params as [UpgradeAccountParams];
  const { account, chainId } = upgradeParams;

  // Validate and normalize the account address with authorization check
  const normalizedAccount = await validateAndNormalizeAddress(account, req, {
    getAccounts: dependencies.getAccounts,
  });

  // Use current chain ID if not provided
  let targetChainId: Hex;
  if (chainId !== undefined) {
    targetChainId = chainId;
  } else {
    const currentChainIdForDomain = dependencies.getCurrentChainIdForDomain(origin);
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
    const atomicBatchSupport = await dependencies.isEip7702Supported({
      address: normalizedAccount,
      chainIds: [hexChainId],
    });

    const atomicBatchChainSupport = atomicBatchSupport.find(
      (result) => result.chainId.toLowerCase() === hexChainId.toLowerCase(),
    );

    const isChainSupported =
      atomicBatchChainSupport &&
      (!atomicBatchChainSupport.delegationAddress ||
        atomicBatchChainSupport.isSupported);

    if (!isChainSupported || !atomicBatchChainSupport?.upgradeContractAddress) {
      throw rpcErrors.invalidParams({
        message: `Account upgrade not supported on chain ID ${targetChainId}`,
      });
    }

    const { upgradeContractAddress } = atomicBatchChainSupport;

    // Perform the upgrade using existing EIP-7702 functionality
    const result = await dependencies.upgradeAccount(
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
