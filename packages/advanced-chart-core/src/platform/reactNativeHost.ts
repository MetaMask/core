// React Native WebView host adapter.
//
// Replicates the exact transport behavior the engine used before the host
// transport layer existed: outbound via window.ReactNativeWebView.postMessage, inbound
// via window + document 'message' listeners (iOS posts on window, Android on
// document) with the RN inline-HTML origin filter, and config via
// window.CONFIG (inlined by AdvancedChartTemplate before this IIFE runs).

import type {
  ChartHostTransport,
  InboundTransportListener,
} from '../core/host.js';
import type { ChartConfig } from '../core/types.js';

/**
 * Creates the React Native WebView transport adapter.
 *
 * @returns A host transport bound to the RN WebView bridge.
 */
export function createReactNativeHost(): ChartHostTransport {
  return {
    postMessage(serialized: string): void {
      const bridge = window.ReactNativeWebView;
      if (!bridge) {
        return;
      }
      try {
        bridge.postMessage(serialized);
      } catch {
        // postMessage failure: nothing to do — the WebView cannot inform RN
        // of its own bridge failure.
      }
    },

    subscribe(onMessage: InboundTransportListener): () => void {
      const dispatch = (event: MessageEvent): void => {
        // RN WebView inline HTML: native bridge messages arrive with an empty
        // or "null" origin. Reject messages from real web origins.
        const { origin } = event;
        if (origin && origin !== 'null' && !origin.startsWith('file:')) {
          return;
        }
        onMessage(event.data);
      };

      // iOS posts arrive on window; Android posts arrive on document.
      window.addEventListener('message', dispatch as EventListener);
      document.addEventListener('message', dispatch as EventListener);

      return () => {
        window.removeEventListener('message', dispatch as EventListener);
        document.removeEventListener('message', dispatch as EventListener);
      };
    },

    getConfig(): ChartConfig | undefined {
      return window.CONFIG;
    },
  };
}
