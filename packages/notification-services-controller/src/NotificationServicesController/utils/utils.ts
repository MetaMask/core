/**
 * Performs an API call with automatic retries on failure.
 *
 * @param bearerToken - The JSON Web Token for authorization.
 * @param endpoint - The URL of the API endpoint to call.
 * @param method - The HTTP method ('POST' or 'DELETE').
 * @param body - The body of the request. It should be an object that can be serialized to JSON.
 * @returns A Promise that resolves to the response of the fetch request.
 */
export async function makeApiCall<Body>(
  bearerToken: string,
  endpoint: string,
  method: 'POST' | 'DELETE',
  body: Body,
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(body),
  };

  return await fetch(endpoint, options);
}
