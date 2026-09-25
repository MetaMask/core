/**
 * HTTP header used to attribute a phishing-detection URL scan to a MetaMask
 * client and product flow.
 */
export const REQUEST_SOURCE_HEADER = 'x-request-source';

/**
 * Request-source value used when the client platform is unknown.
 */
export const UNKNOWN_REQUEST_SOURCE = 'unknown';

/**
 * MetaMask client that initiated a phishing-detection URL scan.
 */
export enum RequestSourcePlatform {
  Extension = 'extension',
  Mobile = 'mobile',
}

/**
 * Product flow that initiated a phishing-detection URL scan.
 */
export enum RequestSourceFlow {
  /**
   * A dapp requested account-access permission, such as via
   * `eth_requestAccounts` or `wallet_requestPermissions`.
   */
  DappConnection = 'dapp-connection',
  /**
   * A main-frame navigation in the mobile in-app browser.
   */
  Browser = 'browser',
  /**
 * Dapp RPC traffic used as a trust signal.
   */
  RpcTrustSignals = 'rpc-trust-signals',
  /**
   * A dapp request that opens a transaction, signature, or permission approval.
   */
  Confirmations = 'confirmations',
  /**
   * A scan of the active dapp origin when the user opens the Secret Recovery
   * Phrase reveal screen.
   */
  RevealSrp = 'reveal-srp',
  /**
   * NFT metadata, image, and external URLs scanned while NFTs are added or
   * auto-detected.
   */
  NftDetection = 'nft-detection',
}

/**
 * Valid {@link REQUEST_SOURCE_HEADER} value: a platform and flow, a platform
 * with an unknown flow, or an unknown platform.
 */
export type RequestSource =
  | `${RequestSourcePlatform}-${RequestSourceFlow}`
  | `${RequestSourcePlatform}-${typeof UNKNOWN_REQUEST_SOURCE}`
  | typeof UNKNOWN_REQUEST_SOURCE;

/**
 * Checks whether a value is a recognised platform.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link RequestSourcePlatform}.
 */
const isKnownPlatform = (value?: string): value is RequestSourcePlatform =>
  Object.values(RequestSourcePlatform).includes(value as RequestSourcePlatform);

/**
 * Checks whether a value is a recognised flow.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link RequestSourceFlow}.
 */
const isKnownFlow = (value?: string): value is RequestSourceFlow =>
  Object.values(RequestSourceFlow).includes(value as RequestSourceFlow);

/**
 * Builds a value for {@link REQUEST_SOURCE_HEADER}.
 *
 * Returns {@link UNKNOWN_REQUEST_SOURCE} when `platform` is unknown, or a
 * platform-specific unknown value when `flow` is unknown. This function never
 * throws for an unrecognised input.
 *
 * @param platform - The client emitting the scan.
 * @param flow - The flow that caused the scan.
 * @returns The composed source, or a sentinel when either part is unknown.
 */
export function buildRequestSource(
  platform?: RequestSourcePlatform,
  flow?: RequestSourceFlow,
): RequestSource {
  if (!isKnownPlatform(platform)) {
    return UNKNOWN_REQUEST_SOURCE;
  }

  if (!isKnownFlow(flow)) {
    return `${platform}-${UNKNOWN_REQUEST_SOURCE}`;
  }

  return `${platform}-${flow}`;
}
