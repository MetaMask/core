// AdvancedChart WebView IIFE entry point.
//
// Evaluated at runtime inside the WebView after AdvancedChartTemplate has
// inlined window.CONFIG via a preceding <script> block. Calls bootstrap()
// to seed state, wire the RN bridge, register Phase 1 handlers, and begin
// loading the TradingView library.
//
// Future phases register their handlers / overlays / features inside their
// own modules; this file stays a thin entry point.

import { bootstrap } from './core/bootstrap.js';
import { reportErrorToRN } from './core/bridge.js';
import { setHostTransport } from './core/host.js';
import { createReactNativeHost } from './platform/reactNativeHost.js';

// Mobile RN WebView entry: select the React Native host transport before
// booting. Other hosts (e.g. the extension iframe) import the exports below
// and inject their own transport instead of evaluating this IIFE.
setHostTransport(createReactNativeHost());

try {
  bootstrap();
} catch (error) {
  reportErrorToRN(error);
}

export { bootstrap } from './core/bootstrap.js';
export {
  getHostTransport,
  setHostTransport,
  type ChartHostTransport,
  type InboundTransportListener,
} from './core/host.js';
export { createReactNativeHost } from './platform/reactNativeHost.js';
export {
  createIframeHost,
  type IframeHostOptions,
} from './platform/iframeHost.js';
