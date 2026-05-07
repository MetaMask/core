import type { Hex } from '@metamask/utils';

/**
 * The vault configuration read from the remote feature flag.
 * Runtime validation is performed by {@link VaultConfigStruct}.
 */
export type VaultConfig = {
  vaultAddress: Hex;
  vaultChainId: Hex;
  accountantAddress: Hex;
  underlyingTokenAddress: Hex;
  underlyingTokenDecimals: number;
};
