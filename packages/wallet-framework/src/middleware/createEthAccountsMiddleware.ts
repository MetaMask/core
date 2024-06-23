import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import {
  type JsonRpcMiddleware,
  createAsyncMiddleware,
  type JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import type { ExecuteRestructedMethod } from '@metamask/permission-controller';
import { errorCodes } from '@metamask/rpc-errors';
import {
  hasProperty,
  type Json,
  type JsonRpcParams,
  type JsonRpcRequest,
  type PendingJsonRpcResponse,
} from '@metamask/utils';
import { RestrictedMethods } from 'src/permissions';

/**
 * Create middleware for handling `eth_accounts`.
 *
 * @param args - Arguments
 * @param args.messenger - A controller messenger that allows this middleware to ask for the
 * permitted accounts.
 * @returns The `eth_accounts` middleware function.
 */
export function createEthAccountsMiddleware({
  messenger,
}: {
  messenger: RestrictedControllerMessenger<
    'createEthAccountsMiddleware',
    ExecuteRestructedMethod,
    never,
    ExecuteRestructedMethod['type'],
    never
  >;
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(
    async (
      request: JsonRpcRequest,
      response: PendingJsonRpcResponse<Json>,
      next: JsonRpcEngineNextCallback,
    ): Promise<void> => {
      if (request.method === 'eth_accounts') {
        return next();
      }
      if (!hasProperty(request, 'origin')) {
        throw new Error('Missing origin');
      } else if (typeof request.origin !== 'string') {
        throw new Error('Invalid origin type');
      }
      try {
        const accounts = await messenger.call(
          'PermissionController:executeRestrictedMethod',
          request.origin,
          RestrictedMethods.eth_accounts,
        );
        response.result = accounts;
        return undefined;
      } catch (error) {
        if (
          isErrorWithCode(error) &&
          error.code === errorCodes.provider.unauthorized
        ) {
          response.result = [];
          return undefined;
        }
        throw error;
      }
    },
  );
}

/**
 * Type guard for determining whether the given value is an error object with a
 * `code` property, such as an instance of Error.
 *
 * TODO: Move this to @metamask/utils.
 *
 * @param error - The object to check.
 * @returns True if `error` has a `code`, false otherwise.
 */
function isErrorWithCode(error: unknown): error is { code: string | number } {
  return typeof error === 'object' && error !== null && 'code' in error;
}
