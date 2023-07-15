import { NetworkType } from '@metamask/controller-utils';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import nock from 'nock';
import { promisify } from 'util';

import { createAutoManagedNetworkClient } from './create-auto-managed-network-client';
import * as createNetworkClientModule from './create-network-client';
import type {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
  NetworkClientConfiguration,
} from './types';
import { NetworkClientType } from './types';
import type {
  FakeProviderStub,
  FakeProviderResponse,
} from '../tests/fake-provider';

/**
 * An object which instructs the NetworkMock class which JSON-RPC request should
 * be mocked and how that request should respond.
 *
 * @property request - The JSON-RPC request that should be mocked.
 * @property request.method - The JSON-RPC method.
 * @property request.params - The JSON-RPC params (optional).
 * @property response - The JSON-RPC response that the request should return.
 * @property response.result - Specifies the `result` field of the JSON-RPC
 * response.
 * @property response.error - Specifies the `error` field of the JSON-RPC
 * response.
 * @property error - The error that should be raised upon making the request.
 * @property implementation - A function that is called to generate the
 * response. Should return the same interface as the `response` property above.
 * @property delay - The amount of time that should pass before the response
 * returns.
 * @property httpStatus - The HTTP status that the response should have.
 * @property discardAfterMatching - Usually a mock specification represents one
 * invocation of a request; if another request matching the same specification
 * occurs, then an error will be thrown. If you expect this request to occur an
 * indeterminate amount of times, you can set this to true and an error will no
 * longer be thrown.
 * @property beforeCompleting - Sometimes it is useful to do something after the
 * request is kicked off but before it ends (or, in terms of a `fetch` promise,
 * when the promise is initiated but before it is resolved). You can pass an
 * (async) function for this option to do this.
 */
type NetworkMockSpecification = FakeProviderStub & {
  response: FakeProviderResponse & { httpStatus?: number };
};

/**
 * Type guard for determining whether the given value is an error object with a
 * `message` property, such as an instance of Error.
 *
 * Copied from @metamask/utils.
 *
 * @param error - The object to check.
 * @returns True or false, depending on the result.
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}
/**
 * Get the error message from an unknown error object. If the error object has
 * a `message` property, that property is returned. Otherwise, the stringified
 * error object is returned.
 *
 * Copied from @metamask/utils.
 *
 * @param error - The error object to get the message from.
 * @returns The error message.
 */
function getErrorMessage(error: unknown): string {
  return isErrorWithMessage(error) ? error.message : String(error);
}

/**
 * Handles mocking JSON-requests sent to the network.
 */
class MockedNetwork {
  #networkClientConfiguration: NetworkClientConfiguration;

  #specifications: NetworkMockSpecification[];

  #nockScope: nock.Scope;

  /**
   * Makes a new MockedNetwork.
   *
   * @param args - The arguments.
   * @param args.networkClientConfiguration - Details about the network which
   * tell this class which URL to mock.
   * @param args.specs - Objects which specify the requests to mock and the
   * responses to use for those requests.
   */
  constructor({
    networkClientConfiguration,
    specs = [],
  }: {
    networkClientConfiguration: NetworkClientConfiguration;
    specs: NetworkMockSpecification[];
  }) {
    this.#networkClientConfiguration = networkClientConfiguration;
    this.#specifications = specs;
    const rpcUrl =
      networkClientConfiguration.type === 'infura'
        ? `https://${networkClientConfiguration.network}.infura.io`
        : networkClientConfiguration.rpcUrl;
    this.#nockScope = nock(rpcUrl);
  }

  /**
   * Mocks all of the requests specified via the constructor.
   */
  enable() {
    for (const spec of this.#specifications) {
      this.#mockRpcCall(spec);
    }
  }

  /**
   * Mocks a JSON-RPC request sent to the network with the given response.
   *
   * @param spec - Details for how to mock the request and which response to
   * use.
   * @returns The resulting Nock scope.
   */
  #mockRpcCall(spec: NetworkMockSpecification): nock.Scope {
    // eth-query always passes `params`, so even if we don't supply this
    // property, for consistency with makeRpcCall, assume that the `body`
    // contains it
    const { method, params = [], ...rest } = spec.request;
    const httpStatus =
      'httpStatus' in spec.response ? spec.response.httpStatus : 200;

