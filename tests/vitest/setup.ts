import nodeFetch, {
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from 'node-fetch';

/**
 * Node.js v24's native `fetch` uses undici, which nock cannot intercept, so we
 * replace it with `node-fetch`, which is http-based and therefore
 * nock-compatible.
 *
 * NOTE: `tests/setup.ts` does the same thing by deleting the native globals and
 * importing `isomorphic-fetch` for its side effect of filling them back in. That
 * only works because ts-jest emits the `require` call in source order. These
 * tests run as real ESM, where every static `import` is evaluated before any
 * statement in the module body, so the globals are assigned explicitly here
 * instead.
 */
globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
globalThis.Headers = NodeFetchHeaders as unknown as typeof globalThis.Headers;
globalThis.Request = NodeFetchRequest as unknown as typeof globalThis.Request;
globalThis.Response =
  NodeFetchResponse as unknown as typeof globalThis.Response;
