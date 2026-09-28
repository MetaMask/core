import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

const contractsByVersion = DELEGATOR_CONTRACTS as Record<
  string,
  Record<number, unknown> | undefined
>;

/**
 * Whether the newest published DeleGator deployment includes this chain.
 *
 * Relay execute builds a delegation against those contracts. A chain that is
 * allowlisted but missing here cannot complete an execute quote.
 *
 * @param chainId - Chain ID as hex, decimal number, or decimal string.
 * @returns Whether DeleGator contracts are published for the chain.
 */
export function chainHasDeleGatorContracts(
  chainId: Hex | number | string,
): boolean {
  const numericChainId =
    typeof chainId === 'number' ? chainId : Number(chainId);

  if (!Number.isFinite(numericChainId)) {
    return false;
  }

  const newestVersion = Object.keys(contractsByVersion).sort().at(-1);
  const contracts = newestVersion
    ? contractsByVersion[newestVersion]
    : undefined;

  return Boolean(contracts?.[numericChainId]);
}
