const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  displayName,
  coverageThreshold: {
    global: {
      branches: 99.27,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
