import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcError, DataWithOptionalCause } from '@metamask/rpc-errors';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { AbstractRpcService, Block } from './types';
import { timeout } from './utils/timeout';

const RETRIABLE_ERRORS: string[] = [
  // ignore server overload errors
  'Gateway timeout',
  'ETIMEDOUT',
  // ignore server sent html error pages
  // or truncated json responses
  'failed to parse response body',
  // ignore errors where http req failed to establish
  'Failed to fetch',
];

/**
 * @deprecated Please use {@link JsonRpcRequestWithOrigin} instead.
 */
export interface PayloadWithOrigin extends JsonRpcRequest {
  origin?: string;
}

/**
 * Like a JSON-RPC request, but includes an optional `origin` property.
 * This will be included in the request as a header if specified.
 */
type JsonRpcRequestWithOrigin<Params extends JsonRpcParams> =
  JsonRpcRequest<Params> & {
    origin?: string;
  };

interface Request {
  method: string;
  headers: Record<string, string>;
  body: string;
}
interface FetchConfig {
  fetchUrl: string;
  fetchParams: Request;
}

/**
 * Creates middleware for sending a JSON-RPC request through the given RPC
 * service.
 *
 * @param args - The arguments to this function.
 * @param args.rpcService - The RPC service to use.
 * @param args.options - Options.
 * @param args.options.originHttpHeaderKey - If provided, the origin field for
 * each JSON-RPC request will be attached to each outgoing fetch request under
 * this header.
 * @returns The fetch middleware.
 */
export function createFetchMiddleware(args: {
  rpcService: AbstractRpcService;
  options?: {
    originHttpHeaderKey?: string;
  };
}): JsonRpcMiddleware<JsonRpcParams, Json>;

/**
 * Creates middleware for sending a JSON-RPC request to the given RPC URL.
 *
 * @deprecated This overload is deprecated — please pass an `RpcService`
 * instance from `@metamask/network-controller` instead.
 * @param args - The arguments to this function.
 * @param args.btoa - Generates a base64-encoded string from a binary string.
 * @param args.fetch - The `fetch` function; expected to be equivalent to
 * `window.fetch`.
 * @param args.rpcUrl - The URL to send the request to.
 * @param args.originHttpHeaderKey - If provided, the origin field for each
 * JSON-RPC request will be attached to each outgoing fetch request under this
 * header.
 * @returns The fetch middleware.
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function createFetchMiddleware(args: {
  btoa: (stringToEncode: string) => string;
  fetch: typeof fetch;
  rpcUrl: string;
  originHttpHeaderKey?: string;
}): JsonRpcMiddleware<JsonRpcParams, Json>;

export function createFetchMiddleware(
  args:
    | {
        rpcService: AbstractRpcService;
        options?: {
          originHttpHeaderKey?: string;
        };
      }
    | {
        btoa: (stringToEncode: string) => string;
        fetch: typeof fetch;
        rpcUrl: string;
        originHttpHeaderKey?: string;
      },
): JsonRpcMiddleware<JsonRpcParams, Json> {
  if ('rpcService' in args) {
    return createFetchMiddlewareWithRpcService(args);
  }
  return createFetchMiddlewareWithoutRpcService(args);
}

/**
 * Creates middleware for sending a JSON-RPC request through the given RPC
 * service.
 *
 * @param args - The arguments to this function.
 * @param args.rpcService - The RPC service to use.
 * @param args.options - Options.
 * @param args.options.originHttpHeaderKey - If provided, the origin field for
 * each JSON-RPC request will be attached to each outgoing fetch request under
 * this header.
 * @returns The fetch middleware.
 */
