import { BN } from 'ethereumjs-util';
import fetchBusyThreshold from './fetchBusyThreshold';
import calculateBusyThreshold from './calculateBusyThreshold';

type EthQuery = any;

export type NetworkStatusInfo = {
  isNetworkBusy: boolean;
};

/**
 * Collects information about the status of the network. Right now the only piece of information is
 * whether the network is "busy" — i.e., whether the base fee for the latest block exceeds a
 * particular "busy" threshold.
 *
 * @param args - The arguments.
 * @param args.latestBaseFee - The base fee for the latest block in WEI.
 * @param args.url - The URL for the API used to determine a base fee threshold.
 * @param args.ethQuery - An EthQuery instance.
 * @param args.clientId - The ID of the client making this request.
 * @returns The network status info.
 */
export default async function determineNetworkStatusInfo({
  latestBaseFee,
  url,
  ethQuery,
  clientId,
}: {
  latestBaseFee: BN;
  url: string;
  ethQuery: EthQuery;
  clientId: string | undefined;
}): Promise<NetworkStatusInfo> {
  let busyBaseFeeThreshold;
  try {
    busyBaseFeeThreshold = await fetchBusyThreshold(url, clientId);
  } catch (error) {
    console.error(
      `Fetching busy threshold failed due to (${error.message}), trying fallback`,
    );
    busyBaseFeeThreshold = await calculateBusyThreshold(ethQuery);
  }

  const isNetworkBusy = latestBaseFee.gte(busyBaseFeeThreshold);

  return { isNetworkBusy };
}
