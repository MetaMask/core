import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        'scripts/**/*.{ts,js,sh}',
        'tests/**/*.ts',
        '*.config.{js,cjs,mjs,ts}',
        '.prettierrc.js',
      ],
      project: ['scripts/**/*.ts', 'tests/**/*.ts', '*.{js,cjs,mjs,ts}'],
      ignore: ['scripts/create-package/package-template/**'],
      // The `preset: 'ts-jest'` shorthand expands to `ts-jest/jest-preset`,
      // which knip can't resolve to an actual file even though `ts-jest` is
      // listed in `devDependencies`.
      ignoreUnresolved: ['ts-jest/jest-preset'],
    },
    'packages/perps-controller': {
      ignoreDependencies: ['@metamask/accounts-controller'],
      // The mobile client provides `core/Engine`; tests mock it via a
      // relative path that doesn't resolve inside this monorepo.
      ignoreUnresolved: [/^\.\.\/\.\.\/\.\.\/core\/Engine$/u],
    },

    // -- Per-workspace `ignoreDependencies` snapshots --
    //
    // The entries below were captured when knip's scope expanded from "root
    // only" to the whole monorepo. Each one is a real signal — either a
    // missing direct dep (relying on transitive resolution), a dead dep, or a
    // knip blind spot — and should be re-evaluated by the owning team. Drop
    // an entry once you've either fixed the issue or confirmed it's a
    // permanent false positive worth recording.
    'packages/account-tree-controller': {
      ignoreDependencies: [
        '@metamask/controller-utils',
        '@metamask/keyring-internal-api',
        'lodash',
      ],
    },
    'packages/analytics-data-regulation-controller': {
      ignoreDependencies: ['cockatiel'],
    },
    'packages/assets-controller': {
      ignoreDependencies: ['@metamask/snaps-sdk'],
    },
    'packages/assets-controllers': {
      ignoreDependencies: [
        '@metamask/multichain-account-service',
        'bitcoin-address-validation',
      ],
    },
    'packages/bridge-controller': {
      ignoreDependencies: [
        '@metamask/eth-json-rpc-provider',
        '@metamask/keyring-internal-api',
      ],
    },
    'packages/bridge-status-controller': {
      ignoreDependencies: [
        '@metamask/gas-fee-controller',
        '@metamask/remote-feature-flag-controller',
        'lodash',
        'nock',
      ],
    },
    'packages/compliance-controller': {
      ignoreDependencies: ['cockatiel'],
    },
    'packages/config-registry-controller': {
      ignoreDependencies: ['cockatiel'],
    },
    'packages/core-backend': {
      ignoreDependencies: ['@metamask/keyring-internal-api'],
    },
    'packages/earn-controller': {
      ignoreDependencies: ['@metamask/keyring-internal-api'],
    },
    'packages/eip-5792-middleware': {
      ignoreDependencies: [
        '@metamask/accounts-controller',
        '@metamask/keyring-internal-api',
        '@metamask/preferences-controller',
      ],
    },
    'packages/eip-7702-internal-rpc-middleware': {
      ignoreDependencies: ['@metamask/controller-utils'],
    },
    'packages/eip1193-permission-middleware': {
      ignoreDependencies: ['@metamask/rpc-errors'],
    },
    'packages/ens-controller': {
      ignoreDependencies: ['punycode'],
    },
    'packages/foundryup': {
      // `anvil` and `sysctl` are external system binaries, not npm packages.
      ignoreBinaries: ['anvil', 'sysctl'],
      ignoreDependencies: ['yargs-parser'],
    },
    'packages/java-tron-up': {
      // `sysctl` is an external system binary, not an npm package.
      ignoreBinaries: ['sysctl'],
    },
    'packages/keyring-controller': {
      ignoreDependencies: ['@metamask/controller-utils'],
    },
    'packages/local-node-utils': {
      // `sysctl` is an external system binary, not an npm package.
      ignoreBinaries: ['sysctl'],
    },
    'packages/gas-fee-controller': {
      ignoreDependencies: ['@metamask/ethjs-unit', 'jest-when'],
    },
    'packages/geolocation-controller': {
      ignoreDependencies: ['cockatiel'],
    },
    'packages/logging-controller': {
      ignoreDependencies: ['@metamask/controller-utils'],
    },
    'packages/message-manager': {
      ignoreDependencies: ['@metamask/eth-sig-util', 'immer', 'jsonschema'],
    },
    'packages/multichain-account-service': {
      ignoreDependencies: [
        '@metamask/base-controller',
        '@metamask/superstruct',
        'lodash',
      ],
    },
    'packages/multichain-network-controller': {
      ignoreDependencies: ['@solana/addresses', 'immer', 'nock'],
    },
    'packages/multichain-transactions-controller': {
      ignoreDependencies: ['@metamask/polling-controller'],
    },
    'packages/phishing-controller': {
      ignoreDependencies: ['immer', 'punycode'],
    },
    'packages/platform-api-docs': {
      // This package has both a CLI (`src/`) and a Docusaurus site (`site/`).
      // Scan both so the CLI's deps (e.g. `glob`, `ts-morph`) and the site's
      // `@docusaurus/*` / `prism-react-renderer` imports in
      // `docusaurus.config.ts` are seen and neither gets flagged as unused.
      entry: ['site/docusaurus.config.ts'],
      project: ['src/**/*.{ts,tsx}', 'site/**/*.{ts,tsx}'],
      ignoreDependencies: [
        // Docusaurus runtime and React peers loaded by the framework at build
        // time; the `docusaurus` binary is invoked via execa, never imported
        // by source.
        '@docusaurus/core',
        '@docusaurus/plugin-content-docs',
        '@mdx-js/react',
        'react',
        'react-dom',
        // Loaded by docusaurus as a plugin name string (themes[0]); knip
        // doesn't trace string-referenced plugins.
        '@easyops-cn/docusaurus-search-local',
        // Pulled in transitively by `@docusaurus/preset-classic`; pinned here
        // so the framework's webpack/theme resolution finds a single version.
        '@docusaurus/theme-common',
      ],
    },
    'packages/profile-metrics-controller': {
      ignoreDependencies: ['cockatiel'],
    },
    'packages/profile-sync-controller': {
      ignoreDependencies: [
        '@metamask/controller-utils',
        '@metamask/keyring-api',
        '@metamask/keyring-internal-api',
        '@metamask/snaps-utils',
        'immer',
        'loglevel',
      ],
    },
    'packages/ramps-controller': {
      ignoreDependencies: ['immer'],
    },
    'packages/remote-feature-flag-controller': {
      ignoreDependencies: ['cockatiel', 'nock'],
    },
    'packages/selected-network-controller': {
      ignoreDependencies: ['immer', 'lodash', 'nock'],
    },
    'packages/signature-controller': {
      ignoreDependencies: ['lodash'],
    },
    'packages/snap-account-service': {
      ignoreDependencies: [
        '@metamask/account-tree-controller',
        '@metamask/snaps-utils',
      ],
    },
    'packages/subscription-controller': {
      ignoreDependencies: ['@metamask/controller-utils'],
    },
    'packages/transaction-controller': {
      ignoreDependencies: [
        '@ethereumjs/util',
        '@metamask/keyring-controller',
        'nock',
      ],
    },
    'packages/transaction-pay-controller': {
      ignoreDependencies: [
        '@ethersproject/contracts',
        '@ethersproject/providers',
        'bn.js',
      ],
    },
    'packages/user-operation-controller': {
      ignoreDependencies: ['immer'],
    },
    'packages/wallet-cli': {
      // `tsx` is the dev-mode loader: it's referenced only as a `node --import`
      // argument string (in `daemon-spawn`'s source-entry path and `bin/dev`),
      // never as a traceable import, so knip can't see it.
      ignoreDependencies: ['tsx'],
    },
    'packages/wallet-framework-docs': {
      // Source lives under `site/` instead of `src/`; tell knip to scan it
      // so the type imports of `@docusaurus/*` / `prism-react-renderer` in
      // `docusaurus.config.ts` and `sidebars.ts` are seen and the matching
      // devDeps don't get flagged as unused.
      entry: ['site/docusaurus.config.ts', 'site/sidebars.ts'],
      project: ['content/**/*.{ts,tsx}', 'site/**/*.{ts,tsx}'],
      ignoreDependencies: [
        // Loaded by docusaurus as a plugin name string (themes[0]); knip
        // doesn't trace string-referenced plugins.
        '@easyops-cn/docusaurus-search-local',
        // Pulled in transitively by `@docusaurus/preset-classic`; pinned
        // here so the framework's webpack/theme resolution finds a single
        // matching version.
        '@docusaurus/theme-common',
        // Webpack loader used by docusaurus' build pipeline; never imported
        // by source.
        'raw-loader',
      ],
    },
  },
  ignoreDependencies: [
    // -- Dependencies used implicitly by the tooling stack --

    // Used by Yarn binaries vendored under `.yarn/`.
    /^@yarnpkg\//u,
    'clipanion',
    'typanion',
    // Implicitly imported by TypeScript via triple-slash references or
    // ambient module declarations.
    /^@types\//u,
    // CLI tools we invoke as binaries via shell wrappers or root scripts;
    // knip can't always trace shell invocations or `yarn <bin>` shims.
    '@lavamoat/allow-scripts',
    '@lavamoat/preinstall-always-fail',
    '@metamask/auto-changelog',
    '@metamask/create-release-branch',
    'eslint-interactive',
    'rimraf',
    'simple-git-hooks',
    'ts-node',
    'typedoc',
    // ESLint plugins / configs / parsers loaded by name via the eslint config.
    /^@typescript-eslint\//u,
    /^eslint-config-/u,
    /^eslint-plugin-/u,
    'eslint-import-resolver-typescript',
    'jest-silent-reporter',
    'prettier-plugin-packagejson',
    'typescript-eslint',
    // Jest test environments referenced as strings in jest configs.
    'jest-environment-node',
    'jest-environment-jsdom',
    // Only `client-controller` actually loads `typedoc-plugin-missing-exports`
    // via its `typedoc.json`; the other packages declare it as a devDep but
    // never use it. Cleanup is a per-package follow-up.
    'typedoc-plugin-missing-exports',
    // Pulled in by jest setup files / mocks; many consumer packages list
    // these as devDeps "just in case". Real cleanup is a per-package
    // follow-up.
    '@metamask/providers',
    'webextension-polyfill',
  ],
};

export default config;
