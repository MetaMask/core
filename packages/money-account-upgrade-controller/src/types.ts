import type { Hex } from '@metamask/utils';

/**
 * Configuration required to perform the Money Account upgrade sequence.
 *
 * `delegateAddress`, `musdTokenAddress`, and `vedaVaultAdapterAddress` come
 * from the CHOMP service details API. The remaining contract addresses
 * (`delegationManager`, `delegatorImplAddress`, and the caveat enforcers) are
 * resolved from `@metamask/delegation-deployments` for the target chain.
 */
export type UpgradeConfig = {
  /** CHOMP's delegate address — receives the delegation. */
  delegateAddress: Hex;
  /** The mUSD token contract address. */
  musdTokenAddress: Hex;
  /** The Veda vault adapter contract address. */
  vedaVaultAdapterAddress: Hex;
  /** Address of the DelegationManager contract (EIP-712 verifying contract). */
  delegationManager: Hex;
  /** The EIP-7702 delegation target (EIP7702StatelessDeleGatorImpl). */
  delegatorImplAddress: Hex;
  /** Address of the ERC20TransferAmountEnforcer caveat enforcer. */
  erc20TransferAmountEnforcer: Hex;
  /** Address of the RedeemerEnforcer caveat enforcer. */
  redeemerEnforcer: Hex;
  /** Address of the ValueLteEnforcer caveat enforcer. */
  valueLteEnforcer: Hex;
};
