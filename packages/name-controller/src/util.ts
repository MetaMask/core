/**
 * Execute a GraphQL query.
 *
 * @param url - GraphQL endpoint URL.
 * @param query - GraphQL query.
 * @param variables - GraphQL variables.
 */
export async function graphQL<T>(
  url: string,
  query: string,
  variables: Record<string, any>,
): Promise<T> {
  const body = JSON.stringify({
    query,
    variables,
  });

  const response = await handleFetch(url, {
    body,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response?.data;
}

// Below functions are intentionally copied from controller-utils to avoid a package dependency

/**
 * Execute fetch and return object response.
 *
 * @param request - The request information.
 * @param options - The fetch options.
 * @returns The fetch response JSON data.
 */
export async function handleFetch(request: string, options?: RequestInit) {
  const response = await successfulFetch(request, options);
  const object = await response.json();
  return object;
}

/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function successfulFetch(request: string, options?: RequestInit) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${request}'`,
    );
  }
  return response;
}
