import type { Hex } from '@metamask/utils';

/**
 * The vault configuration read from the remote feature flag.
 * Runtime validation is performed by {@link VaultConfigStruct}.
 */
export type VaultConfig = {
  boringVault: Hex;
  tellerAddress: Hex;
  accountantAddress: Hex;
  lensAddress: Hex;
  chainId: Hex;
};
