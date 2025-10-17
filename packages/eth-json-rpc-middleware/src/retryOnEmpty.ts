import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';
import { klona } from 'klona/full';

import { projectLogger, createModuleLogger } from './logging-utils';
import type { Block } from './types';
import { blockTagParamIndex } from './utils/cache';
import { isExecutionRevertedError } from './utils/error';
import { timeout } from './utils/timeout';

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

type RetryOnEmptyMiddlewareOptions = {
  provider?: SafeEventEmitterProvider;
  blockTracker?: PollingBlockTracker;
};

export function createRetryOnEmptyMiddleware({
  provider,
  blockTracker,
}: RetryOnEmptyMiddlewareOptions = {}): JsonRpcMiddleware<JsonRpcParams, Json> {
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
    let blockRef: string | undefined =
      Array.isArray(req.params) && req.params[blockRefIndex]
        ? (req.params[blockRefIndex] as string)
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
    const childRequest = klona(req);
    // attempt child request until non-empty response is received
    const childResult = await retry(10, async () => {
      log('Performing request %o', childRequest);
      const attemptResult = await provider.request<JsonRpcParams, Block>(
        childRequest,
      );
      log('Result is %o', attemptResult);
      // verify result
      const allEmptyValues: unknown[] = emptyValues;
      if (allEmptyValues.includes(attemptResult)) {
        throw new Error(
          `RetryOnEmptyMiddleware - empty result "${JSON.stringify(
            attemptResult,
          )}" for request "${JSON.stringify(childRequest)}"`,
        );
      }
      return attemptResult;
    });
    log('Copying result %o', childResult);
    // copy child result onto original response
    res.result = childResult;
    return undefined;
  });
}

async function retry<Result>(
  maxRetries: number,
  asyncFn: () => Promise<Result>,
): Promise<Result> {
  for (let index = 0; index < maxRetries; index++) {
    try {
      return await asyncFn();
    } catch (err: unknown) {
      if (isExecutionRevertedError(err)) {
        throw err as unknown;
      }
      log('(call %i) Request failed, waiting 1s to retry again...', index + 1);
      await timeout(1000);
    }
  }
  log('Retries exhausted');
  throw new Error('RetryOnEmptyMiddleware - retries exhausted');
}
