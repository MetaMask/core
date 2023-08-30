// Below functions are intentionally copied from controller-utils to avoid package dependency

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
