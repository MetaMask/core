/**
 * Execute a GraphQL query.
 *
 * @param url - GraphQL endpoint URL.
 * @param query - GraphQL query.
 * @param variables - GraphQL variables.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function graphQL<T>(
  url: string,
  query: string,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Assert that a value is an error. If it's not an error, throw an
 * error that wraps the given value.
 *
 * TODO: Migrate this to @metamask/utils
 *
 * @param error - The value that we expect to be an error.
 * @throws Throws an error wrapping the given value if it's not an error.
 */
export function assertIsError(error: unknown): asserts error is Error {
  if (error instanceof Error) {
    return;
  }
  throw new Error(`Invalid error of type '${typeof error}'`);
}
