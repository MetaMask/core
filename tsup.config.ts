import { builtinModules } from 'module';
import type { Options } from 'tsup';

const config: Options = {
  // Clean the dist folder before bundling.
  clean: true,

  // The entry to bundle.
  entry: [
    'src/**/*.ts',
    '!src/**/__fixtures__/**/*',
    '!src/**/__mocks__/**/*',
    '!src/**/__test__/**/*',
    '!src/**/__tests__/**/*',
    '!src/**/__snapshots__/**/*',
    '!src/**/test-utils/**/*',
    '!src/**/*.test.ts',
    '!src/**/*.test-d.ts',
    '!src/**/*.test.*.ts',
  ],

  // External modules that should not be processed by `tsup`. We want to
  // exclude built-in Node.js modules from the bundle.
  // https://tsup.egoist.dev/#excluding-packages
  external: builtinModules,

  // The output formats. We want to generate both CommonJS and ESM bundles.
  // https://tsup.egoist.dev/#bundle-formats
  format: ['cjs', 'esm'],

  // The platform to target when generating the bundles. `neutral` means that
  // the bundles will work in both Node.js and browsers.
  platform: 'neutral',

  // Generate sourcemaps as separate files.
  // https://tsup.egoist.dev/#generate-sourcemap-file
  sourcemap: true,

  // Split the output into chunks. This is useful for tree-shaking.
  // https://tsup.egoist.dev/#code-splitting
  splitting: true,
};

export default config;
