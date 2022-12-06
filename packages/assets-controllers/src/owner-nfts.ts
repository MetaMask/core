import {
  OPENSEA_API_URL,
  OPENSEA_PROXY_URL,
  fetchWithErrorHandling,
} from '@metamask/controller-utils';
import { ApiNft } from './NftDetectionController';

/**
 * Gets owners NFTs from different API calls.
 *
 * @param options0 - The getOwnerNftApi options.
 * @param options0.address - The address of the owner of the assets.
 * @param options0.offset - Offset.
 * @param options0.useProxy - Boolean value that if it is true to use OpenSea proxy server.
 * @returns String representation of API calls.
 */
function getOwnerNftApi({
  address,
  offset,
  useProxy,
}: {
  address: string;
  offset: number;
  useProxy: boolean;
}) {
  return useProxy
    ? `${OPENSEA_PROXY_URL}/assets?owner=${address}&offset=${offset}&limit=50`
    : `${OPENSEA_API_URL}/assets?owner=${address}&offset=${offset}&limit=50`;
}

/**
 * Gets the NFTs that owner have on his wallet.
 *
 * @param address - The address of the owner of the assets.
 * @param openSeaApiKey - OpenSea API key.
 * @returns Promise resolving array of NFTs objects coming from OpenSea API.
 */
export async function getOwnerNfts(
  address: string,
  openSeaApiKey: string | undefined,
): Promise<ApiNft[]> {
  let nftApiResponse: { assets: ApiNft[] };
  let nfts: ApiNft[] = [];
  let offset = 0;
  let pagingFinish = false;
  /* istanbul ignore if */
  do {
    nftApiResponse = await fetchWithErrorHandling({
      url: getOwnerNftApi({ address, offset, useProxy: true }),
      timeout: 15000,
    });

    if (openSeaApiKey && !nftApiResponse) {
      nftApiResponse = await fetchWithErrorHandling({
        url: getOwnerNftApi({
          address,
          offset,
          useProxy: false,
        }),
        options: { headers: { 'X-API-KEY': openSeaApiKey } },
        timeout: 15000,
        // catch 403 errors (in case API key is down we don't want to blow up)
        errorCodesToCatch: [403],
      });
    }

    if (!nftApiResponse) {
      return nfts;
    }

    nftApiResponse?.assets?.length !== 0
      ? (nfts = [...nfts, ...nftApiResponse.assets])
      : (pagingFinish = true);
    offset += 50;
  } while (!pagingFinish);

  return nfts;
}
