import { isDeepStrictEqual } from 'util';
import clone from 'clone';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcMiddleware,
} from 'json-rpc-engine';
import { SafeEventEmitterProvider } from '../../src';

/**
 * An object that can be used to assign a canned response to a request made via
 * `provider.sendAsync`.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the response result.
 * @property request - An object that represents a JsonRpcRequest. Keys such as
 * `id` or `jsonrpc` may be omitted if you don't care about them.
 * @property response - A function that returns a JsonRpcResponse for that
 * request. This function takes two arguments: the *real* request and a
 * `callNumber`, which is the number of times the request has been made
 * (counting the first request as 1). This latter argument be used to specify
 * different responses for different instances of the same request.
 * @property remainAfterUse - Usually, when a request is made via
 * `provider.sendAsync`, the ProviderRequestStub which matches that request is
 * removed from the list of stubs, so that if the same request comes through
 * again, there will be no matching stub and an error will be thrown. This
 * feature is useful for making sure that all requests have canned responses.
 */
export interface ProviderRequestStub<Params, Result> {
  request: Partial<JsonRpcRequest<Params>>;
  response: (
    request: JsonRpcRequest<Params>,
    callNumber: number,
  ) => JsonRpcResponse<Result>;
  remainAfterUse?: boolean;
}

/**
 * Creates a middleware function that ends the request, but not before ensuring
 * that the response has been filled with something. Additionally this function
 * is a Jest mock function so that you can make assertions on it.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the response result.
 * @returns The created middleware, as a mock function.
 */
export function buildFinalMiddlewareWithDefaultResponse<
  Params,
  Result,
>(): JsonRpcMiddleware<Params, Result | 'default response'> {
  return jest.fn((req, res, _next, end) => {
    if (res.id === undefined) {
      res.id = req.id;
    }

    if (res.jsonrpc === undefined) {
      res.jsonrpc = '2.0';
    }

    if (res.result === undefined) {
      res.result = 'default response';
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
 * @param index - The index within the `params` array to add the "block" param.
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
 * @param index - The index within the `params` array where the "block" param
 * *would* appear.
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
 * Builds a canned response for a `eth_blockNumber` request made to
 * `provider.sendAsync` such that the response will return the given block
 * number. Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param blockNumber - The block number (default: '0x0').
 * @returns The request/response pair.
 */
export function buildStubForBlockNumberRequest(
  blockNumber = '0x0',
): ProviderRequestStub<undefined[], string> {
  return {
    request: {
      method: 'eth_blockNumber',
      params: [],
    },
    response: (req) => ({
      id: req.id,
      jsonrpc: '2.0',
      result: blockNumber,
    }),
  };
}

/**
 * Builds a canned response for a request made to `provider.sendAsync`. Intended
 * to be used in conjunction with `stubProviderRequests`. Although not strictly
 * necessary, it helps to assign a proper type to a request/response pair.
 *
 * @template Params - The type that represents the request params.
 * @template Result - The type that represents the response result.
 * @param requestStub - The request/response pair.
 * @returns The request/response pair, properly typed.
 */
export function buildStubForGenericRequest<Params, Result>(
  requestStub: ProviderRequestStub<Params, Result>,
) {
  return requestStub;
}

/**
 * Asserts that `provider.sendAsync` has not been called with the given request
 * object (or an object that can matched to that request).
 *
 * @param sendAsyncSpy - The Jest spy object that represents
 * `provider.sendAsync`.
 * @param requestMatcher - An object that can be matched to a request passed to
 * `provider.sendAsync`.
 */
export function expectProviderRequestNotToHaveBeenMade(
  sendAsyncSpy: jest.SpyInstance,
  requestMatcher: Partial<JsonRpcRequest<unknown>>,
) {
  expect(
    sendAsyncSpy.mock.calls.some((args) =>
      requestMatches(requestMatcher, args[0]),
    ),
  ).toBe(false);
}

/**
 * Provides a way to assign specific responses to specific requests that are
 * made through a provider. When `provider.sendAsync` is called, a stub matching
 * the request will be looked for; if one is found, it is used and then
 * discarded, unless `remainAfterUse` is set for the stub.
 *
 * @param provider - The provider.
 * @param stubs - A series of pairs, where each pair specifies a request object
 * — or part of one, at least — and a response for that request. The response
 * is actually a function that takes two arguments: the *real* request and the
 * number of times that that request has been made (counting the first as 1).
 * This latter argument be used to specify different responses for different
 * instances of the same request. The function should return a response object.
 * @returns The Jest spy object that represents `provider.sendAsync` (so that
 * you can make assertions on the method later, if you like).
 */
export function stubProviderRequests(
  provider: SafeEventEmitterProvider,
  stubs: ProviderRequestStub<any, any>[],
) {
  const remainingStubs = clone(stubs);
  const callNumbersByRequest = new Map<
    Partial<JsonRpcRequest<unknown>>,
    number
  >();
  return jest.spyOn(provider, 'sendAsync').mockImplementation((request, cb) => {
    const stubIndex = remainingStubs.findIndex((stub) =>
      requestMatches(stub.request, request),
    );

    if (stubIndex === -1) {
      throw new Error(`Unrecognized request ${JSON.stringify(request)}`);
    } else {
      const stub = remainingStubs[stubIndex];
      const callNumber = callNumbersByRequest.get(stub.request) ?? 1;

      cb(undefined, stub.response(request, callNumber));

      callNumbersByRequest.set(stub.request, callNumber + 1);

      if (!stub.remainAfterUse) {
        remainingStubs.splice(stubIndex, 1);
      }
    }
  });
}

/**
 * When using `stubProviderRequests` to list canned responses for specific
 * requests that are made to `provider.sendAsync`, you don't need to provide the
 * full request object to go along with the response, but only part of that
 * request object. When `provider.sendAsync` is then called, we can look up the
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
  requestMatcher: Partial<JsonRpcRequest<unknown>>,
  request: JsonRpcRequest<unknown>,
): boolean {
  return (Object.keys(requestMatcher) as (keyof typeof requestMatcher)[]).every(
    (key) => isDeepStrictEqual(requestMatcher[key], request[key]),
  );
}
