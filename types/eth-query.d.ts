declare module 'eth-query' {
  import type { JsonRpcRequest } from 'json-rpc-engine';

  export type EthQueryMethodCallback<R> = (error: any, response: R) => void;

  export type EthProvider = {
    sendAsync<P, R>(
      request: JsonRpcRequest<P>,
      callback: EthQueryMethodCallback<R>,
    ): void;
  };

  type HexString = `0x${string}`;

  type BlockParam = HexString | 'latest' | 'earliest' | 'pending';

  export type EthQuerySendAsyncFunction<P = any, R = any> = (
    request: JsonRpcRequest<P>,
    callback: EthQueryMethodCallback<R>,
  ) => void;

  export default class EthQuery {
    currentProvider: EthProvider;

    constructor(provider: EthProvider);

    // Methods that take arguments

    getBalance<R>(
      address: HexString,
      callback: EthQueryMethodCallback<R>,
    ): void;
    getBalance<R>(
      address: HexString,
      block: BlockParam,
      callback: EthQueryMethodCallback<R>,
    ): void;

    getCode<R>(address: HexString, callback: EthQueryMethodCallback<R>): void;
    getCode<R>(
      address: HexString,
      block: BlockParam,
      callback: EthQueryMethodCallback<R>,
    ): void;

    getTransactionCount<R>(
      address: HexString,
      callback: EthQueryMethodCallback<R>,
    ): void;
    getTransactionCount<R>(
      address: HexString,
      block: BlockParam,
      callback: EthQueryMethodCallback<R>,
    ): void;

    getStorageAt<R>(
      address: HexString,
      storagePosition: HexString,
      callback: EthQueryMethodCallback<R>,
    ): void;
    getStorageAt<R>(
      address: HexString,
      storagePosition: HexString,
      block: BlockParam,
      callback: EthQueryMethodCallback<R>,
    ): void;

    call<R>(
      data: {
        from: HexString;
        to: HexString;
        gas?: HexString;
        gasPrice?: HexString;
        value?: HexString;
        data?: HexString;
      },
      callback: EthQueryMethodCallback<R>,
    ): void;
    call<R>(
      data: {
        from: HexString;
        to: HexString;
        gas?: HexString;
        gasPrice?: HexString;
        value?: HexString;
        data?: HexString;
      },
      block: BlockParam,
      callback: EthQueryMethodCallback<R>,
    ): void;

    // Methods that don't take arguments

    protocolVersion<R>(callback: EthQueryMethodCallback<R>): void;
    syncing<R>(callback: EthQueryMethodCallback<R>): void;
    coinbase<R>(callback: EthQueryMethodCallback<R>): void;
    mining<R>(callback: EthQueryMethodCallback<R>): void;
    hashrate<R>(callback: EthQueryMethodCallback<R>): void;
    gasPrice<R>(callback: EthQueryMethodCallback<R>): void;
    accounts<R>(callback: EthQueryMethodCallback<R>): void;
    blockNumber<R>(callback: EthQueryMethodCallback<R>): void;
    getBlockTransactionCountByHash<R>(
      callback: EthQueryMethodCallback<R>,
    ): void;
    getBlockTransactionCountByNumber<R>(
      callback: EthQueryMethodCallback<R>,
    ): void;
    getUncleCountByBlockHash<R>(callback: EthQueryMethodCallback<R>): void;
    getUncleCountByBlockNumber<R>(callback: EthQueryMethodCallback<R>): void;
    sign<R>(callback: EthQueryMethodCallback<R>): void;
    sendTransaction<R>(callback: EthQueryMethodCallback<R>): void;
    sendRawTransaction<R>(callback: EthQueryMethodCallback<R>): void;
    estimateGas<R>(callback: EthQueryMethodCallback<R>): void;
    getBlockByHash<R>(callback: EthQueryMethodCallback<R>): void;
    getBlockByNumber<R>(callback: EthQueryMethodCallback<R>): void;
    getTransactionByHash<R>(callback: EthQueryMethodCallback<R>): void;
    getTransactionByBlockHashAndIndex<R>(
      callback: EthQueryMethodCallback<R>,
    ): void;
    getTransactionByBlockNumberAndIndex<R>(
      callback: EthQueryMethodCallback<R>,
    ): void;
    getTransactionReceipt<R>(callback: EthQueryMethodCallback<R>): void;
    getUncleByBlockHashAndIndex<R>(callback: EthQueryMethodCallback<R>): void;
    getUncleByBlockNumberAndIndex<R>(callback: EthQueryMethodCallback<R>): void;
    getCompilers<R>(callback: EthQueryMethodCallback<R>): void;
    compileLLL<R>(callback: EthQueryMethodCallback<R>): void;
    compileSolidity<R>(callback: EthQueryMethodCallback<R>): void;
    compileSerpent<R>(callback: EthQueryMethodCallback<R>): void;
    newFilter<R>(callback: EthQueryMethodCallback<R>): void;
    newBlockFilter<R>(callback: EthQueryMethodCallback<R>): void;
    newPendingTransactionFilter<R>(callback: EthQueryMethodCallback<R>): void;
    uninstallFilter<R>(callback: EthQueryMethodCallback<R>): void;
    getFilterChanges<R>(callback: EthQueryMethodCallback<R>): void;
    getFilterLogs<R>(callback: EthQueryMethodCallback<R>): void;
    getLogs<R>(callback: EthQueryMethodCallback<R>): void;
    getWork<R>(callback: EthQueryMethodCallback<R>): void;
    submitWork<R>(callback: EthQueryMethodCallback<R>): void;
    submitHashrate<R>(callback: EthQueryMethodCallback<R>): void;

    // Custom methods

    sendAsync: EthQuerySendAsyncFunction;
  }
}
