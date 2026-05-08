/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const path = require('path');

const baseConfig = require('../../jest.config.packages');

// Transitive dep of `@metamask/smart-accounts-kit`; resolved up-front so the
// base config's `^@metamask/(.+)$` mapper doesn't rewrite it to a missing path.
const delegationAbisBytecodePath =
  // eslint-disable-next-line n/no-extraneous-require
  require.resolve('@metamask/delegation-abis/bytecode');

const displayName = path.basename(__dirname);

module.exports = {
  ...baseConfig,
  displayName,
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  // The base config's `^@metamask/(.+)$` mapper rewrites every `@metamask/*`
  // import without honouring the package.json `exports` field, which breaks
  // subpath imports like `@metamask/smart-accounts-kit/utils`. Resolve those
  // explicitly here, before falling through to the base mapper.
  moduleNameMapper: {
    '^@metamask/smart-accounts-kit/utils$':
      require.resolve('@metamask/smart-accounts-kit/utils'),
    '^@metamask/delegation-abis/bytecode$': delegationAbisBytecodePath,
    ...baseConfig.moduleNameMapper,
  },
};
