import { KeyringTypes } from '@metamask/keyring-controller';
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
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

export const VERSION = '2.0.0';

export const KEYRING_TYPES_SUPPORTING_7702 = [
  KeyringTypes.hd,
  KeyringTypes.simple,
];

export enum MessageType {
  SendTransaction = 'eth_sendTransaction',
}

// To be moved to @metamask/rpc-errors in future.
export enum EIP5792ErrorCode {
  UnsupportedNonOptionalCapability = 5700,
  UnsupportedChainId = 5710,
  UnknownBundleId = 5730,
  RejectedUpgrade = 5750,
}

// wallet_getCallStatus
export enum GetCallsStatusCode {
  PENDING = 100,
  CONFIRMED = 200,
  FAILED_OFFCHAIN = 400,
  REVERTED = 500,
  REVERTED_PARTIAL = 600,
}

export const GetCallsStatusStruct = tuple([StrictHexStruct]);

// wallet_getCapabilities
export const GetCapabilitiesStruct = tuple([
  HexChecksumAddressStruct,
  optional(array(StrictHexStruct)),
]);

export const CapabilitiesStruct = record(
  string(),
  type({
    optional: optional(boolean()),
  }),
);

// wallet_sendCalls
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
