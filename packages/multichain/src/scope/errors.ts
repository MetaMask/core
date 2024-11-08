import { JsonRpcError } from '@metamask/rpc-errors';

/**
 * Thrown when chains requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
 * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
 */
export const REQUESTED_CHAINS_NOT_SUPPORTED_ERROR = new JsonRpcError(
  5100,
  'Requested chains are not supported',
);

/**
 * Thrown when methods requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
 * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
 * TODO: consider throwing the more generic version of this error (UNKNOWN_METHODS_REQUESTED_ERROR) unless in a DevMode build of the wallet
 */
export const REQUESTED_METHODS_NOT_SUPPORTED_ERROR = new JsonRpcError(
  5101,
  'Requested methods are not supported',
);

/**
 * Thrown when notifications requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
 * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
 * TODO: consider throwing the more generic version of this error (UNKNOWN_NOTIFICATIONS_REQUESTED_ERROR) unless in a DevMode build of the wallet
 */
export const REQUESTED_NOTIFICATIONS_NOT_SUPPORTED_ERROR = new JsonRpcError(
  5102,
  'Requested notifications are not supported',
);

/**
 * Thrown when methods requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
 * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes)
 */
export const UNKNOWN_METHODS_REQUESTED_ERROR = new JsonRpcError(
  5201,
  'Unknown method(s) requested',
);

/**
 * Thrown when notifications requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
 * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
 */
export const UNKNOWN_NOTIFICATIONS_REQUESTED_ERROR = new JsonRpcError(
  5202,
  'Unknown notification(s) requested',
);
