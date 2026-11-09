import {
  array,
  boolean,
  number,
  optional,
  record,
  string,
  type as structType,
  union,
  unknown,
  validate,
} from '@metamask/superstruct';

import type { ProfileServiceApiError } from './types.js';

/**
 * A field-level detail from a Profile API error response. Validation failures
 * carry one entry per rejected field.
 */
const ApiErrorDetailStruct = structType({
  field: optional(string()),
  code: string(),
  message: string(),
  meta: optional(record(string(), unknown())),
});

/**
 * The additive classification object the Profile API attaches to an error
 * code.
 */
const ApiErrorCodeInfoStruct = structType({
  id: string(),
  http_status: number(),
  category: string(),
  retryable: boolean(),
});

/**
 * The body the Profile API returns for a non-2xx response. Only `message` is
 * guaranteed; the rest is additive and may be absent on older deployments.
 */
const ApiErrorResponseStruct = structType({
  statusCode: optional(number()),
  error: optional(string()),
  code: optional(string()),
  code_info: optional(ApiErrorCodeInfoStruct),
  message: optional(union([string(), array(unknown())])),
  requestId: optional(string()),
  traceId: optional(string()),
  retryable: optional(boolean()),
  details: optional(array(ApiErrorDetailStruct)),
});

/**
 * Reads the error envelope from an unsuccessful API response body.
 *
 * The Profile API returns errors as `{ code, code_info, message, details,
 * ... }`. If the body is missing, is not JSON, or does not match the
 * envelope, this returns `undefined` so the caller can fall back to a generic
 * message.
 *
 * @param response - The unsuccessful response.
 * @returns The API error envelope, or `undefined` if unavailable.
 */
export async function readProfileApiError(
  response: Response,
): Promise<ProfileServiceApiError | undefined> {
  try {
    const body: unknown = await response.json();
    const [error, result] = validate(body, ApiErrorResponseStruct);
    if (!error) {
      return result;
    }
  } catch {
    // The body is absent or not valid JSON; fall back to a generic message.
  }
  return undefined;
}
