// Platform host transport layer.
//
// Abstracts the *platform-specific* transport (how the WebView talks to its
// host and where it reads its inlined CONFIG) behind a single injectable
// interface. The engine's message bridge (core/bridge.ts) and config accessor
// (core/state.ts getConfig) depend on this interface instead of naming a
// concrete global, so the same engine can run inside a React Native WebView
// or a browser extension iframe.
//
// Adapters live in src/platform/*. The React Native adapter is the default so
// that existing consumers (and the mobile IIFE) keep their exact behavior
// without any wiring.

import { createReactNativeHost } from '../platform/reactNativeHost.js';
import type { ChartConfig } from './types.js';

/** Callback invoked with each raw inbound payload delivered by the host. */
export type InboundTransportListener = (raw: unknown) => void;

/**
 * The platform transport contract. An adapter owns the three things that
 * differ between hosts: how outbound messages are delivered, how inbound
 * messages are received (including any origin filtering), and where the
 * inlined chart CONFIG comes from.
 */
export type ChartHostTransport = {
  /** Deliver a serialized outbound message to the host. */
  postMessage(serialized: string): void;
  /**
   * Subscribe to raw inbound messages from the host. The adapter is
   * responsible for any transport-level filtering (e.g. origin checks). The
   * returned function unsubscribes.
   */
  subscribe(onMessage: InboundTransportListener): () => void;
  /** Return the inlined chart configuration, or `undefined` when absent. */
  getConfig(): ChartConfig | undefined;
};

let activeHost: ChartHostTransport | null = null;

/**
 * Injects the host transport the engine should use. The mobile IIFE and the
 * extension entry call this before bootstrap; tests may call it to provide a
 * fake transport.
 *
 * @param host - The transport adapter to activate.
 */
export function setHostTransport(host: ChartHostTransport): void {
  activeHost = host;
}

/**
 * Returns the active host transport, lazily defaulting to the React Native
 * adapter so untouched consumers keep their current behavior.
 *
 * @returns The active host transport.
 */
export function getHostTransport(): ChartHostTransport {
  activeHost ??= createReactNativeHost();
  return activeHost;
}

/** Test-only: clear the injected host so the next access re-defaults. */
export function _resetHostTransportForTests(): void {
  activeHost = null;
}
