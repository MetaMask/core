import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import clone from 'clone';
import type { PollingBlockTracker } from 'eth-block-tracker';
import type {
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import { createAsyncMiddleware } from 'json-rpc-engine';
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
}: BlockRefMiddlewareOptions = {}): JsonRpcMiddleware<unknown, unknown> {
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
    const childRequest = clone(req);

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
