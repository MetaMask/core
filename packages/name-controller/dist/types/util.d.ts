/**
 * Execute a GraphQL query.
 *
 * @param url - GraphQL endpoint URL.
 * @param query - GraphQL query.
 * @param variables - GraphQL variables.
 */
export declare function graphQL<T>(url: string, query: string, variables: Record<string, any>): Promise<T>;
/**
 * Execute fetch and return object response.
 *
 * @param request - The request information.
 * @param options - The fetch options.
 * @returns The fetch response JSON data.
 */
export declare function handleFetch(request: string, options?: RequestInit): Promise<any>;
/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export declare function successfulFetch(request: string, options?: RequestInit): Promise<Response>;
/**
 * Assert that a value is an error. If it's not an error, throw an
 * error that wraps the given value.
 *
 * TODO: Migrate this to @metamask/utils
 *
 * @param error - The value that we expect to be an error.
 * @throws Throws an error wrapping the given value if it's not an error.
 */
export declare function assertIsError(error: unknown): asserts error is Error;
//# sourceMappingURL=util.d.ts.map