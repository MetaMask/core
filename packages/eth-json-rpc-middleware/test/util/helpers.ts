import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type {
  JsonRpcMiddleware,
  ResultConstraint,
} from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';
import { klona } from 'klona/full';
import { isDeepStrictEqual } from 'util';

import type { WalletMiddlewareKeyValues } from '../../src/wallet';

export const createRequest = <
  Input extends Partial<JsonRpcRequest<Json[]>>,
  Output extends Input & JsonRpcRequest<Json[]>,
>(
  request: Input,
): Output => {
  return {
    jsonrpc: '2.0',
    id: request.id ?? '1',
    method: request.method ?? 'test_request',
    // Not using nullish coalescing, since `params` may be `null`.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    params: request.params === undefined ? [] : request.params,
  } as Output;
};

const createHandleOptions = (
  keyValues: Partial<WalletMiddlewareKeyValues> = {},
): { context: WalletMiddlewareKeyValues } => ({
  context: {
    networkClientId: 'test-client-id',
    origin: 'test-origin',
    ...keyValues,
  },
});

export const createHandleParams = <
  InputReq extends Partial<JsonRpcRequest<Json[]>>,
  OutputReq extends InputReq & JsonRpcRequest<Json[]>,
>(
  request: InputReq,
  keyValues: Partial<WalletMiddlewareKeyValues> = {},
): [OutputReq, ReturnType<typeof createHandleOptions>] => [
  createRequest(request),
  createHandleOptions(keyValues),
];

/**
 * An object that can be used to assign a canned result to a request made via
 * `provider.request`.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the result.
 */
export type ProviderRequestStub<
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  /**
   * An object that represents a JsonRpcRequest. Keys such as
   * `id` or `jsonrpc` may be omitted if you don't care about them.
   */
  request: Partial<JsonRpcRequest<Params>>;
  /**
   * A function that returns a result for that request.
   * This function takes `callNumber` argument,
   * which is the number of times the request has been made
   * (counting the first request as 1). This latter argument be used to specify
   * different results for different instances of the same request.
   */
  result: (callNumber: number) => Promise<Result>;
  /**
   * Usually, when a request is made via
   * `provider.request`, the ProviderRequestStub which matches that request is
   * removed from the list of stubs, so that if the same request comes through
   * again, there will be no matching stub and an error will be thrown. This
   * feature is useful for making sure that all requests have canned results.
   */
  remainAfterUse?: boolean;
};

/**
 * Creates a middleware function that ends the request, but not before ensuring
 * that the result has been filled with something. Additionally this function
 * is a Jest mock function so that you can make assertions on it.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the result.
 * @returns The created middleware, as a mock function.
 */
export function createFinalMiddlewareWithDefaultResult(): JsonRpcMiddleware<JsonRpcRequest> {
  return jest.fn(async ({ next }) => {
    // Not a Node.js callback
    // eslint-disable-next-line n/callback-return
    const result = await next();
    if (result === undefined) {
      return 'default result';
    }
    return result;
  });
}

/**
 * Creates a provider and block tracker. The provider is the block tracker's
 * provider.
 *
 * @returns The provider and block tracker.
 */
export function createProviderAndBlockTracker(): {
  provider: InternalProvider;
  blockTracker: PollingBlockTracker;
} {
  const engine = new JsonRpcEngine();
  const provider = new InternalProvider({ engine });

  const blockTracker = new PollingBlockTracker({
    provider,
  });

  return { provider, blockTracker };
}

// An expedient for use with createEngine below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMiddleware = JsonRpcMiddleware<any, ResultConstraint<any>, any>;

/**
 * Creates a JSON-RPC engine with the middleware under test and any
 * additional middleware. If no other middleware is provided, a final middleware
 * that returns a default result is added.
 *
 * @param middlewareUnderTest - The middleware under test.
 * @param otherMiddleware - Any additional middleware.
 * @returns The created engine.
 */
