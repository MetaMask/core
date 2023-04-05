/* eslint-disable node/no-process-env */
import EthQuery from 'eth-query';
import nock, { Scope as NockScope } from 'nock';
import sinon from 'sinon';
import {
  JSONRPCResponse,
  JSONRPCResponseResult,
} from '@json-rpc-specification/meta-schema';
import { NetworkType } from '@metamask/controller-utils';
import { JsonRpcEngine } from 'json-rpc-engine';
import { providerFromEngine } from '@metamask/eth-json-rpc-provider';
import { EthQuery as TEthQuery } from '../../src/NetworkController';
import { createNetworkClient, InfuraNetworkType, NetworkClientType } from '../../src/create-network-client';
import { Hex } from '@metamask/utils';

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
 * A reference to the original `setTimeout` function so that we can use it even
 * when using fake timers.
 */
const originalSetTimeout = setTimeout;

/**
 * If you're having trouble writing a test and you're wondering why the test
 * keeps failing, you can set `process.env.DEBUG_PROVIDER_TESTS` to `1`. This
 * will turn on some extra logging.
 *
 * @param args - The arguments that `console.log` takes.
 */
function debug(...args: any) {
  if (process.env.DEBUG_PROVIDER_TESTS === '1') {
    if (args[0] instanceof Error) {
      console.error(args[0]);
      return;
    }
    // eslint-disable-next-line
    console.log(...args);
  }
}

/**
 * Builds a Nock scope object for mocking provider requests.
 *
 * @param rpcUrl - The URL of the RPC endpoint.
 * @returns The nock scope.
 */
function buildScopeForMockingRequests(rpcUrl: string) {
  return nock(rpcUrl).filteringRequestBody((body) => {
    debug('Nock Received Request: ', body);
    return body;
  });
}

type Request = { method: string; params?: any[] };
type Response = {
  id?: number | string;
  jsonrpc?: '2.0';
  error?: any;
  result?: any;
  httpStatus?: number;
};
type ResponseBody = { body: JSONRPCResponse };
type BodyOrResponse = ResponseBody | Response;
type CurriedMockRpcCallOptions = {
  request: Request;
  // The response data.
  response?: BodyOrResponse;
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

const mockRpcCall = ({
  nockScope,
  request,
  response,
  error,
  delay,
  times,
}: MockRpcCallOptions): MockRpcCallResult => {
  // eth-query always passes `params`, so even if we don't supply this property,
  // for consistency with makeRpcCall, assume that the `body` contains it
  const { method, params = [], ...rest } = request;
  let httpStatus = 200;
  let completeResponse: JSONRPCResponse = { id: 2, jsonrpc: '2.0' };
  if (response !== undefined) {
    if ('body' in response) {
      completeResponse = response.body;
    } else {
      if (response.error) {
        completeResponse.error = response.error;
      } else {
        completeResponse.result = response.result;
      }
      if (response.httpStatus) {
        httpStatus = response.httpStatus;
      }
    }
  }
  const url = (nockScope as any).basePath.includes('infura.io')
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
  } else if (completeResponse !== undefined) {
    return nockRequest.reply(httpStatus, (_, requestBody: any) => {
      if (response !== undefined && !('body' in response)) {
        if (response.id !== undefined) {
          completeResponse.id = response?.id;
        } else {
          completeResponse.id = requestBody.id;
        }
      }
      debug('Nock returning Response', completeResponse);
      return completeResponse;
    });
  }
  return nockRequest;
};

type MockBlockTrackerRequestOptions = {
  /**
   * A nock scope (a set of mocked requests scoped to a certain base url).
   */
  nockScope: NockScope;
  /**
   * The block number that the block tracker should report, as a 0x-prefixed hex string.
   */
  blockNumber: string;

  block: any;
};

const mockNextBlockTrackerRequest = async ({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: MockBlockTrackerRequestOptions) => {
  mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });
};

const mockAllBlockTrackerRequests = ({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
}: MockBlockTrackerRequestOptions) => {
  (
    mockRpcCall({ // eslint-disable-line
      nockScope,
      request: { method: 'eth_blockNumber', params: [] },
      response: { result: blockNumber },
    }) as NockScope
  ).persist();

  (
    mockRpcCall({ // eslint-disable-line
      nockScope,
      request: { method: 'eth_getBlockByNumber', params: [blockNumber, false] },
      response: {
        result: { number: blockNumber },
      },
    }) as NockScope
  ).persist();
};

