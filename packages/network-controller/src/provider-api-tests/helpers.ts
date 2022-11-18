import nock from 'nock';
import sinon from 'sinon';
import { JsonRpcEngine } from 'json-rpc-engine';
import { providerFromEngine } from 'eth-json-rpc-middleware';
import createJsonRpcClient from '../createJsonRpcClient';
import { JSONRPCParamsByPosition, JSONRPCRequest, JSONRPCResponse, JSONRPCResponseResult } from '@json-rpc-specification/meta-schema';
import EthQuery from 'eth-query';
import { EthQuery as TEthQuery } from '../NetworkController';

/**
 * @typedef {import('nock').Scope} NockScope
 *
 * A object returned by `nock(...)` for mocking requests to a particular base
 * URL.
 */

/**
 * @typedef {{makeRpcCall: (request: Partial<JsonRpcRequest>) => Promise<any>, makeRpcCallsInSeries: (requests: Partial<JsonRpcRequest>[]) => Promise<any>}} Client
 *
 * Provides methods to interact with the suite of middleware that
 * `createInfuraClient` or `createJsonRpcClient` exposes.
 */

/**
 * @typedef {{network: string, providerType: string}} WithClientOptions
 *
 * The options bag that `withClient` takes.
 */

/**
 * @typedef {(client: Client) => Promise<any>} WithClientCallback
 *
 * The callback that `withClient` takes.
 */

/**
 * @typedef {[WithClientOptions, WithClientCallback] | [WithClientCallback]} WithClientArgs
 *
 * The arguments to `withClient`.
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
 * @typedef {{mockNextBlockTrackerRequest: (options: Omit<MockBlockTrackerRequestOptions, 'nockScope'>) => void, mockAllBlockTrackerRequests: (options: Omit<MockBlockTrackerRequestOptions, 'nockScope'>) => void, mockRpcCall: (options: Omit<MockRpcCallOptions, 'nockScope'>) => NockScope}} Communications
 *
 * Provides methods to mock different kinds of requests to the provider.
 */

/**
 * @typedef {{network: string, providerType: 'infura' | 'custom'}} WithMockedCommunicationsOptions
 *
 * The options bag that `Communications` takes.
 */

/**
 * @typedef {(comms: Communications) => Promise<any>} WithMockedCommunicationsCallback
 *
 * The callback that `mockingCommunications` takes.
 */

/**
 * @typedef {[WithMockedCommunicationsOptions, WithMockedCommunicationsCallback] | [WithMockedCommunicationsCallback]} WithMockedCommunicationsArgs
 *
 * The arguments to `mockingCommunications`.
 */

const INFURA_PROJECT_ID = 'abc123';
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
 * Builds a Nock scope object for mocking requests to a particular network that
 * the provider supports.
 *
 * @param {object} options - The options.
 * @param {string} options.network - The network you're testing with
 * (default: "mainnet").
 * @param {string} options.type - if defined, must be either `infura` or `custom`
 * (default: "infura").
 * @returns {NockScope} The nock scope.
 */
function buildScopeForMockingRequests({
  network = 'mainnet',
  type = 'infura',
}: MockOptions): nock.Scope {
  let rpcUrl;
  if (type === 'infura') {
    rpcUrl = `https://${network}.infura.io`;
  } else {
    rpcUrl = `http://localhost:8545/`;
  }

  return nock(rpcUrl).filteringRequestBody((body) => {
    const copyOfBody = JSON.parse(body);
    // some ids are random, so remove them entirely from the request to
    // make it possible to mock these requests
    delete copyOfBody.id;
    return JSON.stringify(copyOfBody);
  });
}

type mockRequestOptions = {
  nockScope: nock.Scope,
  blockNumber: string,
};

/**
 * Mocks the next request for the latest block that the block tracker will make.
 *
 * @param {MockBlockTrackerRequestOptions} args - The arguments.
 * @param {NockScope} args.nockScope - A nock scope (a set of mocked requests
 * scoped to a certain base URL).
 * @param {string} args.blockNumber - The block number that the block tracker
 * should report, as a 0x-prefixed hex string.
 */
function mockNextBlockTrackerRequest({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: mockRequestOptions) {
  mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });
}

/**
 * Mocks all requests for the latest block that the block tracker will make.
 *
 * @param {MockBlockTrackerRequestOptions} args - The arguments.
 * @param {NockScope} args.nockScope - A nock scope (a set of mocked requests
 * scoped to a certain base URL).
 * @param {string} args.blockNumber - The block number that the block tracker
 * should report, as a 0x-prefixed hex string.
 */
function mockAllBlockTrackerRequests({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: mockRequestOptions) {
  (mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  }) as nock.Scope).persist();
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
 * @param {NockScope} args.nockScope - A nock scope (a set of mocked requests
 * scoped to a certain base URL).
 * @param opts - The request data.
 * @returns The nock scope.
 */
