import type { NetworkControllerOptions } from '@metamask/network-controller';

/**
 * The hostname suffix that identifies an Infura RPC endpoint.
 *
 * The endpoint URL is matched rather than the network client type because a
 * network client configured as Infura can still direct traffic elsewhere: when
 * failover URLs are in play, each endpoint in the chain gets its own RPC
 * service, and only the ones served by Infura should carry the token.
 */
const INFURA_HOSTNAME_SUFFIX = '.infura.io';

/**
 * Builds a `getRpcServiceOptions` function that presents an authentication
 * token as a bearer credential on requests to Infura endpoints.
 *
 * Requests to any other endpoint are left untouched, as is any request that
 * already carries an `Authorization` header (the RPC service sets one itself
 * for endpoints whose URL embeds credentials).
 *
 * The token is retrieved per request rather than once per endpoint, so a token
 * that is refreshed during the lifetime of a network client is picked up on the
 * next request. If it cannot be retrieved, the request is still made, without
 * the credential.
 *
 * @param getInfuraAuthToken - Returns the token to present, or undefined if
 * none is available. Omit it to leave every request untouched.
 * @param fetchImplementation - The function used to make the request. Defaults
 * to the global `fetch`.
 * @returns A function for the `getRpcServiceOptions` option of
 * `NetworkController`.
 */
export function createInfuraAuthRpcServiceOptions(
  getInfuraAuthToken?: () => Promise<string | undefined>,
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): NonNullable<NetworkControllerOptions['getRpcServiceOptions']> {
  return (rpcEndpointUrl: string) => {
    if (
      getInfuraAuthToken === undefined ||
      !new URL(rpcEndpointUrl).hostname.endsWith(INFURA_HOSTNAME_SUFFIX)
    ) {
      return {};
    }

    return {
      fetch: async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): ReturnType<typeof fetch> => {
        // The RPC service is the only caller, and it assembles these headers by
        // deep-merging plain objects, so they never arrive as a `Headers`
        // instance or as a list of pairs.
        const headers = init?.headers as Record<string, string> | undefined;

        if (headers?.Authorization !== undefined) {
          return await fetchImplementation(input, init);
        }

        const token = await getInfuraAuthToken().catch(() => undefined);

        if (!token) {
          return await fetchImplementation(input, init);
        }

        return await fetchImplementation(input, {
          ...init,
          headers: { ...headers, Authorization: `Bearer ${token}` },
        });
      },
    };
  };
}
