import {
  array,
  boolean,
  number,
  record,
  string,
  type as structType,
  union,
  unknown,
  validate,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';

import type {
  ProfileServiceApiError,
  ProfileServiceErrorDetail,
} from './types.js';

/** Validation messages arrive as a single string or the legacy array form. */
const MessageStruct = union([string(), array(unknown())]);

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
 * Validates a single field in isolation.
 *
 * Every envelope field is optional and added independently by the API, so one
 * bad field (say, a `code_info` we don't recognise) shouldn't cost us the
 * perfectly good `code` and `requestId` sitting next to it.
 *
 * @param value - The raw field value from the parsed body.
 * @param struct - The struct describing the expected shape.
 * @returns The validated value, or `undefined` if the field is missing or
 * doesn't match.
 */
function readField<Value>(
  value: unknown,
  struct: Struct<Value>,
): Value | undefined {
  const [error, result] = validate(value, struct);
  return error ? undefined : result;
}

/**
 * Reads a single entry from the `details` array.
 *
 * `code` and `message` are what make an entry worth surfacing, so if either is
 * missing or the wrong type we drop the entry. `field` and `meta` are just
 * extra context, so we keep whichever of them parsed cleanly.
 *
 * @param value - The raw entry from the `details` array.
 * @returns The well-formed detail, or `undefined` if the entry is unusable.
 */
function readDetail(value: unknown): ProfileServiceErrorDetail | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const code = readField(raw.code, string());
  const message = readField(raw.message, string());
  if (code === undefined || message === undefined) {
    return undefined;
  }
  const field = readField(raw.field, string());
  const meta = readField(raw.meta, record(string(), unknown()));
  return {
    code,
    message,
    ...(field === undefined ? {} : { field }),
    ...(meta === undefined ? {} : { meta }),
  };
}

/**
 * Pulls the error envelope out of an unsuccessful API response body.
 *
 * The Profile API sends back `{ code, code_info, message, details, ... }` on
 * failure. Fields come and go between deployments, so we check each one on its
 * own: a value we can't parse only drops that value, never the whole envelope.
 * We only give up and return `undefined` when there's no usable body at all
 * (missing, not JSON, or not an object), which lets the caller fall back to a
 * generic message.
 *
 * @param response - The unsuccessful response.
 * @returns The API error envelope, or `undefined` if there isn't one.
 */
export async function readProfileApiError(
  response: Response,
): Promise<ProfileServiceApiError | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // The body is absent or not valid JSON; fall back to a generic message.
    return undefined;
  }

  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const raw = body as Record<string, unknown>;
  return {
    statusCode: readField(raw.statusCode, number()),
    error: readField(raw.error, string()),
    code: readField(raw.code, string()),
    code_info: readField(raw.code_info, ApiErrorCodeInfoStruct),
    message: readField(raw.message, MessageStruct),
    requestId: readField(raw.requestId, string()),
    traceId: readField(raw.traceId, string()),
    retryable: readField(raw.retryable, boolean()),
    details: Array.isArray(raw.details)
      ? raw.details
          .map(readDetail)
          .filter(
            (detail): detail is ProfileServiceErrorDetail =>
              detail !== undefined,
          )
      : undefined,
  };
}
