/* eslint-disable node/no-process-env */
import nock, { Scope as NockScope } from 'nock';
import sinon from 'sinon';
import {
  JSONRPCResponse,
  JSONRPCResponseResult,
} from '@json-rpc-specification/meta-schema';
import { ControllerMessenger } from '@metamask/base-controller';
import { NetworkType } from '@metamask/controller-utils';
import {
  NetworkController,
  EthQuery,
  NetworkControllerMessenger,
} from '../../src/NetworkController';

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

const DEFAULT_BLOCK = {
  baseFeePerGas: '0x7e89323d0',
  hash: '0x4a32aed26c09820a35756b58b4b68f2613c1ee12a8d7ecb63d7313b99811ab07',
  number: DEFAULT_LATEST_BLOCK_NUMBER,
  timestamp: '0x63c84fb3',
};

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

const mockNextBlockTrackerRequest = ({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
  block = DEFAULT_BLOCK,
}: MockBlockTrackerRequestOptions) => {
  // eslint-disable-next-line
  mockRpcCall({
    nockScope,
    request: { method: 'eth_blockNumber', params: [] },
    response: { result: blockNumber },
  });

  // eslint-disable-next-line
  mockRpcCall({
    nockScope,
    request: { method: 'eth_getBlockByNumber', params: [blockNumber, false] },
    response: {
      result: { ...block, number: blockNumber, hash: `0x${Math.random()}` },
    },
  });
};

const mockAllBlockTrackerRequests = ({
  nockScope,
  blockNumber = DEFAULT_LATEST_BLOCK_NUMBER,
  block = DEFAULT_BLOCK,
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
        result: { ...block, number: blockNumber, hash: `0x${Math.random()}` },
      },
    }) as NockScope
  ).persist();
};

type Request = { method: string; params?: any[] };
type Response = {
  id?: number | string;
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

const makeRpcCall = (
  ethQuery: EthQuery,
  request: Request,
  clock: any,
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
    clock.next(); // causes stoplight to 'complete' the await
    const numTimers = clock.countTimers();
    if (numTimers > 1) {
      clock.next(); // causes stoplight to 'complete' the await
    }
  });
};

export type ProviderType = 'infura' | 'custom';

export type MockOptions = {
  providerType: ProviderType;
  infuraNetwork?: NetworkType;
  customRpcUrl?: string;
};

export type MockCommunications = {
  mockNextBlockTrackerRequest: (options?: any) => void;
  mockAllBlockTrackerRequests: (options?: any) => void;
  mockRpcCall: (arg0: CurriedMockRpcCallOptions) => MockRpcCallResult;
  rpcUrl: string;
  infuraNetwork: NetworkType;
};

export const withMockedCommunications = async (
  {
    providerType,
    infuraNetwork = NetworkType.mainnet,
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

const originalSetTimeout = setTimeout;
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
  }: MockOptions,
  fn: (client: MockNetworkClient) => Promise<any>,
): Promise<any> => {
  const messenger: NetworkControllerMessenger =
    new ControllerMessenger().getRestricted({
      name: 'NetworkController',
      allowedEvents: ['NetworkController:providerConfigChange'],
      allowedActions: ['NetworkController:getEthQuery'],
    });

  const clock = sinon.useFakeTimers();

  const controller = new NetworkController({
    messenger,
    infuraProjectId: MOCK_INFURA_PROJECT_ID,
    trackMetaMetricsEvent: jest.fn(),
  });

  const getEIP1559CompatibilityMock = jest
    .spyOn(controller, 'getEIP1559Compatibility')
    .mockImplementation(async () => {
      return true;
    });

  const lookupNetworkMock = jest
    .spyOn(controller, 'lookupNetwork')
    .mockImplementation(() => {
      return Promise.resolve();
    });

  if (providerType === 'infura') {
    controller.setProviderType(infuraNetwork);
  } else {
    controller.upsertNetworkConfiguration(
      {
        rpcUrl: customRpcUrl,
        chainId: '0x9999',
        ticker: 'TEST',
      },
      { referrer: 'https://test-dapp.com', source: 'dapp', setActive: true },
    );
  }
  const ethQuery = messenger.call('NetworkController:getEthQuery');
  const { provider, blockTracker } = controller.getProviderAndBlockTracker();

  const curriedMakeRpcCall = (request: Request) =>
    makeRpcCall(ethQuery, request, clock);
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
    getEIP1559CompatibilityMock.mockRestore();
    lookupNetworkMock.mockRestore();
    blockTracker.removeAllListeners();
    provider.stop();
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
