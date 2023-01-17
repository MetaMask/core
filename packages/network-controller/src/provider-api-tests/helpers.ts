import nock from 'nock';
import sinon from 'sinon';
import { Scope as NockScope } from 'nock';
import { JSONRPCResponse, JSONRPCResponseResult } from '@json-rpc-specification/meta-schema';
import NetworkController, { EthQuery as TEthQuery, NetworkControllerMessenger } from '../NetworkController';
import EthQuery from 'eth-query';
import { ControllerMessenger } from '@metamask/base-controller';
import { NetworkType } from '@metamask/controller-utils';

/**
 * @typedef {import('nock').Scope} NockScope
 *
 * A object returned by the `nock` function for mocking requests to a particular
 * base URL.
 */

/**
 * @typedef {{blockTracker: import('eth-block-tracker').PollingBlockTracker, clock: sinon.SinonFakeTimers, makeRpcCall: (request: Partial<JsonRpcRequest>) => Promise<any>, makeRpcCallsInSeries: (requests: Partial<JsonRpcRequest>[]) => Promise<any>}} Client
 *
 * Provides methods to interact with the suite of middleware that
 * `createInfuraClient` or `createJsonRpcClient` exposes.
 */

/**
 * @typedef {{providerType: "infura" | "custom", infuraNetwork?: string, customRpcUrl?: string, customChainId?: string}} WithClientOptions
 *
 * The options bag that `withNetworkClient` takes.
 */

/**
 * @typedef {(client: Client) => Promise<any>} WithClientCallback
 *
 * The callback that `withNetworkClient` takes.
 */

/**
 * @typedef {{ nockScope: NockScope, blockNumber: string }} MockBlockTrackerRequestOptions
 *
 * The options to `mockNextBlockTrackerRequest` and `mockAllBlockTrackerRequests`.
 */

/**
 * @typedef {{ nockScope: NockScope, request: object, response: object, delay?: number }} MockRpcCallOptions
 *
 * The options to `mockRpcCall`.
 */

/**
 * @typedef {{mockNextBlockTrackerRequest: (options: Omit<MockBlockTrackerRequestOptions, 'nockScope'>) => void, mockAllBlockTrackerRequests: (options: Omit<MockBlockTrackerRequestOptions, 'nockScope'>) => void, mockRpcCall: (options: Omit<MockRpcCallOptions, 'nockScope'>) => NockScope, rpcUrl: string, infuraNetwork: string}} Communications
 *
 * Provides methods to mock different kinds of requests to the provider.
 */

/**
 * @typedef {{providerType: 'infura' | 'custom', infuraNetwork?: string}} WithMockedCommunicationsOptions
 *
 * The options bag that `Communications` takes.
 */

/**
 * @typedef {(comms: Communications) => Promise<any>} WithMockedCommunicationsCallback
 *
 * The callback that `mockingCommunications` takes.
 */

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
const MOCK_RPC_URL = 'http://foo.com';

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
 * @param {any[]} args - The arguments that `console.log` takes.
 */
function debug(...args: any) {
  if (process.env.DEBUG_PROVIDER_TESTS === '1') {
    console.log(...args);
  }
}

/**
 * Builds a Nock scope object for mocking provider requests.
 *
 * @param {string} rpcUrl - The URL of the RPC endpoint.
 * @returns {NockScope} The nock scope.
 */
function buildScopeForMockingRequests(rpcUrl: string) {
  return nock(rpcUrl).filteringRequestBody((body) => {
    const copyOfBody = JSON.parse(body);
    // Some IDs are random, so remove them entirely from the request to make it
    // possible to mock these requests
    delete copyOfBody.id;
    return JSON.stringify(copyOfBody);
  });
}

type MockInitialGetBlockByNumberOptions = {
  /**
   * A nock scope (a set of mocked requests scoped to a certain base url).
   */
  nockScope: NockScope,
  /**
   * The block number that the block tracker should report, as a 0x-prefixed hex string.
   */
  block: any,
};

/**
 * Mocks the next request for the latest block that the block tracker will make.
 */
function mockInitialGetBlockByNumber({ nockScope, block }: MockInitialGetBlockByNumberOptions) {
  mockRpcCall({
    nockScope,
    request: { method: 'eth_getBlockByNumber', params: ['latest', false] },
    response: { result: block },
  });
}

type MockBlockTrackerRequestOptions = {
  /**
   * A nock scope (a set of mocked requests scoped to a certain base url).
   */
  nockScope: NockScope,
  /**
   * The block number that the block tracker should report, as a 0x-prefixed hex string.
   */
  blockNumber: string,
};

/**
 * Mocks the next request for the latest block that the block tracker will make.
 */
