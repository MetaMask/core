import type { OriginalRequest } from '../types';
import { convertNumericValuesToQuotedString } from './normalize';

/**
 * The function calls decoding api for typed signature V4 requests and returns the result.
 *
 * @param request - Signature request.
 * @param chainId - chainId of network of signature request.
 * @param decodingApiUrl - URL of decoding api.
 * @returns Promise that resolved to give decoded data.
 */
export async function getDecodingData(
  request: OriginalRequest,
  chainId: string,
  decodingApiUrl?: string,
) {
  if (!decodingApiUrl) {
    return undefined;
  }
  try {
    const { method, origin, params } = request;
    if (request.method === 'eth_signTypedData_v4') {
      const response = await fetch(
        `${decodingApiUrl}/signature?chainId=${chainId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            method,
            origin,
            params: [
              params?.[0],
              JSON.parse(convertNumericValuesToQuotedString(params?.[1]) ?? ''),
            ],
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      return await response.json();
    }
  } catch (error) {
    return {
      error: {
        message: error as string,
        type: 'DECODING_FAILED_WITH_ERROR',
      },
    };
  }
  return undefined;
}
