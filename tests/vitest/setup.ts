import nodeFetch, {
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from 'node-fetch';

/**
 * Node's native `fetch` uses undici, which nock cannot intercept, so swap in
 * `node-fetch`. Assigned explicitly rather than by deleting the globals and
 * importing `isomorphic-fetch` the way `tests/setup.ts` does: that relies on
 * ts-jest emitting the `require` in source order, and under real ESM the import
 * runs first, leaving no `fetch` at all.
 */
globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
globalThis.Headers = NodeFetchHeaders as unknown as typeof globalThis.Headers;
globalThis.Request = NodeFetchRequest as unknown as typeof globalThis.Request;
globalThis.Response =
  NodeFetchResponse as unknown as typeof globalThis.Response;
