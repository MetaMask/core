import type { EthereumRpcError } from 'eth-rpc-errors';
import { ethErrors } from 'eth-rpc-errors';
import type { JsonRpcMiddleware, JsonRpcRequest } from 'json-rpc-engine';
import { createAsyncMiddleware } from 'json-rpc-engine';

import type { Block } from './types';
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

export interface PayloadWithOrigin extends JsonRpcRequest<unknown> {
  origin?: string;
}
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
 * Create middleware for sending a JSON-RPC request to the given RPC URL.
 *
 * @param options - Options
 * @param options.btoa - Generates a base64-encoded string from a binary string.
 * @param options.fetch - The `fetch` function; expected to be equivalent to `window.fetch`.
 * @param options.rpcUrl - The URL to send the request to.
 * @param options.originHttpHeaderKey - If provider, the origin field for each JSON-RPC request
 * will be attached to each outgoing fetch request under this header.
 * @returns The fetch middleware.
 */
export function createFetchMiddleware({
  // eslint-disable-next-line @typescript-eslint/no-shadow
  btoa,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  fetch,
  rpcUrl,
  originHttpHeaderKey,
}: {
  btoa: (stringToEncode: string) => string;
  fetch: typeof global.fetch;
  rpcUrl: string;
  originHttpHeaderKey?: string;
}): JsonRpcMiddleware<unknown, unknown> {
  return createAsyncMiddleware(async (req, res, _next) => {
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({
      btoa,
      req,
      rpcUrl,
      originHttpHeaderKey,
    });

    // attempt request multiple times
    const maxAttempts = 5;
    const retryInterval = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const fetchRes = await fetch(fetchUrl, fetchParams);
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
      throw ethErrors.rpc.methodNotFound();

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
    throw ethErrors.rpc.internal({
      message: `Non-200 status code: '${fetchRes.status}'`,
      data: body,
    });
  }

  // check for rpc error
  if (body.error) {
    throw ethErrors.rpc.internal({
      data: body.error,
    });
  }
  // return successful result
  return body.result;
}

/**
 * Generate `fetch` configuration for sending the given request to an RPC API.
 *
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
  const payload: JsonRpcRequest<unknown> = {
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

function createRatelimitError(): EthereumRpcError<unknown> {
  return ethErrors.rpc.internal({ message: `Request is being rate limited.` });
}

function createTimeoutError(): EthereumRpcError<unknown> {
  let msg = `Gateway timeout. The request took too long to process. `;
  msg += `This can happen when querying logs over too wide a block range.`;
  return ethErrors.rpc.internal({ message: msg });
}
