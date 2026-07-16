import { Struct, validate } from '@metamask/superstruct';

import { QueryKey } from './BaseDataService';

export function processQueryResponse<Response>(
  queryKey: QueryKey,
  response: Response,
  struct?: Struct,
) {
  if (!struct) {
    return response;
  }

  const [error, result] = validate(response, struct);

  if (error) {
    throw new Error(
      `${queryKey} returned an invalid response: ${error.message}.`,
    );
  }

  return result;
}
