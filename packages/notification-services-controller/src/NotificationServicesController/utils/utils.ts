type JsonRequestMethod = 'POST';
type NoBodyMethod = 'GET' | 'DELETE';

type MakeApiCallOptions<Body> =
  | {
      method: NoBodyMethod;
      bearerToken?: string;
    }
  | {
      method: JsonRequestMethod;
      body: Body;
      bearerToken?: string;
    };

/**
 * Performs an API call with optional bearer authentication and JSON body support.
 *
 * @param endpoint - The URL of the API endpoint to call.
 * @param options - Request configuration.
 * @returns A Promise that resolves to the response of the fetch request.
 */
export async function makeApiCall<Body = never>(
  endpoint: string,
  options: MakeApiCallOptions<Body>,
): Promise<Response> {
  const headers: HeadersInit = {};

  if (options.bearerToken) {
    headers.Authorization = `Bearer ${options.bearerToken}`;
  }

  if ('body' in options) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(endpoint, {
    method: options.method,
    headers,
    body: 'body' in options ? JSON.stringify(options.body) : undefined,
  });
}
