/**
 * Price API bindings, generated from the vendored OpenAPI spec snapshot
 * (`specs/price-api.json`) by Kubb (`yarn codegen`).
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
 * The faker mock data builders and MSW handlers generated from the same
 * document are exposed separately through `@metamask/core-backend/mocks`, so
 * this entry point stays free of test-only dependencies.
 */

export * from '../generated/price-api/types';
export * from '../generated/price-api/structs';
export * from '../generated/price-api/queries';