    const url =
      this.#networkClientConfiguration.type === NetworkClientType.Infura
        ? `/v3/${this.#networkClientConfiguration.infuraProjectId}`
        : '/';

    let nockInterceptor = this.#nockScope.post(url, {
      id: /\d*/u,
      jsonrpc: '2.0',
      method,
      params,
      ...rest,
    });

    if (spec.delay !== undefined) {
      nockInterceptor = nockInterceptor.delay(spec.delay);
    }

    let newNockScope: nock.Scope;

    if ('error' in spec && spec.error !== undefined) {
      newNockScope = nockInterceptor.replyWithError(
        getErrorMessage(spec.error),
      );
    } else {
      newNockScope = nockInterceptor.reply(
        httpStatus,
        (_uri: any, requestBody: JsonRpcRequest<any>) => {
          const baseResponse = { id: requestBody.id, jsonrpc: '2.0' as const };
          let completeResponse: JsonRpcResponse<any> | undefined;

          if (spec.response !== undefined) {
            if (
              'result' in spec.response &&
              spec.response.result !== undefined
            ) {
              completeResponse = {
                ...baseResponse,
                result: spec.response.result,
              };
            } else if (
              'error' in spec.response &&
              spec.response.error !== undefined
            ) {
              completeResponse = {
                ...baseResponse,
                error: {
                  code: -999,
                  message: spec.response.error,
                },
              };
            }
          }

          return completeResponse;
        },
      );
    }

    if (spec.discardAfterMatching === false) {
      newNockScope = newNockScope.persist();
    }

    return newNockScope;
  }
}

