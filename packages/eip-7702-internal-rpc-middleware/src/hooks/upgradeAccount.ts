import { toHex } from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import { tuple } from '@metamask/superstruct';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import type {
  UpgradeAccountParams,
  UpgradeAccountResult,
  UpgradeAccountHooks,
} from '../types';
import { UpgradeAccountParamsStruct } from '../types';
import { validateParams, validateAndNormalizeAddress } from '../utils';

/**
 * Upgrades an EOA account to a smart account using EIP-7702.
 *
 * @param req - The JSON-RPC request object containing the upgrade parameters.
 * @param _res - The JSON-RPC response object (unused).
 * @param options - Configuration object containing required functions.
 * @param options.upgradeAccount - Function to perform the account upgrade.
 * @param options.getCurrentChainIdForDomain - Function to get the current chain ID for a domain.
 * @param options.isEip7702Supported - Function to check if EIP-7702 is supported.
 * @param options.getAccounts - Function to get accounts for the requester.
 * @returns Promise that resolves to the upgrade result containing transaction hash and delegation info.
 */
export async function upgradeAccount(
  req: JsonRpcRequest<Json[]> & { origin: string },
  _res: PendingJsonRpcResponse,
  {
    upgradeAccount: upgradeAccountFn,
    getCurrentChainIdForDomain,
    isEip7702Supported,
    getAccounts,
  }: UpgradeAccountHooks,
): Promise<UpgradeAccountResult> {
  const { params, origin } = req;

  // Validate parameters using Superstruct
  validateParams(params, tuple([UpgradeAccountParamsStruct]));

  const [upgradeParams] = params as [UpgradeAccountParams];
  const { account, chainId } = upgradeParams;

  // Validate and normalize the account address with authorization check
  const normalizedAccount = await validateAndNormalizeAddress(account, req, {
    getAccounts,
  });

  // Use current chain ID if not provided
  let targetChainId: number;
  if (chainId !== undefined) {
    targetChainId = chainId;
  } else {
    const currentChainIdForDomain = getCurrentChainIdForDomain(origin);
    if (!currentChainIdForDomain) {
      throw rpcErrors.invalidParams({
        message: `No network configuration found for origin: ${origin}`,
      });
    }
    targetChainId = parseInt(currentChainIdForDomain, 16);
  }

  try {
    // Get the EIP7702 network configuration for the target chain
    const hexChainId = toHex(targetChainId);
    const atomicBatchSupport = await isEip7702Supported({
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
    const result = await upgradeAccountFn(
      normalizedAccount,
      upgradeContractAddress,
      targetChainId,
    );

    return {
      transactionHash: result.transactionHash,
      upgradedAccount: normalizedAccount,
      delegatedTo: result.delegatedTo,
    };
  } catch (error) {
    // Re-throw RPC errors as-is
    if (error && typeof error === 'object' && 'code' in error) {
      throw error as unknown as Error;
    }
    throw rpcErrors.internal({
      message: `Failed to upgrade account: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