const makeRpcCall = (
  ethQuery: TEthQuery,
  request: Request,
): Promise<JSONRPCResponseResult> => {
  return new Promise((resolve, reject) => {
    debug('[makeRpcCall] making ethQuery request', request);
    ethQuery.sendAsync(request, (error: any, result: JSONRPCResponseResult) => {
      debug('[makeRpcCall > ethQuery handler] error', error, 'result', result);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

export type ProviderType = 'infura' | 'custom';

export type MockOptions = {
  infuraNetwork?: InfuraNetworkType;
  providerType: ProviderType;
  customRpcUrl?: string;
  customChainId?: Hex;
};

export type MockCommunications = {
  mockNextBlockTrackerRequest: (options?: any) => void;
  mockAllBlockTrackerRequests: (options?: any) => void;
  mockRpcCall: (arg0: CurriedMockRpcCallOptions) => MockRpcCallResult;
  rpcUrl: string;
  infuraNetwork: InfuraNetworkType;
};

export const withMockedCommunications = async (
  {
    providerType,
    infuraNetwork = 'mainnet',
    customRpcUrl = MOCK_RPC_URL,
  }: MockOptions,
  fn: (comms: MockCommunications) => Promise<void>,
): Promise<any> => {
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
    nock.isDone();
    nock.cleanAll();
  }
};

type MockNetworkClient = {
  blockTracker: any;
  clock: sinon.SinonFakeTimers;
  makeRpcCall: (request: Request) => Promise<any>;
  makeRpcCallsInSeries: (requests: Request[]) => Promise<any[]>;
};

export const waitForNextBlockTracker = (
  blockTracker: any,
  clock: sinon.SinonFakeTimers,
) => {
  const prom = new Promise((resolve) => {
    blockTracker.on('latest', () => {
      resolve(true);
    });
  });
  clock.runAll();
  return prom;
};

export const waitForPromiseToBeFulfilledAfterRunningAllTimers = async (
  promise: any,
  clock: any,
) => {
  let hasPromiseBeenFulfilled = false;
  let numTimesClockHasBeenAdvanced = 0;

  promise
    .catch((e: any) => {
      debug(e);
    })
    .finally(() => {
      hasPromiseBeenFulfilled = true;
    });

  // `isPromiseFulfilled` is modified asynchronously.
  /* eslint-disable-next-line no-unmodified-loop-condition */
  while (!hasPromiseBeenFulfilled && numTimesClockHasBeenAdvanced < 15) {
    clock.runAll();
    await new Promise((resolve) => originalSetTimeout(resolve, 10));
    numTimesClockHasBeenAdvanced += 1;
  }

  return promise;
};

export const withNetworkClient = async (
  {
    providerType,
    infuraNetwork = NetworkType.mainnet,
    customRpcUrl = MOCK_RPC_URL,
    customChainId = '0x1',
  }: MockOptions,
  fn: (client: MockNetworkClient) => Promise<any>,
): Promise<any> => {
  // Faking timers ends up doing two things:
  // 1. Halting the block tracker (which depends on `setTimeout` to periodically
  // request the latest block) set up in `eth-json-rpc-middleware`
  // 2. Halting the retry logic in `@metamask/eth-json-rpc-infura` (which also
  // depends on `setTimeout`)
  const clock = sinon.useFakeTimers();

  // The JSON-RPC client wraps `eth_estimateGas` so that it takes 2 seconds longer
  // than it usually would to complete. Or at least it should — this doesn't
  // appear to be working correctly. Unset `IN_TEST` on `process.env` to prevent
  // this behavior.
  const inTest = process.env.IN_TEST;
  delete process.env.IN_TEST;
  const clientUnderTest =
    providerType === NetworkClientType.Infura
      ? createNetworkClient({
        network: infuraNetwork,
        infuraProjectId: MOCK_INFURA_PROJECT_ID,
        type: NetworkClientType.Infura
      }) : createNetworkClient({
        rpcUrl: customRpcUrl,
        chainId: customChainId,
        type: NetworkClientType.Custom
      });
  process.env.IN_TEST = inTest;

  const { provider, blockTracker } = clientUnderTest;

  const ethQuery = new EthQuery(provider);

  const curriedMakeRpcCall = (request: Request) =>
    makeRpcCall(ethQuery, request);
  const makeRpcCallsInSeries = async (requests: Request[]) => {
    const responses = [];
    for (const request of requests) {
      responses.push(await curriedMakeRpcCall(request));
    }
    return responses;
  };

  const client = {
    blockTracker,
    clock,
    makeRpcCall: curriedMakeRpcCall,
    makeRpcCallsInSeries,
  };

  try {
    return await fn(client);
  } finally {
    await blockTracker.destroy();

    clock.restore();
  }
};

type BuildMockParamsOptions = {
  // The block parameter value to set.
  blockParam: any;
  // The index of the block parameter.
  blockParamIndex: number;
};

export const buildMockParams = ({
  blockParam,
  blockParamIndex,
}: BuildMockParamsOptions) => {
  const params = new Array(blockParamIndex).fill('some value');
  params[blockParamIndex] = blockParam;

  return params;
};

export const buildRequestWithReplacedBlockParam = (
  { method, params = [] }: Request,
  blockParamIndex: number,
  blockParam: any,
): Request => {
  const updatedParams = params.slice();
  updatedParams[blockParamIndex] = blockParam;
  return { method, params: updatedParams };
};