export function createEngine(
  middlewareUnderTest: AnyMiddleware,
  ...otherMiddleware: AnyMiddleware[]
): JsonRpcEngineV2 {
  return JsonRpcEngineV2.create({
    middleware: [
      middlewareUnderTest,
      ...(otherMiddleware.length === 0
        ? [createFinalMiddlewareWithDefaultResult()]
        : otherMiddleware),
    ],
  });
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function creates a `params` array for such an
 * endpoint with the given "block" param added at the end.
 *
 * @param blockParamIndex - The index within the `params` array to add the "block" param.
 * @param blockParam - The desired "block" param to add.
 * @returns The mock params.
 */
export function createMockParamsWithBlockParamAt(
  blockParamIndex: number,
  blockParam: string,
): string[] {
  const params = [];

  for (let i = 0; i < blockParamIndex; i++) {
    params.push('some value');
  }

  params.push(blockParam);
  return params;
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function creates a mock `params` array for
 * such an endpoint, filling it with arbitrary values, but with the "block"
 * param missing.
 *
 * @param blockParamIndex - The index within the `params` array where the "block" param
 * would* appear.
 * @returns The mock params.
 */
export function createMockParamsWithoutBlockParamAt(
  blockParamIndex: number,
): string[] {
  const params = [];

  for (let i = 0; i < blockParamIndex; i++) {
    params.push('some value');
  }

  return params;
}

/**
 * Creates a canned result for a `eth_blockNumber` request made to
 * `provider.request` such that the result will return the given block
 * number. Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param blockNumber - The block number (default: '0x0').
 * @returns The request/result pair.
 */
export function createStubForBlockNumberRequest(
  blockNumber = '0x0',
): ProviderRequestStub<JsonRpcParams, Json> {
  return {
    request: {
      method: 'eth_blockNumber',
      params: [],
    },
    result: async () => blockNumber,
  };
}

/**
 * Creates a canned result for a request made to `provider.request`. Intended
 * to be used in conjunction with `stubProviderRequests`. Although not strictly
 * necessary, it helps to assign a proper type to a request/result pair.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the result.
 * @param requestStub - The request/result pair.
 * @returns The request/result pair, properly typed.
 */
export function createStubForGenericRequest<
  Params extends JsonRpcParams,
  Result extends Json,
>(
  requestStub: ProviderRequestStub<Params, Result>,
): ProviderRequestStub<Params, Result> {
  return requestStub;
}

/**
 * Asserts that `provider.request` has not been called with the given request
 * object (or an object that can matched to that request).
 *
 * @param requestSpy - The Jest spy object that represents
 * `provider.request`.
 * @param requestMatcher - An object that can be matched to a request passed to
 * `provider.request`.
 */
export function expectProviderRequestNotToHaveBeenMade(
  requestSpy: jest.SpyInstance,
  requestMatcher: Partial<JsonRpcRequest>,
): void {
  expect(
    requestSpy.mock.calls.some((args) =>
      requestMatches(requestMatcher, args[0]),
    ),
  ).toBe(false);
}

/**
 * Provides a way to assign specific results to specific requests that are
 * made through a provider. When `provider.request` is called, a stub matching
 * the request will be looked for; if one is found, it is used and then
 * discarded, unless `remainAfterUse` is set for the stub.
 *
 * @param provider - The provider.
 * @param stubs - A series of pairs, where each pair specifies a request object
 * — or part of one, at least — and a result for that request. The result
 * is actually a function that takes one argument, which is the number of times
 * that request has been made (counting the first as 1).
 * This latter argument be used to specify different results for different
 * instances of the same request. The function should return a result.
 * @returns The Jest spy object that represents `provider.request` (so that
 * you can make assertions on the method later, if you like).
 */
export function stubProviderRequests<
  Params extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
>(
  provider: InternalProvider,
  stubs: ProviderRequestStub<Params, Result>[],
): jest.SpyInstance<Promise<Json>, Parameters<InternalProvider['request']>> {
  const remainingStubs = klona(stubs);
  const callNumbersByRequest = new Map<Partial<JsonRpcRequest>, number>();
  return jest.spyOn(provider, 'request').mockImplementation(async (request) => {
    const stubIndex = remainingStubs.findIndex((stub) =>
      requestMatches(stub.request, request),
    );

    if (stubIndex === -1) {
      throw new Error(`Unrecognized request ${JSON.stringify(request)}`);
    } else {
      const stub = remainingStubs[stubIndex];
      const callNumber = callNumbersByRequest.get(stub.request) ?? 1;

      callNumbersByRequest.set(stub.request, callNumber + 1);

      if (!stub.remainAfterUse) {
        remainingStubs.splice(stubIndex, 1);
      }

      return await stub.result(callNumber);
    }
  });
}

/**
 * When using `stubProviderRequests` to list canned results for specific
 * requests that are made to `provider.request`, you don't need to provide the
 * full request object to go along with the result, but only part of that
 * request object. When `provider.request` is then called, we can look up the
 * compare the real request object to the request object that was specified to
 * find a match. This function is used to do that comparison (and other
 * like comparisons).
 *
 * @param requestMatcher - A partial request object.
 * @param request - A real request object.
 * @returns True or false depending on whether the partial request object "fits
 * inside" the real request object.
 */
export function requestMatches(
  requestMatcher: Partial<JsonRpcRequest>,
  request: Partial<JsonRpcRequest>,
): boolean {
  return (Object.keys(requestMatcher) as (keyof typeof requestMatcher)[]).every(
    (key) => isDeepStrictEqual(requestMatcher[key], request[key]),
  );
}
