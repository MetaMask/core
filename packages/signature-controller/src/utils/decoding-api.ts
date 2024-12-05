import { EthMethod, type OriginalRequest } from '../types';
import { normalizeParam } from './normalize';

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
export async function decodeSignature(
  request: OriginalRequest,
  chainId: string,
  decodingApiUrl: string,
) {
  try {
    const { method, origin, params } = request;
    if (
      request.method === EthMethod.SignTypedDataV4 ||
      request.method === EthMethod.SignTypedDataV3
    ) {
      const response = await fetch(
        `${decodingApiUrl}/signature?chainId=${chainId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            method,
            origin,
            params: [params[0], normalizeParam(params[1])],
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
