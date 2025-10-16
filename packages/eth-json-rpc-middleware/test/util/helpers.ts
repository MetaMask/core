import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';
import { klona } from 'klona/full';
import { isDeepStrictEqual } from 'util';

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
export function buildFinalMiddlewareWithDefaultResult<
  Params extends JsonRpcParams,
  Result extends Json,
>(): JsonRpcMiddleware<Params, Result | 'default result'> {
  return jest.fn((req, res, _next, end) => {
    if (res.id === undefined) {
      res.id = req.id;
    }

    res.jsonrpc ??= '2.0';

    if (res.result === undefined) {
      res.result = 'default result';
    }

    end();
  });
}

/**
 * Creates a middleware function that just ends the request, but is also a Jest
 * mock function so that you can make assertions on it.
 *
 * @returns The created middleware, as a mock function.
 */
export function buildSimpleFinalMiddleware() {
  return jest.fn((_req, _res, _next, end) => {
    end();
  });
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function builds a `params` array for such an
 * endpoint with the given "block" param added at the end.
 *
 * @param blockParamIndex - The index within the `params` array to add the "block" param.
 * @param blockParam - The desired "block" param to add.
 * @returns The mock params.
 */
export function buildMockParamsWithBlockParamAt(
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
 * it is optional. Given this, this function builds a mock `params` array for
 * such an endpoint, filling it with arbitrary values, but with the "block"
 * param missing.
 *
 * @param blockParamIndex - The index within the `params` array where the "block" param
 * would* appear.
 * @returns The mock params.
 */
export function buildMockParamsWithoutBlockParamAt(
  blockParamIndex: number,
): string[] {
  const params = [];

  for (let i = 0; i < blockParamIndex; i++) {
    params.push('some value');
  }

  return params;
}

/**
 * Builds a canned result for a `eth_blockNumber` request made to
 * `provider.request` such that the result will return the given block
 * number. Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param blockNumber - The block number (default: '0x0').
 * @returns The request/result pair.
 */
export function buildStubForBlockNumberRequest(
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
 * Builds a canned result for a request made to `provider.request`. Intended
 * to be used in conjunction with `stubProviderRequests`. Although not strictly
 * necessary, it helps to assign a proper type to a request/result pair.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the result.
 * @param requestStub - The request/result pair.
 * @returns The request/result pair, properly typed.
 */
export function buildStubForGenericRequest<
  Params extends JsonRpcParams,
  Result extends Json,
>(requestStub: ProviderRequestStub<Params, Result>) {
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
) {
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
export function stubProviderRequests(
  provider: SafeEventEmitterProvider,
  stubs: ProviderRequestStub<any, Json>[],
) {
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
