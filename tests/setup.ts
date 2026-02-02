// Export empty object to ensure this file is treated as a module (not a script)
export {};

// Clear native fetch in Node.js 18+ to ensure isomorphic-fetch uses node-fetch
// Node.js 18+ has native fetch that uses undici, which nock cannot intercept
// isomorphic-fetch only sets up node-fetch if global.fetch doesn't exist
// By clearing it first, isomorphic-fetch will use node-fetch, which nock can intercept
// This ensures we use isomorphic-fetch (which works in browser/mobile) while
// ensuring tests use a nock-compatible implementation
if (typeof globalThis.fetch !== 'undefined') {
  // @ts-expect-error - Intentionally clearing native fetch to force isomorphic-fetch to use node-fetch for nock compatibility
  delete globalThis.fetch;
  // @ts-expect-error - Clear related globals to ensure isomorphic-fetch sets up node-fetch versions
  delete globalThis.Headers;
  // @ts-expect-error - Clear Request to ensure isomorphic-fetch sets up node-fetch version
  delete globalThis.Request;
  // @ts-expect-error - Clear Response to ensure isomorphic-fetch sets up node-fetch version
  delete globalThis.Response;
}

// Require isomorphic-fetch, which will now set up node-fetch since we cleared native fetch
// This ensures we're using isomorphic-fetch (compatible with browser/mobile) while
// getting node-fetch under the hood (compatible with nock in tests)
// Using require() here allows us to clear native fetch first, which is necessary for nock compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports, import-x/no-unassigned-import
require('isomorphic-fetch');
