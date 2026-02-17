// Node.js v24 native fetch uses undici, which nock cannot intercept.
// Replace it with node-fetch (http-based, nock-compatible).
//
// This is the Vitest-compatible version of setup.ts. We use node-fetch
// directly rather than isomorphic-fetch because isomorphic-fetch hangs
// when loaded through Vite's module system.
import nodeFetch, { Headers, Request, Response } from 'node-fetch';

// @ts-expect-error node-fetch types differ slightly from native fetch
globalThis.fetch = nodeFetch;
// @ts-expect-error node-fetch types differ slightly from native types
globalThis.Headers = Headers;
// @ts-expect-error node-fetch types differ slightly from native types
globalThis.Request = Request;
// @ts-expect-error node-fetch types differ slightly from native types
globalThis.Response = Response;
