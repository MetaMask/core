// Browser extension iframe host adapter.
//
// Mirror of the React Native adapter for a standard cross-document iframe:
// outbound via the parent window's postMessage, inbound via the window
// 'message' event (filtered to an allowed-origins list), and config supplied
// explicitly by the host or read from window.CONFIG as a fallback.
//
// The `targetOrigin` for outbound postMessage is resolved from the embedder's
// `document.referrer` when not set explicitly — the same mechanism the legacy
// RN-bridge shim used in the POC HTML page.

import type {
  ChartHostTransport,
  InboundTransportListener,
} from '../core/host.js';
import type { ChartConfig } from '../core/types.js';

/** Minimal postMessage target shape (satisfied by `Window`). */
type PostMessageTarget = {
  postMessage(message: string, targetOrigin: string): void;
};

export type IframeHostOptions = {
  /**
   * Explicit target origin for outbound postMessage to the parent. When
   * omitted the adapter resolves it from `document.referrer`: if the
   * referrer's origin appears in `allowedOrigins` it is used; otherwise
   * falls back to `'*'`.
   */
  targetOrigin?: string;
  /**
   * Origins from which inbound messages are accepted. Messages whose
   * `event.origin` is not permitted are silently dropped. When the list
   * is empty or omitted every origin is accepted (the parent controls the
   * frame contents).
   *
   * Each entry is either an exact origin (e.g. `https://app` or
   * `chrome-extension://<id>`) or a scheme-only token ending in `:` (e.g.
   * `moz-extension:`), which matches any origin using that scheme. Firefox
   * assigns each install a random `moz-extension://<uuid>` that cannot be
   * pinned, so the scheme is allowlisted instead.
   */
  allowedOrigins?: string[];
  /** Explicit chart config; falls back to `window.CONFIG` when omitted. */
  config?: ChartConfig;
  /** Outbound message target; defaults to `window.parent`. */
  target?: PostMessageTarget;
};

/**
 * Checks whether an origin is permitted by the allowlist. An entry matches
 * either exactly (e.g. `https://app`, `chrome-extension://<id>`) or as a
 * scheme-only token ending in `:` (e.g. `moz-extension:`), which matches any
 * origin using that scheme. Firefox assigns each install a random
 * `moz-extension://<uuid>` that cannot be pinned, so the scheme is allowlisted
 * instead.
 *
 * @param candidateOrigin - The concrete origin to test.
 * @param allowedOrigins - The configured allowlist entries.
 * @returns `true` when the origin is permitted.
 */
function isOriginAllowed(
  candidateOrigin: string,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.includes(candidateOrigin)) {
    return true;
  }
  try {
    return allowedOrigins.includes(new URL(candidateOrigin).protocol);
  } catch {
    return false;
  }
}

/**
 * Resolves the outbound `targetOrigin` from `document.referrer` when an
 * explicit value is not provided.
 *
 * @param allowedOrigins - The set of trusted embedder origins.
 * @returns The resolved origin string or `'*'` when no match is found.
 */
function resolveTargetOrigin(allowedOrigins: string[]): string {
  try {
    if (document.referrer) {
      const candidate = new URL(document.referrer).origin;
      if (isOriginAllowed(candidate, allowedOrigins)) {
        return candidate;
      }
    }
  } catch {
    // Malformed referrer — fall through to the default.
  }
  return '*';
}

/**
 * Creates a browser-iframe transport adapter for hosts like the extension.
 *
 * @param options - Optional origins, config, and target overrides.
 * @returns A host transport bound to the iframe's parent window.
 */
export function createIframeHost(
  options: IframeHostOptions = {},
): ChartHostTransport {
  const allowedOrigins = options.allowedOrigins ?? [];
  const targetOrigin =
    options.targetOrigin ?? resolveTargetOrigin(allowedOrigins);

  return {
    postMessage(serialized: string): void {
      const target = options.target ?? window.parent;
      if (!target) {
        return;
      }
      try {
        target.postMessage(serialized, targetOrigin);
      } catch {
        // postMessage failure: nothing to do — the frame cannot inform its
        // host of its own bridge failure.
      }
    },

    subscribe(onMessage: InboundTransportListener): () => void {
      const dispatch = (messageEvent: MessageEvent): void => {
        if (
          allowedOrigins.length > 0 &&
          !isOriginAllowed(messageEvent.origin, allowedOrigins)
        ) {
          return;
        }
        onMessage(messageEvent.data);
      };
      window.addEventListener('message', dispatch as EventListener);
      return () => {
        window.removeEventListener('message', dispatch as EventListener);
      };
    },

    getConfig(): ChartConfig | undefined {
      return options.config ?? window.CONFIG;
    },
  };
}
