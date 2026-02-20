import type { JSONRPCResponse } from '@json-rpc-specification/meta-schema';
import type { InfuraNetworkType } from '@metamask/controller-utils';
import { BUILT_IN_NETWORKS } from '@metamask/controller-utils';
import type {
  BlockTracker,
  PollingBlockTrackerOptions,
} from '@metamask/eth-block-tracker';
import EthQuery from '@metamask/eth-query';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';
import nock, { isDone as nockIsDone } from 'nock';
import type { Scope as NockScope } from 'nock';

import { createNetworkClient } from '../../src/create-network-client';
import type {
  NetworkClientId,
  NetworkControllerOptions,
} from '../../src/NetworkController';
import type { RpcServiceOptions } from '../../src/rpc-service/rpc-service';
import type { NetworkClientConfiguration, Provider } from '../../src/types';
import { NetworkClientType } from '../../src/types';
import type { RootMessenger } from '../helpers';
import {
  buildNetworkControllerMessenger,
  buildRootMessenger,
} from '../helpers';

/**
 * A dummy value for the `infuraProjectId` option that `createInfuraClient`
 * needs. (Infura should not be hit during tests, but just in case, this should
 * not refer to a real project ID.)
 */
const MOCK_INFURA_PROJECT_ID = 'abc123';

/**
 * A dummy value for the `rpcUrl` option that `createJsonRpcClient` needs. (This
 * should not be hit during tests, but just in case, this should also not refer
 * to a real Infura URL.)
 */
const MOCK_RPC_URL = 'http://foo.com/';

/**
 * A default value for the `eth_blockNumber` request that the block tracker
 * makes.
 */
const DEFAULT_LATEST_BLOCK_NUMBER = '0x42';

/**
 * If you're having trouble writing a test and you're wondering why the test
 * keeps failing, you can set `process.env.DEBUG_PROVIDER_TESTS` to `1`. This
 * will turn on some extra logging.
 *
 * @param args - The arguments that `console.log` takes.
 */
function debug(...args: unknown[]): void {
  /* eslint-disable-next-line n/no-process-env */
  if (process.env.DEBUG_PROVIDER_TESTS === '1') {
    console.log(...args);
  }
}

/**
 * Builds a Nock scope object for mocking provider requests.
 *
 * @param rpcUrl - The URL of the RPC endpoint.
 * @param headers - Headers with which to mock the request.
 * @returns The nock scope.
 */
function buildScopeForMockingRequests(
  rpcUrl: string,
  headers: Record<string, string>,
): NockScope {
  return nock(rpcUrl, { reqheaders: headers }).filteringRequestBody((body) => {
    debug('Nock Received Request: ', body);
    return body;
  });
}

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockRequest = { method: string; params?: any[] };
type Response = {
  id?: number | string;
  jsonrpc?: '2.0';
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  httpStatus?: number;
};
export type MockResponse =
  | { body: JSONRPCResponse | string }
  | Response
  | (() => Response | Promise<Response>);
type CurriedMockRpcCallOptions = {
  request: MockRequest;
  // The response data.
  response?: MockResponse;
  /**
   * An error to throw while making the request.
   * Takes precedence over `response`.
   */
  error?: Error | string;
  /**
   * The amount of time that should pass before the
   * request resolves with the response.
   */
  delay?: number;
  /**
   * The number of times that the request is
   * expected to be made.
   */
  times?: number;
};

type MockRpcCallOptions = {
  // A nock scope (a set of mocked requests scoped to a certain base URL).
  nockScope: nock.Scope;
} & CurriedMockRpcCallOptions;

type MockRpcCallResult = nock.Interceptor | nock.Scope;

