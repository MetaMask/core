import { JsonRpcError } from '@metamask/rpc-errors';

/**
 * CAIP25 Errors.
 */
export const Caip25Errors = {
  /**
   * Thrown when chains requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
   * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
   * @returns A new JsonRpcError instance.
   */
  requestedChainsNotSupportedError: () =>
    new JsonRpcError(5100, 'Requested chains are not supported'),

  /**
   * Thrown when methods requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
   * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
   * TODO: consider throwing the more generic version of this error (UNKNOWN_METHODS_REQUESTED_ERROR) unless in a DevMode build of the wallet
   * @returns A new JsonRpcError instance.
   */
  requestedMethodsNotSupportedError: () =>
    new JsonRpcError(5101, 'Requested methods are not supported'),

  /**
   * Thrown when notifications requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
   * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
   * TODO: consider throwing the more generic version of this error (UNKNOWN_NOTIFICATIONS_REQUESTED_ERROR) unless in a DevMode build of the wallet
   * @returns A new JsonRpcError instance.
   */
  requestedNotificationsNotSupportedError: () =>
    new JsonRpcError(5102, 'Requested notifications are not supported'),

  /**
   * Thrown when methods requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
   * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
   * @returns A new JsonRpcError instance.
   */
  unknownMethodsRequestedError: () =>
    new JsonRpcError(5201, 'Unknown method(s) requested'),

  /**
   * Thrown when notifications requested in a CAIP-25 `wallet_createSession` call are not supported by the wallet.
   * Defined in [CAIP-25 error codes section](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md#trusted-failure-codes).
   * @returns A new JsonRpcError instance.
   */
  unknownNotificationsRequestedError: () =>
    new JsonRpcError(5202, 'Unknown notification(s) requested'),
};
