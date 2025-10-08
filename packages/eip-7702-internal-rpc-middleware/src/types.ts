import type { Infer } from '@metamask/superstruct';
import { number, object, optional } from '@metamask/superstruct';
import type { JsonRpcRequest } from '@metamask/utils';
import { HexChecksumAddressStruct } from '@metamask/utils';

// Superstruct validation schemas
export const UpgradeAccountParamsStruct = object({
  account: HexChecksumAddressStruct,
  chainId: optional(number()),
});

export const GetAccountUpgradeStatusParamsStruct = object({
  account: HexChecksumAddressStruct,
  chainId: optional(number()),
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
  isUpgraded: boolean; // Whether the account is upgraded
  upgradedAddress: string | null; // Address to which the account is upgraded
  chainId: number; // Chain ID where the check was performed
};

export type UpgradeAccountHooks = {
  upgradeAccount: (
    address: string,
    upgradeContractAddress: string,
    chainId?: number,
  ) => Promise<{ transactionHash: string; delegatedTo: string }>;
  getCurrentChainIdForDomain: (origin: string) => string;
  isEip7702Supported: (request: {
    address: string;
    chainIds: string[];
  }) => Promise<
    {
      chainId: string;
      isSupported: boolean;
      delegationAddress?: string;
      upgradeContractAddress?: string;
    }[]
  >;
  getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
};

export type GetAccountUpgradeStatusHooks = {
  getCurrentChainIdForDomain: (origin: string) => string;
  getCode: (address: string, networkClientId: string) => Promise<string | null>;
  getNetworkConfigurationByChainId: (chainId: string) => {
    rpcEndpoints?: { networkClientId: string }[];
    defaultRpcEndpointIndex?: number;
  } | null;
  getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
};