/**
 * Mocks a JSON-RPC request sent to the provider with the given response.
 * Provider type is inferred from the base url set on the nockScope.
 *
 * @param args - The arguments.
 * @param args.nockScope - A nock scope (a set of mocked requests scoped to a
 * certain base URL).
 * @param args.request - The request data.
 * @param args.response - Information concerning the response that the request
 * should have. If a `body` property is present, this is taken as the complete
 * response body. If an `httpStatus` property is present, then it is taken as
 * the HTTP status code to respond with. Properties other than these two are
 * used to build a complete response body (including `id` and `jsonrpc`
 * properties).
 * @param args.error - An error to throw while making the request. Takes
 * precedence over `response`.
 * @param args.delay - The amount of time that should pass before the request
 * resolves with the response.
 * @param args.times - The number of times that the request is expected to be
 * made.
 * @returns The nock scope.
 */
function mockRpcCall({
  nockScope,
  request,
  response,
  error,
  delay,
  times,
}: MockRpcCallOptions): MockRpcCallResult {
  // eth-query always passes `params`, so even if we don't supply this property,
  // for consistency with makeRpcCall, assume that the `body` contains it
  const { method, params = [], ...rest } = request;
  const httpStatus =
    (typeof response === 'object' &&
      'httpStatus' in response &&
      // Using nullish coalescing here breaks the tests.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      response.httpStatus) ||
    200;

  /* @ts-expect-error The types for Nock do not include `basePath` in the interface for Nock.Scope. */
  const url = nockScope.basePath.includes('infura.io')
    ? `/v3/${MOCK_INFURA_PROJECT_ID}`
    : '/';

  debug('Mocking request:', {
    url,
    method,
    params,
    response,
    error,
    ...rest,
    times,
  });

  let nockRequest = nockScope.post(url, {
    id: /\d*/u,
    jsonrpc: '2.0',
    method,
    params,
    ...rest,
  });

  if (delay !== undefined) {
    nockRequest = nockRequest.delay(delay);
  }

  if (times !== undefined) {
    nockRequest = nockRequest.times(times);
  }

  if (error !== undefined) {
    return nockRequest.replyWithError(error);
  }

  return nockRequest.reply(async (_uri, requestBody) => {
    const jsonRpcRequest = requestBody as JsonRpcRequest;
    let resolvedResponse: Response | string | JSONRPCResponse | undefined;
    if (typeof response === 'function') {
      resolvedResponse = await response();
    } else if (response !== undefined && 'body' in response) {
      resolvedResponse = response.body;
    } else {
      resolvedResponse = response;
    }

    if (
      typeof resolvedResponse === 'string' ||
      resolvedResponse === undefined
    ) {
      return [httpStatus, resolvedResponse];
    }

    const {
      id: jsonRpcId = jsonRpcRequest.id,
      jsonrpc: jsonRpcVersion = jsonRpcRequest.jsonrpc,
      result: jsonRpcResult,
      error: jsonRpcError,
    } = resolvedResponse;

    const completeResponse = {
      id: jsonRpcId,
      jsonrpc: jsonRpcVersion,
      result: jsonRpcResult,
      error: jsonRpcError,
    };
    debug('Nock returning Response', completeResponse);
    return [httpStatus, completeResponse];
  });
}

type MockBlockTrackerRequestOptions = {
  /**
   * A nock scope (a set of mocked requests scoped to a certain base url).
   */
  nockScope: NockScope;
  /**
   * The block number that the block tracker should report, as a 0x-prefixed hex
   * string.
   */
  blockNumber: string;
};

/**
 * Mocks the next request for the latest block that the block tracker will make.
 *
 * @param args - The arguments.
 * @param args.nockScope - A nock scope (a set of mocked requests scoped to a
 * certain base URL).
 * @param args.blockNumber - The block number that the block tracker should
 * report, as a 0x-prefixed hex string.
 */
function mockNextBlockTrackerRequest({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: MockBlockTrackerRequestOptions): void {
  mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });
}

/**
 * Mocks all requests for the latest block that the block tracker will make.
 *
 * @param args - The arguments.
 * @param args.nockScope - A nock scope (a set of mocked requests scoped to a
 * certain base URL).
 * @param args.blockNumber - The block number that the block tracker should
 * report, as a 0x-prefixed hex string.
 */
async function mockAllBlockTrackerRequests({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: MockBlockTrackerRequestOptions): Promise<void> {
  const result = mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });

  if ('persist' in result) {
    result.persist();
  }
}

