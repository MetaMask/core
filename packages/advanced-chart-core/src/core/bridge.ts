// Typed bridge between the WebView IIFE and its host.
//
// Owns the platform-agnostic parts of host communication — JSON framing,
// inbound parsing, and message validation — and delegates the actual
// transport (outbound delivery, inbound subscription, origin filtering) to
// the injected host adapter (see core/host.ts). Preserves the same
// window.ReactNativeWebView.postMessage(...) call shape via the default RN
// adapter, so the RN-side parseWebViewMessage decodes messages unchanged.

import type {
  InboundMessage,
  OutboundMessageType,
  OutboundPayloads,
} from '../messages/contract.js';
import { getHostTransport } from './host.js';

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'Unknown error';
  } catch {
    return String(value);
  }
}

/**
 * Posts a typed message to the host via the active transport. Equivalent to
 * legacy `sendToReactNative(type, payload)` at chartLogic.js line ~98.
 * Silently no-ops when the host transport is unavailable (e.g. during unit
 * tests in a jsdom environment without the RN bridge stub).
 *
 * @param type - The outbound message type tag.
 * @param payload - The payload associated with the message type.
 */
export function postToRN<Type extends OutboundMessageType>(
  type: Type,
  payload: OutboundPayloads[Type],
): void {
  try {
    getHostTransport().postMessage(JSON.stringify({ type, payload }));
  } catch {
    // postMessage / JSON.stringify failure: nothing to do — the WebView
    // cannot inform the host of its own bridge failure.
  }
}

/**
 * Reports a runtime error to React Native via the ERROR channel. Matches the
 * legacy `sendToReactNative('ERROR', { message })` pattern used throughout
 * chartLogic.js.
 *
 * @param error - The error (or arbitrary thrown value) to report.
 */
export function reportErrorToRN(error: unknown): void {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = safeStringify(error);
  }
  postToRN('ERROR', { message });
}

export type InboundMessageHandler = (message: InboundMessage) => void;

/**
 * Registers a single inbound listener. The host posts JSON strings; the
 * active transport delivers each raw payload (after any transport-level
 * origin filtering) and this function parses + validates it before forwarding
 * a well-formed message to the handler.
 *
 * The returned function unsubscribes — useful for tests; the real bundle
 * subscribes once at bootstrap and never unsubscribes.
 *
 * @param handler - Callback invoked with each well-formed inbound message.
 * @returns A function that removes the registered listeners.
 */
export function onFromRN(handler: InboundMessageHandler): () => void {
  return getHostTransport().subscribe((raw: unknown): void => {
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (parseError) {
      reportErrorToRN(parseError);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    const candidate = parsed as { type?: unknown };
    if (typeof candidate.type !== 'string') {
      return;
    }
    // Trusting the type narrowing here is fine because messages/handler.ts
    // re-validates via a switch on candidate.type before dispatching to a
    // typed handler. Phase 1 only routes SET_THEME_COLORS, but the listener
    // forwards every well-formed message so the handler can decide.
    handler(parsed as InboundMessage);
  });
}

/** Re-export for callers that want the type tag union. */
export type { InboundMessageType } from '../messages/contract.js';
