/**
 * Request header carrying the first-party flow that caused a scan.
 *
 * This is untrusted observability metadata. It must never be used for
 * authentication, authorization, or to bypass rate limits.
 */
export const REQUEST_SOURCE_HEADER = 'x-request-source';

/**
 * Emitted when the platform is not configured, so unattributed traffic is
 * measurable rather than indistinguishable from a client that predates the
 * header.
 */
export const UNKNOWN_REQUEST_SOURCE = 'unknown';

/**
 * The client emitting the scan. Supplied once, when the controller is
 * constructed, since a single instance only ever runs on one platform.
 */
export enum RequestSourcePlatform {
  Extension = 'extension',
  Mobile = 'mobile',
}

/**
 * The flow that caused a scan. Supplied per call, since one controller serves
 * many flows.
 *
 * Values are bounded because the phishing detection service records them as a
 * Prometheus label and normalizes anything it does not recognise to
 * {@link UNKNOWN_REQUEST_SOURCE}.
 */
export enum RequestSourceFlow {
  /**
   * A connect prompt was shown, or an advanced permission was granted.
   */
  DappConnection = 'dapp-connection',
  /**
   * Main-frame navigation in the mobile in-app browser.
   */
  Browser = 'browser',
  /**
   * Origin scan triggered by dapp RPC traffic rather than by a user action.
   * High request count, low distinct-URL count, so the cache absorbs most of
   * it.
   *
   * The trigger differs by client: Mobile scans on every EIP-1193 request
   * carrying an origin, whereas Extension scans only when a connected origin
   * reads its own connection state (`eth_accounts`, or `wallet_getSession` on
   * the Multichain transport). Mobile volume is therefore expected to be much
   * higher, and the two are not directly comparable.
   */
  RpcTrustSignals = 'rpc-trust-signals',
  /**
   * A dapp-initiated transaction or signature raised a confirmation.
   */
  Confirmations = 'confirmations',
  /**
   * The user opened the Reveal Secret Recovery Phrase screen, which scans the
   * active tab's origin.
   */
  RevealSrp = 'reveal-srp',
  /**
   * NFT metadata, image, and external URLs scanned when NFTs are added or
   * auto-detected.
   */
  NftDetection = 'nft-detection',
}

/**
 * A composed `x-request-source` value.
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
 * Builds the `x-request-source` header value.
 *
 * Both arguments are validated at runtime rather than trusted, because some
 * call sites are plain JavaScript and get no compile-time checking. An
 * unrecognised value degrades to a sentinel; it never throws, so attribution
 * cannot fail a scan.
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
