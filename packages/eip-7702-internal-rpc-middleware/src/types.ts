import type { Infer } from '@metamask/superstruct';
import { object, optional } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

// Superstruct validation schemas
export const UpgradeAccountParamsStruct = object({
  account: HexChecksumAddressStruct,
  chainId: optional(StrictHexStruct),
});

export const GetAccountUpgradeStatusParamsStruct = object({
  account: HexChecksumAddressStruct,
  chainId: optional(StrictHexStruct),
});

// Type definitions derived from schemas
export type UpgradeAccountParams = Infer<typeof UpgradeAccountParamsStruct>;

export type UpgradeAccountResult = {
  transactionHash: string; // Hash of the EIP-7702 authorization transaction
  upgradedAccount: string; // Address of the upgraded account (same as input)
  delegatedTo: string; // Address of the contract delegated to (determined by wallet)
};

export type GetAccountUpgradeStatusParams = Infer<
  typeof GetAccountUpgradeStatusParamsStruct
>;

export type GetAccountUpgradeStatusResult = {
  account: string; // Address of the checked account
  chainId: Hex; // Chain ID where the check was performed
  isSupported: boolean; // Whether upgrade to smart account is supported on the chain
  isUpgraded: boolean; // Whether the account is upgraded
  upgradedAddress: string | null; // Address to which the account is upgraded
};
