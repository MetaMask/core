import type { ExternalProvider } from '@ethersproject/providers';
import { Web3Provider } from '@ethersproject/providers';

export { ExternalProvider };

/**
 * The response after making a network request for `net_version`.
 *
 * @property result - The value returned by the request assuming it was
 * successful.
 * @property error - The error message returned by the request assuming it was
 * not successful.
 */
export type NetworkResponse = { result: string } | { error: unknown };

/**
 * Asks the currently connected network for its network id.
 *
 * @param getProvider - A function that returns either a legacy web3 provider
 * object or an EIP-1159-compatible object.
 * @returns A response object that contains either the network id (as a decimal
 * number encoded as a string) if the request was successful or an error message
 * if it was not.
 */
export async function getCurrentNetworkId(
  getProvider: () => ExternalProvider,
): Promise<NetworkResponse> {
  const provider = getProvider();
  const ethersProvider = new Web3Provider(provider);

  try {
    const result = await ethersProvider.send('net_version', []);
    return { result };
  } catch (error) {
    return { error };
  }
}
