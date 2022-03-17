declare module 'eth-json-rpc-infura/src/createProvider' {
  import type { JsonRpcEngine } from 'json-rpc-engine';
  import type SafeEventEmitter from '@metamask/safe-event-emitter';
  import type { CreateInfuraMiddlewareOptions } from 'eth-json-rpc-infura';

  interface Provider extends SafeEventEmitter {
    sendAsync: JsonRpcEngine['handle'];
    send: JsonRpcEngine['handle'];
  }

  export default function createProvider(
    opts: CreateInfuraMiddlewareOptions,
  ): Provider;
}
