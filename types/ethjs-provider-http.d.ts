declare module 'ethjs-provider-http' {
  import type { JsonRpcRequest } from 'json-rpc-engine';
  export type EthQueryMethodCallback<R> = (error: any, response: R) => void;

  export default class HttpProvider {
    host: string;
    timeout: number;

    constructor(host: string, timeout?: number);

    sendAsync<P, R>(
      request: JsonRpcRequest<P>,
      callback: EthQueryMethodCallback<R>,
    ): void;
  }
}
