import { KeyringTypes } from '@metamask/keyring-controller';

export const KEYRING_TYPES_SUPPORTING_7702 = [
  KeyringTypes.hd,
  KeyringTypes.simple,
];

export enum MESSAGE_TYPE {
  ETH_SEND_TRANSACTION = 'eth_sendTransaction',
}

// To be moved to @metamask/rpc-errors in future.
export enum EIP5792ErrorCode {
  UnsupportedNonOptionalCapability = 5700,
  UnsupportedChainId = 5710,
  UnknownBundleId = 5730,
  RejectedUpgrade = 5750,
}
