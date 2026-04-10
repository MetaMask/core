import type { Hex } from '@metamask/utils';

/**
 * Contract addresses and configuration required to perform the
 * Money Account upgrade sequence.
 */
export type UpgradeConfig = {
  /** CHOMP's delegate address — receives the delegation. */
  delegateAddress: Hex;
  /** The EIP-7702 delegation target (EIP7702StatelessDeleGatorImpl). */
  delegatorImplAddress: Hex;
  /** The mUSD token contract address. */
  musdTokenAddress: Hex;
  /** The Veda vault adapter contract address. */
  vedaVaultAdapterAddress: Hex;
  /** Address of the ERC20TransferAmountEnforcer caveat enforcer. */
  erc20TransferAmountEnforcer: Hex;
  /** Address of the RedeemerEnforcer caveat enforcer. */
  redeemerEnforcer: Hex;
  /** Address of the ValueLteEnforcer caveat enforcer. */
  valueLteEnforcer: Hex;
};

/**
 * The discrete steps of the upgrade sequence, in order.
 */
export type UpgradeStep =
  | 'associate-address'
  | 'submit-authorization'
  | 'verify-delegation'
  | 'save-delegation'
  | 'register-intents';

/**
 * Persisted record tracking the progress of an individual account upgrade.
 */
export type AccountUpgradeEntry = {
  /** The last successfully completed step. */
  step: UpgradeStep;
  /** The chain the upgrade is targeting. */
  chainId: Hex;
  /** The delegation hash returned by CHOMP after verify-delegation. */
  delegationHash?: string;
};
