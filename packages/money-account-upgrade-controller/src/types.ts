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
 * Configuration values passed to {@link MoneyAccountUpgradeController.init}
 * that cannot be derived from the service details API.
 */
export type InitConfig = Pick<
  UpgradeConfig,
  | 'delegatorImplAddress'
  | 'musdTokenAddress'
  | 'redeemerEnforcer'
  | 'valueLteEnforcer'
>;
