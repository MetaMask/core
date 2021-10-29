import { BN } from 'ethereumjs-util';
import { handleFetch, gweiDecToWEIBN } from '../util';
import { makeClientIdHeader } from './gas-util';

/**
 * Hits a URL that returns a base fee which represents a threshold we can use to determine whether
 * the network is busy.
 *
 * @param url - A URL.
 * @param clientId - The ID of the client making this request.
 * @returns A promise for a base fee in WEI, as a BN.
 */
export default async function fetchBusyThreshold(
  url: string,
  clientId: string | undefined,
): Promise<BN> {
  const options =
    clientId !== undefined ? { headers: makeClientIdHeader(clientId) } : {};
  const { busyThreshold: busyBaseFeePerGasThresholdInGwei } = await handleFetch(
    url,
    options,
  );
  return gweiDecToWEIBN(busyBaseFeePerGasThresholdInGwei);
}
