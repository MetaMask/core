import { isDeepStrictEqual } from 'util';

/**
 * A request object that `request` takes. Should be compatible with
 * ExternalProvider from ethers' Web3Provider module.
 */
type Request = { method: string; params?: any[] };

/**
 * An object that allows specifying the behavior of a specific invocation of
 * `request` on the fake provider object. The `methodName` always identifies the
 * stub, but the behavior may be specified multiple ways: `request` can either
 * return a promise or throw an error, and if it returns a promise, that promise
 * can either be resolved with a response object or reject with an error.
 *
 * @property methodName - The RPC method to which this stub will be matched.
 * @property response - Instructs `sendAsync` to return a promise that resolves
 * with a response object.
 * @property response.result - Specifies a successful response, with this as the
 * `result`.
 * @property response.error - Specifies an error response, with this as the
 * `error`.
 */
type FakeProviderStub = {
  request: { method: string; params?: any };
  response: { result: any } | { error: string };
};

/**
 * Constructs a provider object that can be passed to ethers' Web3Provider
 * constructor.
 *
 * @param stubs - The set of RPC methods for which you want to provide canned
 * responses.
 * @returns The fake provider.
 */
export function buildFakeProvider(stubs: FakeProviderStub[] = []) {
  return {
    async request(request: Request) {
      const matchingStub = stubs.find(
        (stub) =>
          stub.request.method === request.method &&
          isDeepStrictEqual(stub.request.params, request.params),
      );

      if (matchingStub) {
        if ('result' in matchingStub.response) {
          return matchingStub.response.result;
        }

        if ('error' in matchingStub.response) {
          throw matchingStub.response.error;
        }
      }

      throw new Error(
        `No matching stub for request ${JSON.stringify(request)}`,
      );
    },
  };
}
