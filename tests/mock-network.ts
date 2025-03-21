import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import nock from 'nock';

import type { NetworkClientConfiguration } from '../packages/network-controller/src/types';
import { NetworkClientType } from '../packages/network-controller/src/types';

/**
 * An object which instructs the MockedNetwork class which JSON-RPC request
 * should be mocked and how that request should respond.
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
 * @property httpStatus - The HTTP status that the response should have.
 * @property discardAfterMatching - Usually a request mock represents a single
 * request for a JSON-RPC method and is discarded when that request occurs. This
 * means that if another request for the same method occurs later, an error will
 * be thrown because a request mock no longer exists. If you expect this request
 * to occur an indeterminate amount of times, however, you can set this to
 * `false` and an error will no longer be thrown.
 * @property beforeCompleting - Sometimes it is useful to do something after the
 * request is kicked off but before it ends (or, in terms of a `fetch` promise,
 * when the promise is initiated but before it is resolved). You can pass an
 * function (optionally async) to do this.
 */
export type JsonRpcRequestMock = {
  request: {
    method: string;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[];
  };
  delay?: number;
  discardAfterMatching?: boolean;
  beforeCompleting?: () => void | Promise<void>;
} & (
  | {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: ({ result: any } | { error: string }) & { httpStatus?: number };
    }
  | {
      error: unknown;
    }
);

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
 * MockedNetwork provides a more streamlined interface around `nock` to mock
 * JSON-RPC requests that are sent to a network.
 */
class MockedNetwork {
  #networkClientConfiguration: NetworkClientConfiguration;

  #requestMocks: JsonRpcRequestMock[];

  #nockScope: nock.Scope;

  /**
   * Makes a new MockedNetwork.
   *
   * @param args - The arguments.
   * @param args.networkClientConfiguration - Details about the network which
   * tell this class which URL to mock.
   * @param args.mocks - Objects which specify the requests to mock and the
   * responses to use for those requests.
   */
  constructor({
    networkClientConfiguration,
    mocks = [],
  }: {
    networkClientConfiguration: NetworkClientConfiguration;
    mocks: JsonRpcRequestMock[];
  }) {
    this.#networkClientConfiguration = networkClientConfiguration;
    this.#requestMocks = mocks;
    const rpcUrl =
      networkClientConfiguration.type === 'infura'
        ? // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `https://${networkClientConfiguration.network}.infura.io`
        : networkClientConfiguration.rpcUrl;
    this.#nockScope = nock(rpcUrl);
  }

  /**
   * Mocks all of the requests that have been specified via the constructor.
   */
  enable() {
    for (const requestMock of this.#requestMocks) {
      this.#mockRpcCall(requestMock);
    }
  }

  /**
   * Mocks a JSON-RPC request sent to the network.
   *
   * @param requestMock - Specifies the request to mock and how that request
   * should respond.
   * @returns The resulting Nock scope.
   */
  #mockRpcCall(requestMock: JsonRpcRequestMock): nock.Scope {
    // eth-query always passes `params`, so even if we don't supply this
    // property, assume that the `body` contains it
    const { method, params = [], ...rest } = requestMock.request;

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

    if (requestMock.delay !== undefined) {
      nockInterceptor = nockInterceptor.delay(requestMock.delay);
    }

    let newNockScope: nock.Scope;

    if ('error' in requestMock && requestMock.error !== undefined) {
      newNockScope = nockInterceptor.replyWithError(
        getErrorMessage(requestMock.error),
      );
    } else {
      const httpStatus =
        'response' in requestMock && 'httpStatus' in requestMock.response
          ? requestMock.response.httpStatus
          : 200;
      newNockScope = nockInterceptor.reply(
        httpStatus,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_uri: any, requestBody: JsonRpcRequest<any>) => {
          const baseResponse = { id: requestBody.id, jsonrpc: '2.0' as const };
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let completeResponse: JsonRpcResponse<any> | undefined;

          if ('response' in requestMock) {
            if ('result' in requestMock.response) {
              completeResponse = {
                ...baseResponse,
                result: requestMock.response.result,
              };
            } else if (
              'error' in requestMock.response &&
              requestMock.response.error !== undefined
            ) {
              completeResponse = {
                ...baseResponse,
                error: {
                  code: -999,
                  message: requestMock.response.error,
                },
              };
            }
          }

          return completeResponse;
        },
      );
    }

    if (requestMock.discardAfterMatching === false) {
      newNockScope = newNockScope.persist();
    }

    return newNockScope;
  }
}

/**
 * Uses `nock` to mock the given JSON-RPC requests for the given network.
 *
 * @param args - The arguments.
 * @param args.networkClientConfiguration - Specifies the network to mock
 * (either an Infura network or a custom network).
 * @param args.mocks - Objects which specify the requests to mock and the
 * responses to use for those requests. (See {@link JsonRpcRequestMock}.)
 * @returns The mocked network.
 */
export function mockNetwork({
  networkClientConfiguration,
  mocks = [],
}: {
  networkClientConfiguration: NetworkClientConfiguration;
  mocks: JsonRpcRequestMock[];
}): MockedNetwork {
  const mockedNetwork = new MockedNetwork({
    networkClientConfiguration,
    mocks,
  });
  mockedNetwork.enable();
  return mockedNetwork;
}
