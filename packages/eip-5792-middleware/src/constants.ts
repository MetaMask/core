import { KeyringTypes } from '@metamask/keyring-controller';

export const VERSION = '2.0.0';

export const KEYRING_TYPES_SUPPORTING_7702 = [
  KeyringTypes.hd,
  KeyringTypes.simple,
];

export enum MessageType {
  SendTransaction = 'eth_sendTransaction',
}

export enum SupportedCapabilities {
  AuxiliaryFunds = 'auxiliaryFunds',
}

// To be moved to @metamask/rpc-errors in future.
export enum EIP5792ErrorCode {
  UnsupportedNonOptionalCapability = 5700,
  UnsupportedChainId = 5710,
  UnknownBundleId = 5730,
  RejectedUpgrade = 5750,
}

// To be moved to @metamask/rpc-errors in future.
export enum EIP7682ErrorCode {
  UnsupportedAsset = 5771,
  UnsupportedChain = 5772,
  MalformedRequiredAssets = 5773,
}

// wallet_getCallStatus
export enum GetCallsStatusCode {
  PENDING = 100,
  CONFIRMED = 200,
  FAILED_OFFCHAIN = 400,
  REVERTED = 500,
  REVERTED_PARTIAL = 600,
}
