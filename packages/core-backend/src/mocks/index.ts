/**
 * Test and development mocks for the APIs consumed by this package,
 * generated from their vendored OpenAPI spec snapshots by Kubb
 * (`yarn codegen`).
 *
 * Importable as `@metamask/core-backend/mocks`:
 *
 * ```ts
 * import {
 *   // Faker-based mock data builders
 *   createV3SpotPrices,
 *   // MSW request handlers (unit/integration tests)
 *   getV3SpotPricesHandler,
 *   handlers,
 * } from '@metamask/core-backend/mocks';
 *
 * // The same mock data also feeds e2e mock servers (mockttp), so fixtures
 * // regenerate with the spec instead of drifting:
 * mockServer
 *   .forGet('https://price.api.cx.metamask.io/v3/spot-prices')
 *   .thenJson(200, createV3SpotPrices());
 * ```
 *
 * Using the MSW handlers requires the optional `msw` peer dependency; using
 * the mock data builders requires the optional `@faker-js/faker` peer
 * dependency.
 */

export * from '../generated/price-api/mocks';
export * from '../generated/price-api/msw';