/**
 * Makes a JSON-RPC call through the given eth-query object.
 *
 * @param ethQuery - The eth-query object.
 * @param request - The request data.
 * @returns A promise that either resolves with the result from the JSON-RPC
 * response if it is successful or rejects with the error from the JSON-RPC
 * response otherwise.
 */
function makeRpcCall(
  ethQuery: EthQuery,
  request: MockRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    debug('[makeRpcCall] making request', request);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethQuery.sendAsync(request, (error: any, result: any) => {
      debug('[makeRpcCall > ethQuery handler] error', error, 'result', result);
      if (error) {
        // This should be an error, but we will allow it to be whatever it is.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

export type ProviderType = 'infura' | 'custom';

export type MockOptions = {
  infuraNetwork?: InfuraNetworkType;
  failoverRpcUrls?: string[];
  providerType: ProviderType;
  customRpcUrl?: string;
  customChainId?: Hex;
  customTicker?: string;
  getRpcServiceOptions?: NetworkControllerOptions['getRpcServiceOptions'];
  getBlockTrackerOptions?: NetworkControllerOptions['getBlockTrackerOptions'];
  expectedHeaders?: Record<string, string>;
  messenger?: RootMessenger;
  networkClientId?: NetworkClientId;
  isRpcFailoverEnabled?: boolean;
};

export type MockCommunications = {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockNextBlockTrackerRequest: (options?: any) => void;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAllBlockTrackerRequests: (options?: any) => void;
  mockRpcCall: (options: CurriedMockRpcCallOptions) => MockRpcCallResult;
  rpcUrl: string;
  infuraNetwork: InfuraNetworkType;
};

/**
 * Sets up request mocks for requests to the provider.
 *
 * @param options - An options bag.
 * @param options.providerType - The type of network client being tested.
 * @param options.infuraNetwork - The name of the Infura network being tested,
 * assuming that `providerType` is "infura" (default: "mainnet").
 * @param options.customRpcUrl - The URL of the custom RPC endpoint, assuming
 * that `providerType` is "custom".
 * @param options.expectedHeaders - Headers with which to mock the request.
 * @param fn - A function which will be called with an object that allows
 * interaction with the network client.
 * @returns The return value of the given function.
 */
export async function withMockedCommunications(
  {
    providerType,
    infuraNetwork = 'mainnet',
    customRpcUrl = MOCK_RPC_URL,
    expectedHeaders = {},
  }: MockOptions,
  fn: (comms: MockCommunications) => Promise<void>,
): Promise<void> {
  const rpcUrl =
    providerType === 'infura'
      ? `https://${infuraNetwork}.infura.io`
      : customRpcUrl;
  const nockScope = buildScopeForMockingRequests(rpcUrl, expectedHeaders);
  const curriedMockNextBlockTrackerRequest = (
    localOptions: Omit<MockBlockTrackerRequestOptions, 'nockScope'>,
  ): void => mockNextBlockTrackerRequest({ nockScope, ...localOptions });
  const curriedMockAllBlockTrackerRequests = (
    localOptions: Omit<MockBlockTrackerRequestOptions, 'nockScope'>,
  ): Promise<void> =>
    mockAllBlockTrackerRequests({ nockScope, ...localOptions });
  const curriedMockRpcCall = (
    localOptions: Omit<MockRpcCallOptions, 'nockScope'>,
  ): MockRpcCallResult => mockRpcCall({ nockScope, ...localOptions });

  const comms = {
    mockNextBlockTrackerRequest: curriedMockNextBlockTrackerRequest,
    mockAllBlockTrackerRequests: curriedMockAllBlockTrackerRequests,
    mockRpcCall: curriedMockRpcCall,
    rpcUrl,
    infuraNetwork,
  };

  try {
    return await fn(comms);
  } finally {
    nockIsDone();
  }
}

type MockNetworkClient = {
  blockTracker: BlockTracker;
  provider: Provider;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeRpcCall: (request: MockRequest) => Promise<any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeRpcCallsInSeries: (requests: MockRequest[]) => Promise<any[]>;
  messenger: RootMessenger;
  chainId: Hex;
  rpcUrl: string;
};

/**
 * Some middleware contain logic which retries the request if some condition
 * applies. This retrying always happens out of band via `setTimeout`, and
 * because we are stubbing time via Jest's fake timers, we have to manually
 * advance the clock so that the `setTimeout` handlers get fired. We don't know
 * when these timers will get created, however, so we have to keep advancing
 * timers until the request has been made an appropriate number of times.
 * Unfortunately we don't have a good way to know how many times a request has
 * been retried, but the good news is that the middleware won't end, and thus
 * the promise which the RPC call returns won't get fulfilled, until all retries
 * have been made.
 *
 * @param promise - The promise which is returned by the RPC call.
 * @returns The given promise.
 */
export async function waitForPromiseToBeFulfilledAfterRunningAllTimers<Type>(
  promise: Promise<Type>,
): Promise<Type> {
  let hasPromiseBeenFulfilled = false;
  let numTimesClockHasBeenAdvanced = 0;

  promise
    .catch((error: unknown) => {
      // This is used to silence Node.js warnings about the rejection
      // being handled asynchronously. The error is handled later when
      // `promise` is awaited, but we log it here anyway in case it gets
      // swallowed.
      debug(error);
    })
    .finally(() => {
      hasPromiseBeenFulfilled = true;
    });

  // `hasPromiseBeenFulfilled` is modified asynchronously.
  /* eslint-disable-next-line no-unmodified-loop-condition */
  while (!hasPromiseBeenFulfilled && numTimesClockHasBeenAdvanced < 30) {
    await jest.runAllTimersAsync();
    numTimesClockHasBeenAdvanced += 1;
  }

  return promise;
}

/**
 * Builds a provider from the middleware (for the provider type) along with a
 * block tracker, runs the given function with those two things, and then
 * ensures the block tracker is stopped at the end.
 *
 * @param options - An options bag.
 * @param options.providerType - The type of network client being tested.
 * @param options.failoverRpcUrls - The list of failover endpoint
 * URLs to use.
 * @param options.infuraNetwork - The name of the Infura network being tested,
 * assuming that `providerType` is "infura" (default: "mainnet").
 * @param options.customRpcUrl - The URL of the custom RPC endpoint, assuming
 * that `providerType` is "custom".
 * @param options.customChainId - The chain id belonging to the custom RPC
 * endpoint, assuming that `providerType` is "custom" (default: "0x1").
 * @param options.customTicker - The ticker of the custom RPC endpoint, assuming
 * that `providerType` is "custom" (default: "ETH").
 * @param options.getRpcServiceOptions - RPC service options factory.
 * @param options.getBlockTrackerOptions - Block tracker options factory.
 * @param options.messenger - The root messenger to use in tests.
 * @param options.networkClientId - The ID of the new network client.
 * @param options.isRpcFailoverEnabled - Whether or not the RPC failover
 * functionality is enabled.
 * @param fn - A function which will be called with an object that allows
 * interaction with the network client.
 * @returns The return value of the given function.
 */
export async function withNetworkClient<Type>(
  {
    providerType,
    failoverRpcUrls = [],
    infuraNetwork = 'mainnet',
    customRpcUrl = MOCK_RPC_URL,
    customChainId = '0x1',
    customTicker = 'ETH',
    getRpcServiceOptions = (): Omit<
      RpcServiceOptions,
      'failoverService' | 'endpointUrl'
    > => ({ fetch, btoa, isOffline: (): boolean => false }),
    getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({}),
    messenger = buildRootMessenger(),
    networkClientId = 'some-network-client-id',
    isRpcFailoverEnabled = false,
  }: MockOptions,
  fn: (client: MockNetworkClient) => Promise<Type>,
): Promise<Type> {
  // Faking timers ends up doing two things:
  // 1. Halting the block tracker (which depends on `setTimeout` to periodically
  // request the latest block) set up in `eth-json-rpc-middleware`
  // 2. Halting the retry logic in `@metamask/eth-json-rpc-infura` (which also
  // depends on `setTimeout`)
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

  const networkControllerMessenger = buildNetworkControllerMessenger(messenger);

  // The JSON-RPC client wraps `eth_estimateGas` so that it takes 2 seconds longer
  // than it usually would to complete. Or at least it should — this doesn't
  // appear to be working correctly. Unset `IN_TEST` on `process.env` to prevent
  // this behavior.
  /* eslint-disable-next-line n/no-process-env */
  const inTest = process.env.IN_TEST;
  /* eslint-disable-next-line n/no-process-env */
  delete process.env.IN_TEST;
  const networkClientConfiguration: NetworkClientConfiguration =
    providerType === 'infura'
      ? {
          network: infuraNetwork,
          failoverRpcUrls,
          infuraProjectId: MOCK_INFURA_PROJECT_ID,
          type: NetworkClientType.Infura,
          chainId: BUILT_IN_NETWORKS[infuraNetwork].chainId,
          ticker: BUILT_IN_NETWORKS[infuraNetwork].ticker,
        }
      : {
          chainId: customChainId,
          failoverRpcUrls,
          rpcUrl: customRpcUrl,
          type: NetworkClientType.Custom,
          ticker: customTicker,
        };

  const { chainId } = networkClientConfiguration;

  const rpcUrl =
    providerType === 'custom'
      ? customRpcUrl
      : `https://${infuraNetwork}.infura.io/v3/${MOCK_INFURA_PROJECT_ID}`;

  const networkClient = createNetworkClient({
    id: networkClientId,
    configuration: networkClientConfiguration,
    getRpcServiceOptions,
    getBlockTrackerOptions,
    messenger: networkControllerMessenger,
    isRpcFailoverEnabled,
  });
  /* eslint-disable-next-line n/no-process-env */
  process.env.IN_TEST = inTest;

  const { provider, blockTracker } = networkClient;

  const ethQuery = new EthQuery(provider);
  const curriedMakeRpcCall = (request: MockRequest): Promise<unknown> =>
    makeRpcCall(ethQuery, request);
  const makeRpcCallsInSeries = async (
    requests: MockRequest[],
  ): Promise<unknown[]> => {
    const responses: unknown[] = [];
    for (const request of requests) {
      responses.push(await curriedMakeRpcCall(request));
    }
    return responses;
  };

  const client = {
    blockTracker,
    provider,
    makeRpcCall: curriedMakeRpcCall,
    makeRpcCallsInSeries,
    messenger,
    chainId,
    rpcUrl,
  };

  try {
    return await fn(client);
  } finally {
    await blockTracker.destroy();

    jest.useRealTimers();
  }
}

type BuildMockParamsOptions = {
  blockParam?: Json;
  blockParamIndex: number;
};

/**
 * Build mock parameters for a JSON-RPC call.
 *
 * The string 'some value' is used as the default value for each entry. The
 * block parameter index determines the number of parameters to generate.
 *
 * The block parameter can be set to a custom value. If no value is given, it
 * is set as undefined.
 *
 * @param args - Arguments.
 * @param args.blockParamIndex - The index of the block parameter.
 * @param args.blockParam - The block parameter value to set.
 * @returns The mock params.
 */
export function buildMockParams({
  blockParam,
  blockParamIndex,
}: BuildMockParamsOptions): Json[] {
  const params = new Array(blockParamIndex).fill('some value');
  params[blockParamIndex] = blockParam;

  return params;
}

/**
 * Returns a partial JSON-RPC request object, with the "block" param replaced
 * with the given value.
 *
 * @param request - The request object.
 * @param request.method - The request method.
 * @param request.params - The request params.
 * @param blockParamIndex - The index within the `params` array of the block
 * param.
 * @param blockParam - The desired block param value.
 * @returns The updated request object.
 */
export function buildRequestWithReplacedBlockParam(
  { method, params = [] }: MockRequest,
  blockParamIndex: number,
  blockParam: unknown,
): { method: string; params: unknown[] } {
  const updatedParams = params.slice();
  updatedParams[blockParamIndex] = blockParam;
  return { method, params: updatedParams };
}
