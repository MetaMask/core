"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/util.ts
async function graphQL(url, query, variables) {
  const body = JSON.stringify({
    query,
    variables
  });
  const response = await handleFetch(url, {
    body,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });
  return response?.data;
}
async function handleFetch(request, options) {
  const response = await successfulFetch(request, options);
  const object = await response.json();
  return object;
}
async function successfulFetch(request, options) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${request}'`
    );
  }
  return response;
}
function assertIsError(error) {
  if (error instanceof Error) {
    return;
  }
  throw new Error(`Invalid error of type '${typeof error}'`);
}






exports.graphQL = graphQL; exports.handleFetch = handleFetch; exports.successfulFetch = successfulFetch; exports.assertIsError = assertIsError;
//# sourceMappingURL=chunk-MBPHCUIO.js.map