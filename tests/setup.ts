// Node.js v24 native fetch uses undici, which nock cannot intercept.
// Clear it so isomorphic-fetch sets up node-fetch (http-based, nock-compatible).
// @ts-expect-error Intentionally clearing native globals
delete globalThis.fetch;
// @ts-expect-error - Clear Response to ensure isomorphic-fetch sets up node-fetch version
delete globalThis.Headers;
// @ts-expect-error - Clear Response to ensure isomorphic-fetch sets up node-fetch version
delete globalThis.Request;
// @ts-expect-error - Clear Response to ensure isomorphic-fetch sets up node-fetch version
delete globalThis.Response;
// We need to import this *after* we delete `fetch` etc. above.
// Additionally, this import is used for side effects only.
// eslint-disable-next-line import-x/first, import-x/no-unassigned-import
import 'isomorphic-fetch';