function mockRpcCall(opts: MockRpcCallOptions): MockRpcCallResult {
  const {
    nockScope,
    request,
    response,
    error,
    delay,
    times
  } = opts;
  // eth-query always passes `params`, so even if we don't supply this property,
  // for consistency with makeRpcCall, assume that the `body` contains it
  const { method, params = [], ...rest } = request;
  let httpStatus = 200;
  let completeResponse: JSONRPCResponse | undefined;
  if (response !== undefined) {
    if ((response as ResponseBody).body === undefined) {
      const r = response as Response;
      if (r.httpStatus) {
        httpStatus = r.httpStatus;
      }
      completeResponse = { id: 1, jsonrpc: '2.0' };
      ['id', 'jsonrpc', 'result', 'error'].forEach((prop) => {
        if (r[prop] !== undefined) {
          (completeResponse as JSONRPCResponse)[prop] = r[prop];
        }
      });
    } else {
      completeResponse = (response as ResponseBody).body;
    }
  }
  const url = (nockScope as any).basePath.includes('infura.io')
    ? `/v3/${INFURA_PROJECT_ID}`
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
  network?: string,
  type?: string,
};
type MockCommunications = {
  mockNextBlockTrackerRequest: (options?: any) => void,
  mockAllBlockTrackerRequests: (options?: any) => void,
  mockRpcCall: (arg0: CurriedMockRpcCallOptions) => MockRpcCallResult,
};
/**
 * Sets up request mocks for requests to the provider.
 *
 * @param {WithMockedCommunicationsArgs} args - Either an options bag + a
 * function, or just a function. The options bag, at the moment, may contain
 * `network` (that is, the Infura network; defaults to "mainnet"). The function
 * is called with an object that allows you to mock different kinds of requests.
 * @returns {Promise<any>} The return value of the given function.
 */
export async function withMockedCommunications(
  {
    network = 'mainnet',
    type = 'infura',
  }: MockOptions,
  fn: (comms: MockCommunications) => Promise<void>,
) {
  const nockScope = buildScopeForMockingRequests({ network, type });
  const curriedMockNextBlockTrackerRequest = (localOptions: any) =>
    mockNextBlockTrackerRequest({ nockScope, ...localOptions });
  const curriedMockAllBlockTrackerRequests = (localOptions: any) =>
    mockAllBlockTrackerRequests({ nockScope, ...localOptions });
  const curriedMockRpcCall = (localOptions: any) =>
    mockRpcCall({ nockScope, ...localOptions });
  const comms = {
    mockNextBlockTrackerRequest: curriedMockNextBlockTrackerRequest,
    mockAllBlockTrackerRequests: curriedMockAllBlockTrackerRequests,
    mockRpcCall: curriedMockRpcCall,
  };

  try {
    return await fn(comms);
  } finally {
    nock.isDone();
    nock.cleanAll();
  }
}

type MockClient = {
  blockTracker: any,
  clock: sinon.SinonFakeTimers,
  makeRpcCall: (request: Request) => Promise<any>,
  makeRpcCallsInSeries: (requests: Request[]) => Promise<any[]>
};

const makeInfuraRpcUrl = (network: string, projectId: string) => {
  const pid = projectId;
  return `https://${network}.infura.io/v3/${pid}`;
}

/**
 * Builds a provider from the middleware (for the provider type) along with a
 * block tracker, runs the given function with those two things, and then
 * ensures the block tracker is stopped at the end.
 *
 * @param {WithClientArgs} args - Either an options bag + a function, or
 * just a function. The options bag, at the moment, may contain `network`
 * (defaults to "mainnet"). The options bag may also include providerType
 * (defaults to 'infura'). The function is called with an object that allows
 * you to interact with the client via a couple of methods on that object.
 * @returns {Promise<any>} The return value of the given function.
 */
export async function withClient(
  {
    network = 'mainnet',
    type = 'infura',
  }: MockOptions,
  fn: (client: MockClient) => Promise<void>,
) {
  let rpcUrl = type === 'infura' ? makeInfuraRpcUrl(network, INFURA_PROJECT_ID) : 'http://localhost:8545';
  const clientUnderTest = createJsonRpcClient({
    rpcUrl,
    chainId: '0x1',
  });
  const { networkMiddleware, blockTracker } = clientUnderTest;

  const engine = new JsonRpcEngine();
  engine.push(networkMiddleware);
  const provider = providerFromEngine(engine);
  const ethQuery = new EthQuery(provider);

  const curriedMakeRpcCall = (request: Request) => makeRpcCall(ethQuery, request);
  const makeRpcCallsInSeries = async (requests: Request[]): Promise<any[]> => {
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
    blockTracker,
    clock,
    makeRpcCall: curriedMakeRpcCall,
    makeRpcCallsInSeries,
  };

  try {
    return await fn(client);
  } finally {
    if ((blockTracker as any).destroy !== undefined) {
      await (blockTracker as any).destroy();
    }

    clock.restore();
  }
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function builds a mock `params` array for
 * such an endpoint, filling it with arbitrary values, but with the "block"
 * param missing.
 *
 * @param index - The index within the `params` array where the "block"
 * param *would* appear.
 * @returns The mock params.
 */
export function buildMockParamsWithoutBlockParamAt(index: number): string[] {
  const params = [];
  for (let i = 0; i < index; i++) {
    params.push('some value');
  }
  return params;
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function builds a `params` array for such an
 * endpoint with the given "block" param added at the end.
 *
 * @param index - The index within the `params` array to add the
 * "block" param.
 * @param blockParam - The desired "block" param to add.
 * @returns The mock params.
 */
export function buildMockParamsWithBlockParamAt(index: number, blockParam: any): JSONRPCParamsByPosition {
  const params = buildMockParamsWithoutBlockParamAt(index);
  params.push(blockParam);
  return params;
}

/**
 * Returns a partial JSON-RPC request object, with the "block" param replaced
 * with the given value.
 *
 * @param arg0 - The request object.
 * @param request.method - The request method.
 * @param [request.params] - The request params.
 * @param blockParamIndex - The index within the `params` array of the
 * block param.
 * @param  blockParam - The desired block param value.
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