describe('createAutoManagedNetworkClient', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.enableNetConnect();
    nock.cleanAll();
  });

  const networkClientConfigurations: [
    CustomNetworkClientConfiguration,
    InfuraNetworkClientConfiguration,
  ] = [
    {
      type: NetworkClientType.Custom,
      rpcUrl: 'https://test.chain',
      chainId: '0x1337',
    } as const,
    {
      type: NetworkClientType.Infura,
      network: NetworkType.mainnet,
      infuraProjectId: 'some-infura-project-id',
    } as const,
  ];
  for (const networkClientConfiguration of networkClientConfigurations) {
    describe(`given configuration for a ${networkClientConfiguration.type} network client`, () => {
      it('allows the network client configuration to be accessed', () => {
        const { configuration } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        expect(configuration).toStrictEqual(networkClientConfiguration);
      });

      it('does not make any network requests initially', () => {
        // If unexpected requests occurred, then Nock would throw
        expect(() => {
          createAutoManagedNetworkClient(networkClientConfiguration);
        }).not.toThrow();
      });

      it('returns a provider proxy that has the same interface as a provider', () => {
        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        // This also tests the `has` trap in the proxy
        expect('addListener' in provider).toBe(true);
        expect('on' in provider).toBe(true);
        expect('once' in provider).toBe(true);
        expect('removeListener' in provider).toBe(true);
        expect('off' in provider).toBe(true);
        expect('removeAllListeners' in provider).toBe(true);
        expect('setMaxListeners' in provider).toBe(true);
        expect('getMaxListeners' in provider).toBe(true);
        expect('listeners' in provider).toBe(true);
        expect('rawListeners' in provider).toBe(true);
        expect('emit' in provider).toBe(true);
        expect('listenerCount' in provider).toBe(true);
        expect('prependListener' in provider).toBe(true);
        expect('prependOnceListener' in provider).toBe(true);
        expect('eventNames' in provider).toBe(true);
        expect('send' in provider).toBe(true);
        expect('sendAsync' in provider).toBe(true);
      });

      it('returns a provider proxy that acts like a provider, forwarding requests to the network', async () => {
        const mockedNetwork = new MockedNetwork({
          networkClientConfiguration,
          specs: [
            {
              request: {
                method: 'test_method',
                params: [],
              },
              response: {
                result: 'test response',
              },
            },
          ],
        });
        mockedNetwork.enable();

        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        const { result } = await promisify(provider.sendAsync).call(provider, {
          id: 1,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        expect(result).toBe('test response');
      });

      it('creates the network client only once, even when the provider proxy is used to make requests multiple times', async () => {
        const mockedNetwork = new MockedNetwork({
          networkClientConfiguration,
          specs: [
            {
              request: {
                method: 'test_method',
                params: [],
              },
              response: {
                result: 'test response',
              },
              discardAfterMatching: false,
            },
          ],
        });
        mockedNetwork.enable();
        const createNetworkClientMock = jest.spyOn(
          createNetworkClientModule,
          'createNetworkClient',
        );

        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        await promisify(provider.sendAsync).call(provider, {
          id: 1,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        await promisify(provider.sendAsync).call(provider, {
          id: 2,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
        expect(createNetworkClientMock).toHaveBeenCalledWith(
          networkClientConfiguration,
        );
      });

      it('returns a block tracker proxy that has the same interface as a block tracker', () => {
        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        // This also tests the `has` trap in the proxy
        expect('addListener' in blockTracker).toBe(true);
        expect('on' in blockTracker).toBe(true);
        expect('once' in blockTracker).toBe(true);
        expect('removeListener' in blockTracker).toBe(true);
        expect('off' in blockTracker).toBe(true);
        expect('removeAllListeners' in blockTracker).toBe(true);
        expect('setMaxListeners' in blockTracker).toBe(true);
        expect('getMaxListeners' in blockTracker).toBe(true);
        expect('listeners' in blockTracker).toBe(true);
        expect('rawListeners' in blockTracker).toBe(true);
        expect('emit' in blockTracker).toBe(true);
        expect('listenerCount' in blockTracker).toBe(true);
        expect('prependListener' in blockTracker).toBe(true);
        expect('prependOnceListener' in blockTracker).toBe(true);
        expect('eventNames' in blockTracker).toBe(true);
        expect('destroy' in blockTracker).toBe(true);
        expect('isRunning' in blockTracker).toBe(true);
        expect('getCurrentBlock' in blockTracker).toBe(true);
        expect('getLatestBlock' in blockTracker).toBe(true);
        expect('checkForLatestBlock' in blockTracker).toBe(true);
      });

      it('returns a block tracker proxy that acts like a block tracker, exposing events to be listened to', async () => {
        const mockedNetwork = new MockedNetwork({
          networkClientConfiguration,
          specs: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
          ],
        });
        mockedNetwork.enable();

        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        const blockNumberViaLatest = await new Promise((resolve) => {
          blockTracker.once('latest', resolve);
        });
        expect(blockNumberViaLatest).toBe('0x1');
        const blockNumberViaSync = await new Promise((resolve) => {
          blockTracker.once('sync', resolve);
        });
        expect(blockNumberViaSync).toStrictEqual({
          oldBlock: '0x1',
          newBlock: '0x2',
        });
      });

      it('creates the network client only once, even when the block tracker proxy is used multiple times', async () => {
        const mockedNetwork = new MockedNetwork({
          networkClientConfiguration,
          specs: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3',
              },
            },
          ],
        });
        mockedNetwork.enable();
        const createNetworkClientMock = jest.spyOn(
          createNetworkClientModule,
          'createNetworkClient',
        );

        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        await new Promise((resolve) => {
          blockTracker.once('latest', resolve);
        });
        await new Promise((resolve) => {
          blockTracker.once('sync', resolve);
        });
        await blockTracker.getLatestBlock();
        await blockTracker.checkForLatestBlock();
        expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
        expect(createNetworkClientMock).toHaveBeenCalledWith(
          networkClientConfiguration,
        );
      });

      it('allows the block tracker to be destroyed', () => {
        const mockedNetwork = new MockedNetwork({
          networkClientConfiguration,
          specs: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
        mockedNetwork.enable();
        const { blockTracker, destroy } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );
        // Start the block tracker
        blockTracker.on('latest', () => {
          // do nothing
        });

        destroy();

        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  }
});
