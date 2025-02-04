import { BtcScope, SolScope } from '@metamask/keyring-api';
import type { CaipChainId } from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';
/**
 * Returns the chain id of the non-EVM network based on the account address.
 *
 * @param address - The address to check.
 * @returns The caip chain id of the non-EVM network.
 */
export function nonEvmNetworkChainIdByAccountAddress(
  address: string,
): CaipChainId {
  // This condition is not the most robust. Once we support more networks, we will need to update this logic.
  if (isSolanaAddress(address)) {
    return SolScope.Mainnet;
  }
  return BtcScope.Mainnet;
}
