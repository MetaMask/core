// Side-effect-free entry point for non-mobile hosts.
//
// Unlike the default entry (index.ts) which auto-boots the engine with the
// React Native transport, this module only re-exports the factories,
// interface, and bootstrap function — the consumer chooses the transport and
// decides when to boot:
//
//   import { setHostTransport, createIframeHost, bootstrap }
//     from '@metamask/advanced-chart-core/host';
//
//   setHostTransport(createIframeHost({ allowedOrigins: [...], config }));
//   bootstrap();

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
