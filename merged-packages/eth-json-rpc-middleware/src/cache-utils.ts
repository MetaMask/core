import {
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import stringify from 'json-stable-stringify';
import SafeEventEmitter from '@metamask/safe-event-emitter';

export type Payload = Partial<JsonRpcRequest<string[]>>;

export interface JsonRpcRequestToCache extends JsonRpcRequest<string[]>{
  skipCache: boolean;
}

export type BlockData = string | string[];

export type Block = Record<string, BlockData>;

export type BlockCache = Record<string, Block>;

export type Cache = Record<number, BlockCache>;

export type SendAsyncCallBack = (err: Error, providerRes: PendingJsonRpcResponse<Block>) => void;

export interface SafeEventEmitterProvider extends SafeEventEmitter{
  sendAsync: (req: JsonRpcRequest<string[]>, callback: SendAsyncCallBack) => void;
  send: (req: JsonRpcRequest<string[]>, callback: VoidFunction) => void;
}

export function cacheIdentifierForPayload(payload: Payload, skipBlockRef?: boolean): string|null {
  const simpleParams: string[] = skipBlockRef ? paramsWithoutBlockTag(payload) : (payload.params ?? []);
  if (canCache(payload)) {
    return `${payload.method}:${stringify(simpleParams)}`;
  }
  return null;
}

export function canCache(payload: Payload): boolean {
  return cacheTypeForPayload(payload) !== 'never';
}

export function blockTagForPayload(payload: Payload): string|undefined {
  if (!payload.params) {
    return undefined;
  }
  const index: number|undefined = blockTagParamIndex(payload);

  // Block tag param not passed.
  if (index === undefined || index >= payload.params.length) {
    return undefined;
  }

  return payload.params[index];
}

export function paramsWithoutBlockTag(payload: Payload): string[] {
  if (!payload.params) {
    return [];
  }
  const index: number|undefined = blockTagParamIndex(payload);

  // Block tag param not passed.
  if (index === undefined || index >= payload.params.length) {
    return payload.params;
  }

  // eth_getBlockByNumber has the block tag first, then the optional includeTx? param
  if (payload.method === 'eth_getBlockByNumber') {
    return payload.params.slice(1);
  }
  return payload.params.slice(0, index);
}

export function blockTagParamIndex(payload: Payload): number|undefined {
  switch (payload.method) {
    // blockTag is at index 2
    case 'eth_getStorageAt':
      return 2;
    // blockTag is at index 1
    case 'eth_getBalance':
    case 'eth_getCode':
    case 'eth_getTransactionCount':
    case 'eth_call':
      return 1;
    // blockTag is at index 0
    case 'eth_getBlockByNumber':
      return 0;
    // there is no blockTag
    default:
      return undefined;
  }
}

export function cacheTypeForPayload(payload: Payload): string {
  switch (payload.method) {
    // cache permanently
    case 'web3_clientVersion':
    case 'web3_sha3':
    case 'eth_protocolVersion':
    case 'eth_getBlockTransactionCountByHash':
    case 'eth_getUncleCountByBlockHash':
    case 'eth_getCode':
    case 'eth_getBlockByHash':
    case 'eth_getTransactionByHash':
    case 'eth_getTransactionByBlockHashAndIndex':
    case 'eth_getTransactionReceipt':
    case 'eth_getUncleByBlockHashAndIndex':
    case 'eth_getCompilers':
    case 'eth_compileLLL':
    case 'eth_compileSolidity':
    case 'eth_compileSerpent':
    case 'shh_version':
    case 'test_permaCache':
      return 'perma';

    // cache until fork
    case 'eth_getBlockByNumber':
    case 'eth_getBlockTransactionCountByNumber':
    case 'eth_getUncleCountByBlockNumber':
    case 'eth_getTransactionByBlockNumberAndIndex':
    case 'eth_getUncleByBlockNumberAndIndex':
    case 'test_forkCache':
      return 'fork';

    // cache for block
    case 'eth_gasPrice':
    case 'eth_blockNumber':
    case 'eth_getBalance':
    case 'eth_getStorageAt':
    case 'eth_getTransactionCount':
    case 'eth_call':
    case 'eth_estimateGas':
    case 'eth_getFilterLogs':
    case 'eth_getLogs':
    case 'test_blockCache':
      return 'block';

    // never cache
    default:
      return 'never';
  }
}
