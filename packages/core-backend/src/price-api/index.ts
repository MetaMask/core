/**
 * Price API bindings, generated from the API's OpenAPI document by Kubb
 * (`yarn codegen`).
 *
 * Importable as `@metamask/core-backend/price-api`:
 *
 * ```ts
 * import {
 *   // TypeScript types
 *   type GetV3SpotPricesQueryResponse,
 *   // @metamask/superstruct structs
 *   GetV3SpotPricesQueryResponseStruct,
 *   // TanStack query-core bindings
 *   fetchV3SpotPrices,
 *   getV3SpotPricesQueryOptions,
 * } from '@metamask/core-backend/price-api';
 * ```
 *
 * The faker mocks and MSW handlers generated from the same document are
 * exposed separately through `@metamask/core-backend/mocks`, so this entry
 * point stays free of test-only dependencies.
 */

export * from '../generated/price-api/types';
export * from '../generated/price-api/schemas';
export * from '../generated/price-api/queries';
