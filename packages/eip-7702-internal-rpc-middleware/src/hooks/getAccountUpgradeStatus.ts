import { toHex } from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import { tuple } from '@metamask/superstruct';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
  Hex,
} from '@metamask/utils';

import type {
  GetAccountUpgradeStatusParams,
  GetAccountUpgradeStatusResult,
  GetAccountUpgradeStatusHooks,
} from '../types';
import { GetAccountUpgradeStatusParamsStruct } from '../types';
import { validateParams, validateAndNormalizeAddress } from '../utils';

const isAccountUpgraded = async (
  address: string,
  networkClientId: string,
  getCode: (address: string, networkClientId: string) => Promise<string | null>,
): Promise<boolean> => {
  // This is a mock implementation - in real usage this would come from @metamask/eip7702-utils
  const code = await getCode(address, networkClientId);
  return code !== null && code !== '0x';
};

/**
 * Checks if an account has been upgraded using EIP-7702.
 *
 * @param req - The JSON-RPC request object containing the status check parameters.
 * @param _res - The JSON-RPC response object (unused).
 * @param options - Configuration object containing required functions.
 * @param options.getCurrentChainIdForDomain - Function to get the current chain ID for a domain.
 * @param options.getCode - Function to get contract code for an address.
 * @param options.getNetworkConfigurationByChainId - Function to get network configuration by chain ID.
 * @param options.getAccounts - Function to get accounts for the requester.
 * @returns Promise that resolves to the account upgrade status.
 */
export async function getAccountUpgradeStatus(
  req: JsonRpcRequest<Json[]> & { origin: string },
  _res: PendingJsonRpcResponse,
  {
    getCurrentChainIdForDomain,
    getCode,
    getNetworkConfigurationByChainId,
    getAccounts,
  }: GetAccountUpgradeStatusHooks,
): Promise<GetAccountUpgradeStatusResult> {
  const { params, origin } = req;

  // Validate parameters using Superstruct
  validateParams(params, tuple([GetAccountUpgradeStatusParamsStruct]));

  const [statusParams] = params as [GetAccountUpgradeStatusParams];
  const { account, chainId } = statusParams;

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
    // Get the network configuration for the target chain
    const hexChainId = toHex(targetChainId);
    const networkConfiguration = getNetworkConfigurationByChainId(hexChainId);

    if (!networkConfiguration) {
      throw rpcErrors.invalidParams({
        message: `Network not found for chain ID ${targetChainId}`,
      });
    }

    // Get the network client ID from the network configuration
    const { rpcEndpoints, defaultRpcEndpointIndex } = networkConfiguration;

    if (
      !rpcEndpoints ||
      defaultRpcEndpointIndex === undefined ||
      defaultRpcEndpointIndex < 0 ||
      defaultRpcEndpointIndex >= rpcEndpoints.length
    ) {
      throw rpcErrors.invalidParams({
        message: `Network configuration invalid for chain ID ${targetChainId}`,
      });
    }

    const { networkClientId } = rpcEndpoints[defaultRpcEndpointIndex];

    if (!networkClientId) {
      throw rpcErrors.invalidParams({
        message: `Network client ID not found for chain ID ${targetChainId}`,
      });
    }

    // Check if the account is upgraded using the EIP7702 utils
    const isUpgraded = await isAccountUpgraded(
      normalizedAccount as Hex,
      networkClientId,
      getCode,
    );

    return {
      account: normalizedAccount,
      isUpgraded,
      chainId: targetChainId,
    };
  } catch (error) {
    // Re-throw RPC errors as-is
    if (error && typeof error === 'object' && 'code' in error) {
      throw error as unknown as Error;
    }
    throw rpcErrors.internal({
      message: `Failed to get account upgrade status: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
