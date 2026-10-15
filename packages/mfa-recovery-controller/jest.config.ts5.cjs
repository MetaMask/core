const merge = require('deepmerge');

const baseConfig = require('./jest.config.cjs');

const config = merge(baseConfig, {});
config.transform = {
  '^.+\\.tsx?$': [
    'ts-jest',
    {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        verbatimModuleSyntax: false,
      },
    },
  ],
};

module.exports = config;
