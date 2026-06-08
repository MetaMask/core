import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        'scripts/**/*.{ts,js,sh}',
        'tests/**/*.ts',
        '*.config.{js,cjs,mjs,ts}',
        'jest.config.*.js',
        'yarn.config.cjs',
        'eslint.config.mjs',
        '.prettierrc.js',
        'release.config.js',
        'knip.config.ts',
      ],
      project: ['scripts/**/*.ts', 'tests/**/*.ts', '*.{js,cjs,mjs,ts}'],
      ignore: ['scripts/create-package/package-template/**'],
      // The `preset: 'ts-jest'` shorthand expands to `ts-jest/jest-preset`,
      // which knip can't resolve to an actual file even though `ts-jest` is
      // listed in `devDependencies`.
      ignoreUnresolved: ['ts-jest/jest-preset'],
    },
  },
  ignoreDependencies: [
    // Dependencies used by Yarn binaries in `.yarn`
    /^@yarnpkg\//u,
    'clipanion',
    'typanion',
    // Dependencies imported implicitly by TypeScript
    /^@types\//u,
    // Tools (packages which we use as executables and not libraries)
    '@lavamoat/allow-scripts',
    '@metamask/auto-changelog',
    '@metamask/create-release-branch',
    'eslint-interactive',
    'rimraf',
    'simple-git-hooks',
    'ts-node',
    'typedoc',
    // Plugins for tools
    /^@typescript-eslint\//u,
    /^eslint-config-/u,
    /^eslint-plugin-/u,
    'jest-silent-reporter',
    'prettier-plugin-packagejson',
    'typescript-eslint',
    // Jest environments referenced in `jest.config.scripts.js`
    'jest-environment-node',
    'jest-environment-jsdom',
    // Dependencies imported implicitly by tools
    'eslint-import-resolver-typescript',
    // Dependencies which plug into the NPM lifecycle
    '@lavamoat/preinstall-always-fail',
  ],
};

export default config;
