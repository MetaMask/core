import { PollingBlockTracker } from 'eth-block-tracker';
import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import clone from 'clone';
import pify from 'pify';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { projectLogger, createModuleLogger } from './logging-utils';
import { blockTagParamIndex } from './utils/cache';
import type { Block } from './types';

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
      (provider as SafeEventEmitterProvider).sendAsync,
    ).call(provider, childRequest);
    // copy child response onto original response
    res.result = childRes.result;
    res.error = childRes.error;

    return undefined;
  });
}
