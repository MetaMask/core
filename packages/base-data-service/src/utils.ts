import { Struct, validate } from '@metamask/superstruct';

import type { MutationKey, QueryKey } from './BaseDataService.js';

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
      `Query function for "${queryKey[0]}" returned an unexpected response: ${error.message}.`,
    );
  }

  return result;
}

/**
 * Process mutation responses, validating them using Superstruct if a struct is defined.
 *
 * @param mutationKey - The mutation key.
 * @param response - The mutation response
 * @param struct - The struct defining the schema for the mutation response.
 * @returns The mutation response, coerced by Superstruct if needed.
 * @throws If the mutation response does not match the struct.
 * @template InputResponse - The type of the response data being validated, e.g. `Json`.
 * @template OutputResponse - The type of the response data after validation, e.g. `FetchOrdersResponse`.
 */
export function processMutationResponse<InputResponse, OutputResponse>(
  mutationKey: MutationKey,
  response: InputResponse,
  struct: Struct<OutputResponse>,
): OutputResponse {
  const [error, result] = validate(response, struct);

  if (error) {
    throw new Error(
      `Mutation function for "${mutationKey[0]}" returned an unexpected response: ${error.message}.`,
    );
  }

  return result;
}
