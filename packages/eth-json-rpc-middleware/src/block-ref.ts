import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';
import { klona } from 'klona';

import { projectLogger, createModuleLogger } from './logging-utils';
import type { Block } from './types';
import { blockTagParamIndex } from './utils/cache';

type BlockRefMiddlewareOptions = {
  blockTracker?: PollingBlockTracker;
  provider?: InternalProvider;
};

const log = createModuleLogger(projectLogger, 'block-ref');

/**
 * Creates a middleware that rewrites "latest" block references to the known
 * latest block number from a block tracker.
 *
 * @param options - The options for the middleware.
 * @param options.provider - The provider to use.
 * @param options.blockTracker - The block tracker to use.
 * @returns The middleware.
 */
export function createBlockRefMiddleware({
  provider,
  blockTracker,
}: BlockRefMiddlewareOptions = {}): JsonRpcMiddleware<JsonRpcRequest, Json> {
  if (!provider) {
    throw Error('BlockRefMiddleware - mandatory "provider" option is missing.');
  }

  if (!blockTracker) {
    throw Error(
      'BlockRefMiddleware - mandatory "blockTracker" option is missing.',
    );
  }

  return async ({ request, next }) => {
    const blockRefIndex = blockTagParamIndex(request.method);

    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }

    const blockRef = Array.isArray(request.params)
      ? (request.params[blockRefIndex] ?? 'latest')
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
    const childRequest = klona(request);

    if (Array.isArray(childRequest.params)) {
      childRequest.params[blockRefIndex] = latestBlockNumber;
    }

    // perform child request
    log('Performing another request %o', childRequest);
    // copy child result onto original response
    return await provider.request<JsonRpcParams, Block>(childRequest);
  };
}
