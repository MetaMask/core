import { Struct, validate } from '@metamask/superstruct';

import { QueryKey } from './BaseDataService';

/**
 * Process query responses, validating them using Superstruct if a struct is defined.
 * 
 * @param queryKey - The query key.
 * @param response - The query response
 * @param struct - The struct defining the schema for the query response.
 * @returns The query response, coerced by Superstruct if needed.
 * @throws If the query response does not match the struct.
 */
export function processQueryResponse<Response>(
  queryKey: QueryKey,
  response: Response,
  struct?: Struct<Response>,
): Response {
  if (!struct) {
    return response;
  }

  const [error, result] = validate(response, struct);

  if (error) {
    throw new Error(
      `${queryKey[0]} returned an invalid response: ${error.message}.`,
    );
  }

  return result;
}
