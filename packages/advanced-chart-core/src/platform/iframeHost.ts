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

import type { ChartHostTransport, InboundTransportListener } from '../core/host.js';
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
   * `event.origin` is not in this list are silently dropped. When the list
   * is empty or omitted every origin is accepted (the parent controls the
   * frame contents).
   */
  allowedOrigins?: string[];
  /** Explicit chart config; falls back to `window.CONFIG` when omitted. */
  config?: ChartConfig;
  /** Outbound message target; defaults to `window.parent`. */
  target?: PostMessageTarget;
};

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
      if (allowedOrigins.includes(candidate)) {
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
      const dispatch = (event: MessageEvent): void => {
        if (
          allowedOrigins.length > 0 &&
          !allowedOrigins.includes(event.origin)
        ) {
          return;
        }
        onMessage(event.data);
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
