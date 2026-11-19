import { HttpError } from '@metamask/controller-utils';

/**
 * Thrown when a response from the Money Account API fails superstruct
 * validation. Indicates a contract mismatch between client and server.
 */
export class MoneyAccountApiResponseValidationError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'MoneyAccountApiDataService: malformed response received from Money Account API',
    );
    this.name = 'MoneyAccountApiResponseValidationError';
  }
}

export const MAX_RESPONSE_BODY_LENGTH = 1000;

export const REDACTED_ADDRESS = '0x[redacted]';

/**
 * Response headers that carry no user data and help correlate a failure with
 * server, load balancer, or CDN logs.
 */
const DIAGNOSTIC_RESPONSE_HEADERS = [
  'age',
  'cache-control',
  'cf-ray',
  'content-length',
  'content-type',
  'date',
  'retry-after',
  'server',
  'traceparent',
  'via',
  'x-amzn-requestid',
  'x-amzn-trace-id',
  'x-cache',
  'x-request-id',
] as const;

const HEX_ADDRESS_PATTERN = /0x[0-9a-f]{40}/giu;

/**
 * Thrown when the Money Account API responds with a non-2xx status. Carries
 * the response body and diagnostic headers so consumers can report failures
 * with enough detail to debug them.
 *
 * The API can echo the requested URL or address in error messages, so every
 * hex address in the body is redacted and the body is truncated.
 */
export class MoneyAccountApiHttpError extends HttpError {
  readonly responseBody: string | null;

  readonly responseHeaders: Record<string, string>;

  constructor({
    status,
    message,
    responseBody = null,
    responseHeaders = {},
  }: {
    status: number;
    message?: string;
    responseBody?: string | null;
    responseHeaders?: Record<string, string>;
  }) {
    super(status, message);
    this.name = 'MoneyAccountApiHttpError';
    this.responseBody = responseBody;
    this.responseHeaders = responseHeaders;
  }

  /**
   * Builds an error from a failed response, reading and sanitizing its body.
   *
   * @param response - The non-2xx response.
   * @param message - The error message.
   * @returns The error.
   */
  static async fromResponse(
    response: Response,
    message: string,
  ): Promise<MoneyAccountApiHttpError> {
    return new MoneyAccountApiHttpError({
      status: response.status,
      message,
      responseBody: await readSanitizedBody(response),
      responseHeaders: pickDiagnosticHeaders(response.headers),
    });
  }
}

/**
 * Reads a response body as text, redacting hex addresses and truncating it.
 *
 * @param response - The response to read.
 * @returns The sanitized body, or `null` if it could not be read.
 */
async function readSanitizedBody(response: Response): Promise<string | null> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return null;
  }

  const redacted = body.replace(HEX_ADDRESS_PATTERN, REDACTED_ADDRESS);
  return redacted.length > MAX_RESPONSE_BODY_LENGTH
    ? `${redacted.slice(0, MAX_RESPONSE_BODY_LENGTH)}…`
    : redacted;
}

/**
 * Picks the allowlisted diagnostic headers from a response.
 *
 * @param headers - The response headers.
 * @returns The allowlisted headers that are present.
 */
function pickDiagnosticHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of DIAGNOSTIC_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) {
      picked[name] = value;
    }
  }
  return picked;
}
