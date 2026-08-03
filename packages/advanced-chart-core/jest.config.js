/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // The TradingView Advanced Charts engine is browser/WebView code that relies
  // on `window`, `document`, and `requestAnimationFrame`, so its tests run in a
  // DOM environment. (Upstream in mobile these were per-file `@jest-environment
  // jsdom` docblocks; here it is the package default.)
  testEnvironment: 'jsdom',

  // Reset the node-oriented `customExportConditions` inherited from the base
  // config so jsdom resolves browser export conditions.
  testEnvironmentOptions: {},
});