function mockNextBlockTrackerRequest({ nockScope, blockNumber = DEFAULT_LATEST_BLOCK_NUMBER }: MockBlockTrackerRequestOptions) {
  mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });
}

/**
 * Mocks all requests for the latest block that the block tracker will make.
 */
function mockAllBlockTrackerRequests({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: MockBlockTrackerRequestOptions) {
  (mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  }) as NockScope).persist();
}

type Request = { method: string, params?: any[] };
type Response = { error?: any, result?: any, httpStatus?: number, [k: string]: any };
type ResponseBody = { body: JSONRPCResponse };
type BodyOrResponse = ResponseBody | Response;
type CurriedMockRpcCallOptions = {
  request: Request,
  // The response data.
  response?: BodyOrResponse,
  /**
   * An error to throw while making the request.
   * Takes precedence over `response`.
   */
  error?: Error | string,
  /**
   * The amount of time that should pass before the
   * request resolves with the response.
   */
  delay?: number,
  /**
   * The number of times that the request is
   * expected to be made.
   */
  times?: number,
};
type MockRpcCallOptions = {
  // A nock scope (a set of mocked requests scoped to a certain base URL).
  nockScope: nock.Scope,
} & CurriedMockRpcCallOptions;

type MockRpcCallResult = nock.Interceptor | nock.Scope;
/**
 * Mocks a JSON-RPC request sent to the provider with the given response.
 * Provider type is inferred from the base url set on the nockScope.
 *
 * @param {MockRpcCallOptions} args - The arguments.
 * @returns The nock scope.
 */
