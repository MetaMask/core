/**
 * Test and development mocks for the APIs consumed by this package,
 * generated from their OpenAPI documents by Kubb (`yarn codegen`).
 *
 * Importable as `@metamask/core-backend/mocks`:
 *
 * ```ts
 * import {
 *   // Faker-based mock data builders
 *   createGetV3SpotPricesQueryResponse,
 *   // MSW request handlers
 *   getV3SpotPricesHandler,
 *   handlers,
 * } from '@metamask/core-backend/mocks';
 * ```
 *
 * Using the MSW handlers requires the optional `msw` peer dependency; using
 * the mock data builders requires the optional `@faker-js/faker` peer
 * dependency.
 */

export * from '../generated/price-api/mocks';
export * from '../generated/price-api/msw';