function createFetchMiddlewareWithRpcService({
  rpcService,
  options = {},
}: {
  rpcService: AbstractRpcService;
  options?: {
    originHttpHeaderKey?: string;
  };
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(
    async (req: JsonRpcRequestWithOrigin<JsonRpcParams>, res) => {
      const headers =
        'originHttpHeaderKey' in options &&
        options.originHttpHeaderKey !== undefined &&
        req.origin !== undefined
          ? { [options.originHttpHeaderKey]: req.origin }
          : {};

      const jsonRpcResponse = await rpcService.request(
        {
          id: req.id,
          jsonrpc: req.jsonrpc,
          method: req.method,
          params: req.params,
        },
        {
          headers,
        },
      );

      // NOTE: We intentionally do not test to see if `jsonRpcResponse.error` is
      // strictly a JSON-RPC error response as per
      // <https://www.jsonrpc.org/specification#error_object> to account for
      // Ganache returning error objects with extra properties such as `name`
      if ('error' in jsonRpcResponse) {
        throw rpcErrors.internal({
          data: jsonRpcResponse.error,
        });
      }

      // Discard the `id` and `jsonrpc` fields in the response body
      // (the JSON-RPC engine will fill those in)
      res.result = jsonRpcResponse.result;
    },
  );
}

/**
 * Creates middleware for sending a JSON-RPC request to the given RPC URL.
 *
 * @param args - The arguments to this function.
 * @param args.btoa - Generates a base64-encoded string from a binary string.
 * @param args.fetch - The `fetch` function; expected to be equivalent to
 * `window.fetch`.
 * @param args.rpcUrl - The URL to send the request to.
 * @param args.originHttpHeaderKey - If provider, the origin field for each
 * JSON-RPC request will be attached to each outgoing fetch request under this
 * header.
 * @returns The fetch middleware.
 */
function createFetchMiddlewareWithoutRpcService({
  btoa: givenBtoa,
  fetch: givenFetch,
  rpcUrl,
  originHttpHeaderKey,
}: {
  btoa: (stringToEncode: string) => string;
  fetch: typeof fetch;
  rpcUrl: string;
  originHttpHeaderKey?: string;
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(async (req, res, _next) => {
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({
      btoa: givenBtoa,
      req,
      rpcUrl,
      originHttpHeaderKey,
    });

    // attempt request multiple times
    const maxAttempts = 5;
    const retryInterval = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const fetchRes = await givenFetch(fetchUrl, fetchParams);
        // check for http errrors
        checkForHttpErrors(fetchRes);
        // parse response body
        const rawBody: string = await fetchRes.text();
        let fetchBody: Record<string, Block>;
        try {
          fetchBody = JSON.parse(rawBody);
        } catch (_) {
          throw new Error(
            `FetchMiddleware - failed to parse response body: "${rawBody}"`,
          );
        }
        const result: Block = parseResponse(fetchRes, fetchBody);
        // set result and exit retry loop
        res.result = result;
        return;
      } catch (err: any) {
        const errMsg: string = err.toString();
        const isRetriable: boolean = RETRIABLE_ERRORS.some((phrase) =>
          errMsg.includes(phrase),
        );
        // re-throw error if not retriable
        if (!isRetriable) {
          throw err;
        }
      }
      // delay before retrying
      await timeout(retryInterval);
    }
  });
}

function checkForHttpErrors(fetchRes: Response): void {
  // check for errors
  switch (fetchRes.status) {
    case 405:
      throw rpcErrors.methodNotFound();

    case 418:
      throw createRatelimitError();

    case 503:
    case 504:
      throw createTimeoutError();

    default:
      break;
  }
}

function parseResponse(fetchRes: Response, body: Record<string, Block>): Block {
  // check for error code
  if (fetchRes.status !== 200) {
    throw rpcErrors.internal({
      message: `Non-200 status code: '${fetchRes.status}'`,
      data: body,
    });
  }

  // check for rpc error
  if (body.error) {
    throw rpcErrors.internal({
      data: body.error,
    });
  }
  // return successful result
  return body.result;
}

/**
 * Generate `fetch` configuration for sending the given request to an RPC API.
 *
 * @deprecated This function was created to support a now-deprecated signature
 * for {@link createFetchMiddleware}. It will be removed in a future major
 * version.
 * @param options - Options
 * @param options.btoa - Generates a base64-encoded string from a binary string.
 * @param options.rpcUrl - The URL to send the request to.
 * @param options.originHttpHeaderKey - If provider, the origin field for each JSON-RPC request
 * will be attached to each outgoing fetch request under this header.
 * @param options.req
 * @returns The fetch middleware.
 */
export function createFetchConfigFromReq({
  // eslint-disable-next-line @typescript-eslint/no-shadow
  btoa,
  req,
  rpcUrl,
  originHttpHeaderKey,
}: {
  btoa: (stringToEncode: string) => string;
  rpcUrl: string;
  originHttpHeaderKey?: string;
  req: PayloadWithOrigin;
}): FetchConfig {
  const parsedUrl: URL = new URL(rpcUrl);
  const fetchUrl: string = normalizeUrlFromParsed(parsedUrl);

  // prepare payload
  // copy only canonical json rpc properties
  const payload: JsonRpcRequest = {
    id: req.id,
    jsonrpc: req.jsonrpc,
    method: req.method,
    params: req.params,
  };

  // extract 'origin' parameter from request
  const originDomain: string | undefined = req.origin;

  // serialize request body
  const serializedPayload: string = JSON.stringify(payload);

  // configure fetch params
  const fetchParams: Request = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: serializedPayload,
  };

  // encoded auth details as header (not allowed in fetch url)
  if (parsedUrl.username && parsedUrl.password) {
    const authString = `${parsedUrl.username}:${parsedUrl.password}`;
    const encodedAuth = btoa(authString);
    fetchParams.headers.Authorization = `Basic ${encodedAuth}`;
  }

  // optional: add request origin as header
  if (originHttpHeaderKey && originDomain) {
    fetchParams.headers[originHttpHeaderKey] = originDomain;
  }

  return { fetchUrl, fetchParams };
}

function normalizeUrlFromParsed(parsedUrl: URL): string {
  let result = '';
  result += parsedUrl.protocol;
  result += `//${parsedUrl.hostname}`;
  if (parsedUrl.port) {
    result += `:${parsedUrl.port}`;
  }
  result += `${parsedUrl.pathname}`;
  result += `${parsedUrl.search}`;
  return result;
}

function createRatelimitError(): JsonRpcError<DataWithOptionalCause> {
  return rpcErrors.internal({ message: `Request is being rate limited.` });
}

function createTimeoutError(): JsonRpcError<DataWithOptionalCause> {
  let msg = `Gateway timeout. The request took too long to process. `;
  msg += `This can happen when querying logs over too wide a block range.`;
  return rpcErrors.internal({ message: msg });
}