function mockRpcCall({ nockScope, request, response, error, delay, times }: MockRpcCallOptions): MockRpcCallResult {
  // eth-query always passes `params`, so even if we don't supply this property,
  // for consistency with makeRpcCall, assume that the `body` contains it
  const { method, params = [], ...rest } = request;
  const httpStatus = (response as Response)?.httpStatus ?? 200;
  let completeResponse: JSONRPCResponse = { id: 1, jsonrpc: '2.0' };
  if (response !== undefined) {
    if (response.body === undefined) {
      completeResponse = { id: 1, jsonrpc: '2.0' };
      ['id', 'jsonrpc', 'result', 'error'].forEach((prop) => {
        const val = (response as Response)[prop];
        if (val !== undefined) {
          completeResponse[prop] = val;
        }
      });
    } else {
      completeResponse = response.body;
    }
  }
  const url = (nockScope as any).basePath.includes('infura.io')
    ? `/v3/${MOCK_INFURA_PROJECT_ID}`
    : '/';
  let nockRequest = nockScope.post(url, {
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
  } else if (completeResponse !== undefined) {
    return nockRequest.reply(httpStatus, completeResponse);
  }
  return nockRequest;
}

/**
 * Makes a JSON-RPC call through the given eth-query object.
 *
 * @param ethQuery - The eth-query object.
 * @param request - The request data.
 * @returns A promise that either resolves with the result from
 * the JSON-RPC response if it is successful or rejects with the error from the
 * JSON-RPC response otherwise.
 */
function makeRpcCall(ethQuery: TEthQuery, request: Request): Promise<JSONRPCResponseResult> {
  return new Promise((resolve, reject) => {
    debug('[makeRpcCall] making request', request);
    ethQuery.sendAsync(request, (error: any, result: JSONRPCResponseResult) => {
      debug('[makeRpcCall > ethQuery handler] error', error, 'result', result);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

export type MockOptions = {
  infuraNetwork?: NetworkType,
  providerType: 'infura' | 'custom',
  customRpcUrl?: string,
  customChainId?: string,
};

type MockCommunications = {
  mockNextBlockTrackerRequest: (options?: any) => void,
  mockAllBlockTrackerRequests: (options?: any) => void,
  mockInitialGetBlockByNumber: (block: any) => void,
  mockRpcCall: (arg0: CurriedMockRpcCallOptions) => MockRpcCallResult,
};

/**
 * Sets up request mocks for requests to the provider.
 *
 * @param options - An options bag.
 * @returns {Promise<any>} The return value of the given function.
 */
export async function withMockedCommunications(
  { providerType, infuraNetwork = 'mainnet', customRpcUrl = MOCK_RPC_URL }: MockOptions,
  fn: (comms: MockCommunications) => Promise<void>,
): Promise<any> {
  if (providerType !== 'infura' && providerType !== 'custom') {
    throw new Error(
      `providerType must be either "infura" or "custom", was "${providerType}" instead`,
    );
  }

  const rpcUrl =
    providerType === 'infura'
      ? `https://${infuraNetwork}.infura.io`
      : customRpcUrl;
  const nockScope = buildScopeForMockingRequests(rpcUrl);
  const curriedMockNextBlockTrackerRequest = (localOptions: any) =>
    mockNextBlockTrackerRequest({ nockScope, ...localOptions });
  const curriedMockAllBlockTrackerRequests = (localOptions: any) =>
    mockAllBlockTrackerRequests({ nockScope, ...localOptions });
  const curriedMockRpcCall = (localOptions: any) =>
    mockRpcCall({ nockScope, ...localOptions });
  const curriedMockInitialGetBlockByNumber = (localOptions: any) =>
    mockInitialGetBlockByNumber({ nockScope, ...localOptions });
  const comms = {
    mockNextBlockTrackerRequest: curriedMockNextBlockTrackerRequest,
    mockAllBlockTrackerRequests: curriedMockAllBlockTrackerRequests,
    mockRpcCall: curriedMockRpcCall,
    mockInitialGetBlockByNumber: curriedMockInitialGetBlockByNumber,
    rpcUrl,
    infuraNetwork,
  };

  try {
    return await fn(comms);
  } finally {
    nock.isDone();
    nock.cleanAll();
  }
}

type MockNetworkClient = {
  //blockTracker: any,
  clock: sinon.SinonFakeTimers,
  makeRpcCall: (request: Request) => Promise<any>,
  makeRpcCallsInSeries: (requests: Request[]) => Promise<any[]>
};

/**
 * Builds a provider from the middleware (for the provider type) along with a
 * block tracker, runs the given function with those two things, and then
 * ensures the block tracker is stopped at the end.
 *
 * @param options - An options bag.
 * @returns The return value of the given function.
 */
export async function withNetworkClient(
  {
    providerType,
    infuraNetwork = 'mainnet',
    customRpcUrl = MOCK_RPC_URL,
    customChainId = '0x1',
  }: MockOptions,
  fn: (client: MockNetworkClient) => Promise<void>,
): Promise<any> {
  if (providerType !== 'infura' && providerType !== 'custom') {
    throw new Error(
      `providerType must be either "infura" or "custom", was "${providerType}" instead`,
    );
  }
  const messenger: NetworkControllerMessenger = new ControllerMessenger().getRestricted({
    name: 'NetworkController',
    allowedEvents: ['NetworkController:providerConfigChange'],
    allowedActions: [],
  });
  const controller = new NetworkController({
    messenger,
    infuraProjectId: MOCK_INFURA_PROJECT_ID,
  });

  if (providerType === 'infura') {
    controller.setProviderType(infuraNetwork);
  } else {
    controller.setRpcTarget(customRpcUrl, customChainId);
  }

  const ethQuery = new EthQuery(controller.provider);

  const curriedMakeRpcCall = (request: Request) => makeRpcCall(ethQuery, request);
  const makeRpcCallsInSeries = async (requests: Request[]) => {
    const responses = [];
    for (const request of requests) {
      responses.push(await curriedMakeRpcCall(request));
    }
    return responses;
  };
  // Faking timers ends up doing two things:
  // 1. Halting the block tracker (which depends on `setTimeout` to periodically
  // request the latest block) set up in `eth-json-rpc-middleware`
  // 2. Halting the retry logic in `@metamask/eth-json-rpc-infura` (which also
  // depends on `setTimeout`)
  const clock = sinon.useFakeTimers();
  const client = {
    //blockTracker,
    clock,
    makeRpcCall: curriedMakeRpcCall,
    makeRpcCallsInSeries,
  };

  try {
    return await fn(client);
  } finally {
    //await blockTracker.destroy();

    clock.restore();
  }
}

type BuildMockParamsOptions = {
  // The block parameter value to set.
  blockParam: any,
  // The index of the block parameter.
  blockParamIndex: number
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
 * @returns {any[]} The mock params.
 */
export function buildMockParams({ blockParam, blockParamIndex }: BuildMockParamsOptions) {
  if (blockParamIndex === undefined) {
    throw new Error(`Missing 'blockParamIndex'`);
  }

  const params = new Array(blockParamIndex).fill('some value');
  params[blockParamIndex] = blockParam;

  return params;
}

/**
 * Returns a partial JSON-RPC request object, with the "block" param replaced
 * with the given value.
 *
 * @param request - The request object.
 * @param blockParamIndex - The index within the `params` array of the
 * block param.
 * @param blockParam - The desired block param value.
 * @returns The updated request object.
 */
export function buildRequestWithReplacedBlockParam(
  { method, params = [] }: Request,
  blockParamIndex: number,
  blockParam: any,
): Request {
  const updatedParams = params.slice();
  updatedParams[blockParamIndex] = blockParam;
  return { method, params: updatedParams };
}
