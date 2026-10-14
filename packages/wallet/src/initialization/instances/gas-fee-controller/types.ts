import type { GasFeeController } from '@metamask/gas-fee-controller';

type GasFeeControllerOptions = ConstructorParameters<
  typeof GasFeeController
>[0];

/**
 * Per-instance options for the wallet's `GasFeeController`. `clientId` is
 * required so every client (extension, mobile, wallet-cli) identifies itself to
 * the gas API; the remaining fields are optional and the instance's `init`
 * applies a platform-agnostic default for each one, which clients may override.
 */
export type GasFeeControllerInstanceOptions = {
  /**
   * Sent as `X-Client-Id` to the gas API to identify the calling client. Has no
   * platform-agnostic default, so each client must set it explicitly.
   */
  clientId: NonNullable<GasFeeControllerOptions['clientId']>;
  /** EIP-1559 gas price API URL. Defaults to the production endpoint. */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  EIP1559APIEndpoint?: GasFeeControllerOptions['EIP1559APIEndpoint'];
  /** Legacy gas price API URL. Defaults to the production endpoint. */
  legacyAPIEndpoint?: GasFeeControllerOptions['legacyAPIEndpoint'];
  /** Milliseconds between polls. Defaults to the controller's own 15 seconds. */
  interval?: GasFeeControllerOptions['interval'];
  /** Defaults to `() => false`. */
  getCurrentNetworkLegacyGasAPICompatibility?: GasFeeControllerOptions['getCurrentNetworkLegacyGasAPICompatibility'];
  /** Defaults to `() => true`. */
  getCurrentAccountEIP1559Compatibility?: GasFeeControllerOptions['getCurrentAccountEIP1559Compatibility'];
};
