import { defineConfig } from '@kubb/core';
import { pluginFaker } from '@kubb/plugin-faker';
import { pluginMsw } from '@kubb/plugin-msw';
import { pluginOas } from '@kubb/plugin-oas';
import { pluginTs } from '@kubb/plugin-ts';

import { pluginQueryCore } from './kubb-plugin-query-core';
import { pluginSuperstruct } from './kubb-plugin-superstruct';

/**
 * Kubb code generation for the Price API (https://price.api.cx.metamask.io).
 *
 * Generates, from `codegen/openapi/price-api.json` into
 * `src/generated/price-api`:
 * - `types/`   TypeScript types                     (@kubb/plugin-ts)
 * - `schemas/` @metamask/superstruct structs        (codegen/kubb-plugin-superstruct)
 * - `mocks/`   Faker-based mock builders            (@kubb/plugin-faker)
 * - `msw/`     MSW request handlers                 (@kubb/plugin-msw)
 * - `queries/` TanStack query-core bindings         (codegen/kubb-plugin-query-core)
 *
 * Run with `yarn workspace @metamask/core-backend run codegen`, which
 * executes this config through `codegen/run.ts`.
 */
export default defineConfig({
  name: 'price-api',
  // Resolved relative to the working directory, which is the package root
  // when run through `yarn workspace @metamask/core-backend run codegen`.
  root: '.',
  input: {
    path: './codegen/openapi/price-api.json',
  },
  output: {
    path: './src/generated/price-api',
    clean: true,
    // No root barrel: the package's `./price-api` and `./mocks` entry points
    // (`src/price-api/index.ts` and `src/mocks/index.ts`) re-export the
    // per-plugin barrels, keeping the msw/faker mocks out of the runtime
    // entry point.
    barrelType: false,
    defaultBanner: 'simple',
    // Emit extension-less relative imports so the generated code can be
    // compiled by ts-bridge (CommonJS + ESM).
    extension: {
      '.ts': '',
    },
    // Formatting is handled by the repo's own tooling (`yarn lint:fix`).
    format: false,
    lint: false,
  },
  plugins: [
    pluginOas({
      validate: true,
      // Don't emit the raw JSON schema files.
      generators: [],
      output: {
        path: 'json',
        barrelType: false,
      },
    }),
    pluginTs({
      output: {
        path: 'types',
        barrelType: 'named',
      },
      enumType: 'asConst',
      unknownType: 'unknown',
    }),
    pluginSuperstruct({
      output: {
        path: 'schemas',
        barrelType: 'named',
      },
    }),
    pluginFaker({
      output: {
        path: 'mocks',
        barrelType: 'named',
      },
      unknownType: 'unknown',
      // Deterministic mock data across runs and tests.
      seed: [220],
    }),
    pluginMsw({
      output: {
        path: 'msw',
        barrelType: 'named',
      },
      baseURL: 'https://price.api.cx.metamask.io',
      parser: 'faker',
      handlers: true,
    }),
    pluginQueryCore({
      output: {
        path: 'queries',
        barrelType: 'named',
      },
      queryKeyPrefix: 'prices',
      runtimeImportPath: '../../../api/query-runtime',
    }),
  ],
});
