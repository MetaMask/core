import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      // The TradingView Advanced Charts engine is browser/WebView code that
      // relies on `window`, `document`, and `requestAnimationFrame`, so its
      // tests run in a DOM environment.
      environment: 'jsdom',
    },
  }),
);
