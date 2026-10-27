import nodeFetch, {
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from 'node-fetch';

// Use node-fetch so nock can intercept requests.
globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
globalThis.Headers = NodeFetchHeaders as unknown as typeof globalThis.Headers;
globalThis.Request = NodeFetchRequest as unknown as typeof globalThis.Request;
globalThis.Response =
  NodeFetchResponse as unknown as typeof globalThis.Response;
