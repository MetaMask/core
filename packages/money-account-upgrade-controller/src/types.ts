import type { Hex } from '@metamask/utils';

/**
 * Configuration required to perform the Money Account upgrade sequence.
 *
 * `delegateAddress`, `musdTokenAddress`, and `vedaVaultAdapterAddress` come
 * from the CHOMP service details API. `delegatorImplAddress` and the caveat
 * enforcer addresses are resolved from `@metamask/delegation-deployments` for
 * the target chain. (DelegationManager resolution is delegated to
 * `@metamask/delegation-controller`, which handles delegation signing.)
 */
export type UpgradeConfig = {
  /** CHOMP's delegate address — receives the delegation. */
  delegateAddress: Hex;
  /** The mUSD token contract address (deposit-side delegation token). */
  musdTokenAddress: Hex;
  /** The Veda boring vault contract address (withdrawal-side delegation token, vmUSD). */
  boringVaultAddress: Hex;
  /** The Veda vault adapter contract address. */
  vedaVaultAdapterAddress: Hex;
  /** The EIP-7702 delegation target (EIP7702StatelessDeleGatorImpl). */
  delegatorImplAddress: Hex;
  /** Address of the ERC20TransferAmountEnforcer caveat enforcer. */
  erc20TransferAmountEnforcer: Hex;
  /** Address of the RedeemerEnforcer caveat enforcer. */
  redeemerEnforcer: Hex;
  /** Address of the ValueLteEnforcer caveat enforcer. */
  valueLteEnforcer: Hex;
};
