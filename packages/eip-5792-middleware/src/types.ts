import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetStateAction,
} from '@metamask/accounts-controller';
import type { Messenger } from '@metamask/base-controller';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import type { Infer } from '@metamask/superstruct';
import type { TransactionControllerGetStateAction } from '@metamask/transaction-controller';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';

import type {
  GetCallsStatusStruct,
  GetCapabilitiesStruct,
  SendCallsStruct,
} from './constants';

type Actions =
  | AccountsControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetNetworkClientByIdAction
  | TransactionControllerGetStateAction
  | PreferencesControllerGetStateAction
  | NetworkControllerGetStateAction;

export type EIP5792Messenger = Messenger<Actions, never>;

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

export type SendCallsResult = {
  id: Hex;
  capabilities?: Record<string, Json>;
};

export type ProcessSendCallsHook = (
  sendCalls: SendCallsPayload,
  req: JsonRpcRequest,
) => Promise<SendCallsResult>;
