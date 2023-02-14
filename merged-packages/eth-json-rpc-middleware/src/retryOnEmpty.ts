import clone from 'clone';
import { PollingBlockTracker } from 'eth-block-tracker';
import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import pify from 'pify';
import { projectLogger, createModuleLogger } from './logging-utils';
import { blockTagParamIndex } from './utils/cache';
import { timeout } from './utils/timeout';
import { Block, SafeEventEmitterProvider } from './types';

//
// RetryOnEmptyMiddleware will retry any request with an empty response that has
// a numbered block reference at or lower than the blockTracker's latest block.
// Its useful for dealing with load-balanced ethereum JSON RPC
// nodes that are not always in sync with each other.
//

const log = createModuleLogger(projectLogger, 'retry-on-empty');
// empty values used to determine if a request should be retried
// `<nil>` comes from https://github.com/ethereum/go-ethereum/issues/16925
const emptyValues: (string | null | undefined)[] = [
  undefined,
  null,
  '\u003cnil\u003e',
];

interface RetryOnEmptyMiddlewareOptions {
  provider?: SafeEventEmitterProvider;
  blockTracker?: PollingBlockTracker;
}

export function createRetryOnEmptyMiddleware({
  provider,
  blockTracker,
}: RetryOnEmptyMiddlewareOptions = {}): JsonRpcMiddleware<unknown, unknown> {
  if (!provider) {
    throw Error(
      'RetryOnEmptyMiddleware - mandatory "provider" option is missing.',
    );
  }

  if (!blockTracker) {
    throw Error(
      'RetryOnEmptyMiddleware - mandatory "blockTracker" option is missing.',
    );
  }

  return createAsyncMiddleware(async (req, res, next) => {
    const blockRefIndex: number | undefined = blockTagParamIndex(req.method);
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }
    // skip if not exact block references
    let blockRef: string | undefined = Array.isArray(req.params)
      ? req.params[blockRefIndex]
      : undefined;
    // omitted blockRef implies "latest"
    if (blockRef === undefined) {
      blockRef = 'latest';
    }

    // skip if non-number block reference
    if (['latest', 'pending'].includes(blockRef)) {
      return next();
    }
    // skip if block refernce is not a valid number
    const blockRefNumber: number = Number.parseInt(blockRef.slice(2), 16);
    if (Number.isNaN(blockRefNumber)) {
      return next();
    }
    // lookup latest block
    const latestBlockNumberHex: string = await blockTracker.getLatestBlock();
    const latestBlockNumber: number = Number.parseInt(
      latestBlockNumberHex.slice(2),
      16,
    );
    // skip if request block number is higher than current
    if (blockRefNumber > latestBlockNumber) {
      log(
        'Requested block number %o is higher than latest block number %o, falling through to original request',
        blockRefNumber,
        latestBlockNumber,
      );
      return next();
    }

    log(
      'Requested block number %o is not higher than latest block number %o, trying request until non-empty response is received',
      blockRefNumber,
      latestBlockNumber,
    );

    // create child request with specific block-ref
    const childRequest = clone(req);
    // attempt child request until non-empty response is received
    const childResponse: PendingJsonRpcResponse<Block> = await retry(
      10,
      async () => {
        log('Performing request %o', childRequest);
        const attemptResponse: PendingJsonRpcResponse<Block> = await pify(
          (provider as SafeEventEmitterProvider).sendAsync,
        ).call(provider, childRequest);
        log('Response is %o', attemptResponse);
        // verify result
        if (emptyValues.includes(attemptResponse.result as any)) {
          throw new Error(
            `RetryOnEmptyMiddleware - empty response "${JSON.stringify(
              attemptResponse,
            )}" for request "${JSON.stringify(childRequest)}"`,
          );
        }
        return attemptResponse;
      },
    );
    log(
      'Copying result %o and error %o',
      childResponse.result,
      childResponse.error,
    );
    // copy child response onto original response
    res.result = childResponse.result;
    res.error = childResponse.error;
    return undefined;
  });
}

async function retry(
  maxRetries: number,
  asyncFn: () => Promise<PendingJsonRpcResponse<Block>>,
): Promise<PendingJsonRpcResponse<Block>> {
  for (let index = 0; index < maxRetries; index++) {
    try {
      return await asyncFn();
    } catch (err) {
      log('(call %i) Request failed, waiting 1s to retry again...', index + 1);
      await timeout(1000);
    }
  }
  log('Retries exhausted');
  throw new Error('RetryOnEmptyMiddleware - retries exhausted');
}
