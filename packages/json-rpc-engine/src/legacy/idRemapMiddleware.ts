import type { Json, JsonRpcParams } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngine';
import { getUniqueId } from '../getUniqueId';

/**
 * Returns a middleware function that overwrites the `id` property of each
 * request with an ID that is guaranteed to be unique, and restores the original
 * ID in a return handler.
 *
 * If used, should be the first middleware in the stack.
 *
 * @deprecated Use `JsonRpcEngineV2` and its corresponding types instead.
 * @returns The ID remap middleware function.
 */
export function createIdRemapMiddleware(): JsonRpcMiddleware<
  JsonRpcParams,
  Json
> {
  return (request, response, next, _end) => {
    const originalId = request.id;
    const newId = getUniqueId();
    request.id = newId;
    response.id = newId;
    next((done) => {
      request.id = originalId;
      response.id = originalId;
      done();
    });
  };
}
