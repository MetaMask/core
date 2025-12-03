import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import {
  type JsonRpcRequest,
  type PendingJsonRpcResponse,
  type Hex,
  getErrorMessage,
} from '@metamask/utils';

import { DELEGATION_INDICATOR_PREFIX } from './constants';
import type { GetAccountUpgradeStatusParams } from './types';
import { GetAccountUpgradeStatusParamsStruct } from './types';
import { validateParams, validateAndNormalizeAddress } from './utils';

export type WalletGetAccountUpgradeStatusHooks = {
  getCurrentChainIdForDomain: (origin: string) => Hex | null;
  getCode: (address: string, networkClientId: string) => Promise<string | null>;
  getSelectedNetworkClientIdForChain: (chainId: string) => string | null;
  getPermittedAccountsForOrigin: (origin: string) => Promise<string[]>;
  isEip7702Supported: (request: { address: string; chainId: Hex }) => Promise<{
    isSupported: boolean;
    upgradeContractAddress?: string;
  }>;
};

const isAccountUpgraded = async (
  address: string,
  networkClientId: string,
  getCode: (address: string, networkClientId: string) => Promise<string | null>,
): Promise<{ isUpgraded: boolean; upgradedAddress: Hex | null }> => {
  const code = await getCode(address, networkClientId);
  if (!code || code === '0x' || code.length <= 2) {
    return { isUpgraded: false, upgradedAddress: null };
  }

  if (!code.startsWith(DELEGATION_INDICATOR_PREFIX)) {
    return { isUpgraded: false, upgradedAddress: null };
  }

  const expectedLength = DELEGATION_INDICATOR_PREFIX.length + 40; // 0xef0100 + 40 hex chars
  if (code.length !== expectedLength) {
    return { isUpgraded: false, upgradedAddress: null };
  }

  // Extract the 20-byte address (40 hex characters after the prefix)
  const upgradedAddress = `0x${code.slice(8, 48)}` as const;

  return { isUpgraded: true, upgradedAddress };
};

/**
 * The RPC method handler middleware for `wallet_getAccountUpgradeStatus`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks required for account upgrade status checking.
 */
export async function walletGetAccountUpgradeStatus(
  req: JsonRpcRequest<GetAccountUpgradeStatusParams> & { origin: string },
  res: PendingJsonRpcResponse,
  hooks: WalletGetAccountUpgradeStatusHooks,
): Promise<void> {
  const { params, origin } = req;

  // Validate parameters using Superstruct
  validateParams(params, GetAccountUpgradeStatusParamsStruct);

  const { account, chainId } = params;

  // Validate and normalize the account address with authorization check
  const normalizedAccount = await validateAndNormalizeAddress(
    account,
    origin,
    hooks.getPermittedAccountsForOrigin,
  );

  // Use current chain ID if not provided
  let targetChainId: Hex;
  if (chainId !== undefined) {
    targetChainId = chainId;
  } else {
    const currentChainIdForDomain = hooks.getCurrentChainIdForDomain(origin);
    if (!currentChainIdForDomain) {
      throw rpcErrors.invalidParams({
        message: `Could not determine current chain ID for origin: ${origin}`,
      });
    }
    targetChainId = currentChainIdForDomain;
  }

  const { isSupported } = await hooks.isEip7702Supported({
    address: normalizedAccount,
    chainId: targetChainId,
  });

  if (!isSupported) {
    res.result = {
      isSupported,
      account: normalizedAccount,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: targetChainId,
    };
    return;
  }

  try {
    // Get the network configuration for the target chain
    const hexChainId = targetChainId;
    const networkClientId =
      hooks.getSelectedNetworkClientIdForChain(hexChainId);

    if (!networkClientId) {
      throw rpcErrors.invalidParams({
        message: `Network client ID not found for chain ID ${targetChainId}`,
      });
    }

    // Check if the account is upgraded using the EIP7702 utils
    const { isUpgraded, upgradedAddress } = await isAccountUpgraded(
      normalizedAccount,
      networkClientId,
      hooks.getCode,
    );

    res.result = {
      isSupported,
      account: normalizedAccount,
      isUpgraded,
      upgradedAddress,
      chainId: targetChainId,
    };
  } catch (error) {
    // Re-throw RPC errors as-is
    if (error instanceof JsonRpcError) {
      throw error;
    }
    throw rpcErrors.internal({
      message: `Failed to get account upgrade status: ${getErrorMessage(error)}`,
    });
  }
}
