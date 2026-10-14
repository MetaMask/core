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
  /**
   * Address of the vault's underlying ERC-20 asset (mUSD).
   *
   * Optional for backwards compatibility with flags deployed before this
   * field existed. When present, it is used directly as the source of truth
   * (the flag already moves in lockstep with the vault addresses), avoiding an
   * on-chain `Accountant.base()` read on every mUSD balance fetch. When absent,
   * the service falls back to reading `base()` on-chain.
   */
  underlyingToken?: Hex;
};
