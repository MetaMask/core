import type { DecodedRequestInfo, OriginalRequest } from '../types';
import { convertNumbericValuestoQuotedString } from './normalize';

/**
 * The function calls decoding api for typed signature V4 requests and returns the result.
 *
 * @param request - Signature request.
 * @param decodingApiUrl - URL of decoding api.
 * @param chainId - chainId of network of signature request.
 * @returns Promise that resolved to give decoded data.
 */
export async function getDecodingResult(
  request: OriginalRequest,
  chainId: string,
  decodingApiUrl?: string,
) {
  if (!decodingApiUrl) {
    return undefined;
  }
  let decodedRequest: DecodedRequestInfo;
  try {
    const { method, origin, params } = request;
    if (request.method === 'eth_signTypedData_v4') {
      const response = await fetch(`${decodingApiUrl}?chainId=${chainId}`, {
        method: 'POST',
        body: JSON.stringify({
          method,
          origin,
          params: [
            params?.[0],
            JSON.parse(convertNumbericValuestoQuotedString(params?.[1]) ?? ''),
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      decodedRequest = await response.json();
    }
  } catch (error) {
    decodedRequest = {
      error: {
        message: error as string,
        type: 'DECODING_FAILED_WITH_ERROR',
      },
    };
  }
  return decodedRequest;
}
