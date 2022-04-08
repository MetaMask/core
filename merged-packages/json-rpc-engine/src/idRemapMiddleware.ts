import { getUniqueId } from './getUniqueId';
import { JsonRpcMiddleware } from './JsonRpcEngine';

/**
 * Returns a middleware function that overwrites the `id` property of each
 * request with an ID that is guaranteed to be unique, and restores the original
 * ID in a return handler.
 *
 * If used, should be the first middleware in the stack.
 *
 * @returns The ID remap middleware function.
 */
export function createIdRemapMiddleware(): JsonRpcMiddleware<unknown, unknown> {
  return (req, res, next, _end) => {
    const originalId = req.id;
    const newId = getUniqueId();
    req.id = newId;
    res.id = newId;
    next((done) => {
      req.id = originalId;
      res.id = originalId;
      done();
    });
  };
}
