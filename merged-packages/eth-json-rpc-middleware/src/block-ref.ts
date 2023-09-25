import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import type { PollingBlockTracker } from 'eth-block-tracker';
import { klona } from 'klona/full';
import pify from 'pify';

import { projectLogger, createModuleLogger } from './logging-utils';
import type { Block } from './types';
import { blockTagParamIndex } from './utils/cache';

interface BlockRefMiddlewareOptions {
  blockTracker?: PollingBlockTracker;
  provider?: SafeEventEmitterProvider;
}

const log = createModuleLogger(projectLogger, 'block-ref');

export function createBlockRefMiddleware({
  provider,
  blockTracker,
}: BlockRefMiddlewareOptions = {}): JsonRpcMiddleware<JsonRpcParams, Json> {
  if (!provider) {
    throw Error('BlockRefMiddleware - mandatory "provider" option is missing.');
  }

  if (!blockTracker) {
    throw Error(
      'BlockRefMiddleware - mandatory "blockTracker" option is missing.',
    );
  }

  return createAsyncMiddleware(async (req, res, next) => {
    const blockRefIndex = blockTagParamIndex(req.method);

    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }

    const blockRef = Array.isArray(req.params)
      ? req.params[blockRefIndex] ?? 'latest'
      : 'latest';

    // skip if not "latest"
    if (blockRef !== 'latest') {
      log('blockRef is not "latest", carrying request forward');
      return next();
    }

    // lookup latest block
    const latestBlockNumber = await blockTracker.getLatestBlock();
    log(
      `blockRef is "latest", setting param ${blockRefIndex} to latest block ${latestBlockNumber}`,
    );

    // create child request with specific block-ref
    const childRequest = klona(req);

    if (Array.isArray(childRequest.params)) {
      childRequest.params[blockRefIndex] = latestBlockNumber;
    }

    // perform child request
    log('Performing another request %o', childRequest);
    const childRes: PendingJsonRpcResponse<Block> = await pify(
      provider.sendAsync,
    ).call(provider, childRequest);
    // copy child response onto original response
    res.result = childRes.result;
    res.error = childRes.error;

    return undefined;
  });
}
