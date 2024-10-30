import type { OriginalRequest } from '../types';
import { convertNumericValuesToQuotedString } from './normalize';

export const DECODING_API_ERRORS = {
  UNSUPPORTED_SIGNATURE: 'UNSUPPORTED_SIGNATURE',
  DECODING_FAILED_WITH_ERROR: 'DECODING_FAILED_WITH_ERROR',
};

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
              params[0],
              JSON.parse(convertNumericValuesToQuotedString(params[1])),
            ],
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      return await response.json();
    }
    return {
      error: {
        message: 'Unsupported signature.',
        type: DECODING_API_ERRORS.UNSUPPORTED_SIGNATURE,
      },
    };
  } catch (error: unknown) {
    return {
      error: {
        message: (error as unknown as Error).message,
        type: DECODING_API_ERRORS.DECODING_FAILED_WITH_ERROR,
      },
    };
  }
}
