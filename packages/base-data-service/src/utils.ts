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
 * @template ResponseStruct - The struct used to validate and decode the response,
 * e.g. `Struct<FetchOrdersResponse>`, or `undefined` when no validation is needed.
 */
export function processMutationResponse<
  InputResponse,
  // We have to use `Struct<any>` here, as using `Struct<InputResponse>` (or
  // even `Struct<unknown>`) would reject a more concrete, "real world" struct.
  // The reason is that `Struct` is an object type with methods whose signatures
  // feature the struct's content type, making `Struct` contravariant in its
  // content type. The only way to get around this is to use `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponseStruct extends Struct<any> | undefined = undefined,
>(
  mutationKey: MutationKey,
  response: InputResponse,
  struct?: ResponseStruct,
  // We don't want this to be a type parameter as it should not be customizable
  // (it is only derived).
): ResponseStruct extends Struct<infer StructType>
  ? StructType
  : InputResponse {
  // Because we aren't defining the return type as a type parameter,
  // we need to restate it so we can reuse it below.
  type Response =
    ResponseStruct extends Struct<infer StructType>
      ? StructType
      : InputResponse;

  if (!struct) {
    // Type assertion: TypeScript cannot "see" that when `struct` is
    // `undefined`, `response` satisfies the `InputResponse` branch of
    // `Response` (even though we stated this fact in the conditional type
    // above). This is because at this point in time, `ResponseStruct` — being a
    // generic — is unresolved, which makes `Response` unresolved too. This is a
    // limitation of the way that generics work. Therefore, we need to help
    // TypeScript out.
    return response as unknown as Response;
  }

  const [error, result] = validate(response, struct);

  if (error) {
    throw new Error(
      `Mutation function for "${mutationKey[0]}" returned an unexpected response: ${error.message}.`,
    );
  }

  // Type assertion: See above.
  return result as unknown as Response;
}
