import { encodeSingle, decodeSingle } from '@metamask/abi-utils';
import { decodeDelegations, hashDelegation } from '@metamask/delegation-core';
import type { Delegation } from '@metamask/delegation-core';
import { bytesToHex, getChecksumAddress, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { DeployedContractsByName } from './decodePermission/types';
import {
  extractExpiryFromCaveatTerms,
  getChecksumEnforcersByChainId,
} from './decodePermission/utils';
import { controllerLog } from './logger';
import type {
  PermissionInfoWithMetadata,
  GatorPermissionStatus,
} from './types';

/** Function selector for `DelegationManager.disabledDelegations(bytes32)`. */
const DISABLED_DELEGATIONS_SELECTOR = '0x2d40d052';

/**
 * Minimal EIP-1193 provider used for permission status RPCs.
 */
export type PermissionStatusEip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

/**
 * Resolves an RPC provider for the given EIP-155 `chainId` (hex).
 */
export type GetProviderForChainId = (
  chainId: Hex,
) => Promise<PermissionStatusEip1193Provider>;

export type PermissionOnChainStatusOptions = {
  getProviderForChainId: GetProviderForChainId;
  contractsByChainId: Record<number, DeployedContractsByName>;
};

/**
 * ABI-encodes a call to `DelegationManager.disabledDelegations(bytes32)`.
 *
 * @param delegationHash - Delegation struct hash (bytes32).
 * @returns Calldata hex string (selector + encoded argument).
 */
export function encodeDisabledDelegationsCalldata(delegationHash: Hex): Hex {
  const encodedArgs = bytesToHex(encodeSingle('bytes32', delegationHash));
  return `${DISABLED_DELEGATIONS_SELECTOR}${encodedArgs.slice(2)}`;
}

/**
 * Reads `disabledDelegations(delegationHash)` from the delegation manager.
 *
 * @param args - Arguments.
 * @param args.provider - JSON-RPC provider for the permission's chain.
 * @param args.delegationManager - DelegationManager contract address.
 * @param args.delegationHash - Hash of the leaf delegation.
 * @returns Whether the delegation is disabled on-chain.
 */
export async function readDelegationDisabledOnChain({
  provider,
  delegationManager,
  delegationHash,
}: {
  provider: PermissionStatusEip1193Provider;
  delegationManager: Hex;
  delegationHash: Hex;
}): Promise<boolean> {
  const data = encodeDisabledDelegationsCalldata(delegationHash);
  const raw = (await provider.request({
    method: 'eth_call',
    params: [{ to: delegationManager, data }, 'latest'],
  })) as Hex;
  return decodeSingle('bool', raw);
}

/**
 * Returns the latest block's timestamp in seconds.
 *
 * @param provider - JSON-RPC provider for the chain.
 * @returns Unix timestamp in seconds.
 */
export async function readLatestBlockTimestampSeconds(
  provider: PermissionStatusEip1193Provider,
): Promise<number> {
  const block = (await provider.request({
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  })) as { timestamp?: Hex };
  if (!block?.timestamp) {
    throw new Error('Latest block missing timestamp');
  }
  return hexToNumber(block.timestamp);
}

/**
 * Reads TimestampEnforcer expiry (unix seconds) from the leaf delegation's caveats.
 *
 * @param leaf - Leaf delegation (index 0 when decoded from permission context).
 * @param contracts - Deployed enforcer addresses for the chain.
 * @returns Expiry timestamp in seconds, or `null` if no valid timestamp caveat.
 */
export function getExpiryFromDelegation(
  leaf: Delegation<Hex>,
  contracts: DeployedContractsByName,
): number | null {
  const { timestampEnforcer } = getChecksumEnforcersByChainId(contracts);
  const targetEnforcer = getChecksumAddress(timestampEnforcer).toLowerCase();
  const timestampCaveat = leaf.caveats.find(
    (caveat) =>
      getChecksumAddress(caveat.enforcer).toLowerCase() === targetEnforcer,
  );
  if (!timestampCaveat?.terms) {
    return null;
  }
  try {
    return extractExpiryFromCaveatTerms(timestampCaveat.terms);
  } catch {
    return null;
  }
}

/**
 * Recomputes {@link PermissionStatus} for one granted permission using chain state.
 *
 * @param entry - Granted permission row (including merged `status` from the prior sync).
 * @param options - `getProviderForChainId` and deployment map for the framework version.
 * @returns The same entry with an updated `status`.
 */
export async function resolveGrantedPermissionOnChainStatus(
  entry: PermissionInfoWithMetadata,
  options: PermissionOnChainStatusOptions,
): Promise<PermissionInfoWithMetadata> {
  if (entry.revocationMetadata) {
    return { ...entry, status: 'Revoked' };
  }

  const originalStatus: GatorPermissionStatus = entry.status ?? 'Active';

  try {
    const delegations = decodeDelegations(entry.permissionResponse.context);

    if (delegations.length !== 1) {
      throw new Error(
        'Unexpected delegations length in decoded permission context',
      );
    }
    const delegation = delegations[0];
    const delegationHash = hashDelegation(delegation);

    const provider = await options.getProviderForChainId(
      entry.permissionResponse.chainId,
    );

    const isDisabled = await readDelegationDisabledOnChain({
      provider,
      delegationManager: entry.permissionResponse.delegationManager,
      delegationHash,
    });

    if (isDisabled) {
      return { ...entry, status: 'Revoked' };
    }

    const chainId = hexToNumber(entry.permissionResponse.chainId);
    const contracts = options.contractsByChainId[chainId];
    if (!contracts) {
      return { ...entry, status: originalStatus };
    }
    const expiry = getExpiryFromDelegation(delegation, contracts);
    if (expiry === null) {
      return { ...entry, status: 'Active' };
    }
    const blockTimestamp = await readLatestBlockTimestampSeconds(provider);
    if (blockTimestamp >= expiry) {
      return { ...entry, status: 'Expired' };
    }
    return { ...entry, status: 'Active' };
  } catch (error) {
    controllerLog('Failed to resolve permission status', error);
    return { ...entry, status: originalStatus };
  }
}

/**
 * Recomputes status for all granted permissions in parallel.
 *
 * @param grantedPermissions - Rows returned from the permissions provider snap.
 * @param options - Provider factory and deployment map.
 * @returns Same rows with updated `status` fields.
 */
export async function updateGrantedPermissionsStatus(
  grantedPermissions: PermissionInfoWithMetadata[],
  options: PermissionOnChainStatusOptions,
): Promise<PermissionInfoWithMetadata[]> {
  return Promise.all(
    grantedPermissions.map((row) =>
      resolveGrantedPermissionOnChainStatus(row, options),
    ),
  );
}
