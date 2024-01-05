import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { serializeError } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';
import { MethodCallValidator, MethodNotFoundError, parseOpenRPCDocument } from '@open-rpc/schema-utils-js';

export type ApiSpecValidationMiddlewareJsonRpcRequest = JsonRpcRequest;

/**
 * Creates a JSON-RPC middleware for handling queued requests. This middleware
 * intercepts JSON-RPC requests, checks if they require queueing, and manages
 * their execution based on the specified options.
 *
 * @returns The JSON-RPC middleware that manages queued requests.
 */
export const createApiSpecValidationMiddleware = async (): Promise<JsonRpcMiddleware<JsonRpcParams, Json>> => {
  // deref the spec
  const dereferencedSpec = await parseOpenRPCDocument('https://metamask.github.io/api-specs/latest/openrpc.json');
  // create new validator from api spec
  const validator = new MethodCallValidator(dereferencedSpec);

  return createAsyncMiddleware(
    async (req: ApiSpecValidationMiddlewareJsonRpcRequest, res, next) => {
      // use validator
      const validationErrors = validator.validate(req.method, req.params);
      // do validation stuff
      if (validationErrors instanceof MethodNotFoundError) {
        res.error = {
          code: -32601,
          message: validationErrors.message,
          data: {}
        };
        return;
      } else if (validationErrors.length !== 0) {
        res.error = {
          code: -32602,
          message: 'Invalid params',
          data: {
            errors: JSON.stringify(validationErrors)
          }
        };
        return;
      }

      return next();
    },
  );
};
