import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetStateAction,
} from '@metamask/accounts-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  nonempty,
  object,
  optional,
  record,
  string,
  tuple,
  type,
} from '@metamask/superstruct';
import type { TransactionControllerGetStateAction } from '@metamask/transaction-controller';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

type Actions =
  | AccountsControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetNetworkClientByIdAction
  | TransactionControllerGetStateAction
  | PreferencesControllerGetStateAction
  | NetworkControllerGetStateAction;

export type EIP5792Messenger = Messenger<'EIP5792', Actions>;

// wallet_getCallStatus
export type GetCallsStatusParams = Infer<typeof GetCallsStatusStruct>;

export type GetCallsStatusResult = {
  version: string;
  id: Hex;
  chainId: Hex;
  status: number;
  atomic: boolean;
  receipts?: {
    logs: {
      address: Hex;
      data: Hex;
      topics: Hex[];
    }[];
    status: '0x0' | '0x1';
    blockHash: Hex;
    blockNumber: Hex;
    gasUsed: Hex;
    transactionHash: Hex;
  }[];
  capabilities?: Record<string, Json>;
  error?: {
    message: string;
    code?: string;
    name?: string;
    rpc?: Json;
  };
};

export type GetCallsStatusHook = (
  id: GetCallsStatusParams[0],
  req: JsonRpcRequest,
) => Promise<GetCallsStatusResult>;

// wallet_getCapabilities
export type GetCapabilitiesParams = Infer<typeof GetCapabilitiesStruct>;
export type GetCapabilitiesResult = Record<Hex, Record<string, Json>>;

export type GetCapabilitiesHook = (
  address: GetCapabilitiesParams[0],
  chainIds: GetCapabilitiesParams[1],
  req: JsonRpcRequest,
) => Promise<GetCapabilitiesResult>;

// wallet_sendCalls
export type SendCallsParams = Infer<typeof SendCallsStruct>;
export type SendCallsPayload = SendCallsParams[0];

export type SendCallsRequiredAssetsParam = Infer<typeof RequiredAssetStruct>;

export type SendCallsResult = {
  id: Hex;
  capabilities?: Record<string, Json>;
};

export type ProcessSendCallsHook = (
  sendCalls: SendCallsPayload,
  req: JsonRpcRequest,
) => Promise<SendCallsResult>;

// /** Structs **/
// Even though these aren't actually typescript types, these structs essentially represent
// runtime types, so we keep them in this file.
export const GetCallsStatusStruct = tuple([StrictHexStruct]);

export const GetCapabilitiesStruct = tuple([
  HexChecksumAddressStruct,
  optional(array(StrictHexStruct)),
]);

const RequiredAssetStruct = type({
  address: nonempty(HexChecksumAddressStruct),
  amount: nonempty(StrictHexStruct),
  standard: nonempty(string()),
});

export const CapabilitiesStruct = record(
  string(),
  type({
    optional: optional(boolean()),
    requiredAssets: optional(array(RequiredAssetStruct)),
  }),
);

export const SendCallsStruct = tuple([
  object({
    version: nonempty(string()),
    id: optional(StrictHexStruct),
    from: optional(HexChecksumAddressStruct),
    chainId: StrictHexStruct,
    atomicRequired: boolean(),
    calls: array(
      object({
        to: optional(HexChecksumAddressStruct),
        data: optional(StrictHexStruct),
        value: optional(StrictHexStruct),
        capabilities: optional(CapabilitiesStruct),
      }),
    ),
    capabilities: optional(CapabilitiesStruct),
  }),
]);
