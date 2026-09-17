import { assembleCodeownersSections } from './assemble.js';
import type { CodeownersConfig } from './types.js';

describe('assembleCodeownersSections', () => {
  it('groups all package rules in one alphabetized Packages section', () => {
    const config: CodeownersConfig = {
      packages: {
        zebra: { teams: ['@MetaMask/z-team'] },
        alpha: {
          teams: ['@MetaMask/b-team', '@MetaMask/a-team'],
          initializationPath: 'alpha',
        },
      },
      overrides: [],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections).toStrictEqual([
      {
        title: 'Packages',
        rules: [],
        subsections: [
          {
            title: 'alpha',
            rules: [
              {
                pattern: '/packages/alpha',
                owners: ['@MetaMask/a-team', '@MetaMask/b-team'],
              },
              {
                pattern: '/packages/alpha/CHANGELOG.md',
                owners: [
                  '@MetaMask/a-team',
                  '@MetaMask/b-team',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/alpha/package.json',
                owners: [
                  '@MetaMask/a-team',
                  '@MetaMask/b-team',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/alpha/tsconfig.*',
                owners: [
                  '@MetaMask/a-team',
                  '@MetaMask/b-team',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/alpha/typedoc.json',
                owners: [
                  '@MetaMask/a-team',
                  '@MetaMask/b-team',
                  '@MetaMask/core-platform',
                ],
              },
            ],
          },
          {
            title: 'zebra',
            rules: [
              {
                pattern: '/packages/zebra',
                owners: ['@MetaMask/z-team'],
              },
              {
                pattern: '/packages/zebra/CHANGELOG.md',
                owners: ['@MetaMask/core-platform', '@MetaMask/z-team'],
              },
              {
                pattern: '/packages/zebra/package.json',
                owners: ['@MetaMask/core-platform', '@MetaMask/z-team'],
              },
              {
                pattern: '/packages/zebra/tsconfig.*',
                owners: ['@MetaMask/core-platform', '@MetaMask/z-team'],
              },
              {
                pattern: '/packages/zebra/typedoc.json',
                owners: ['@MetaMask/core-platform', '@MetaMask/z-team'],
              },
            ],
          },
        ],
      },
      {
        title: 'Overrides',
        rules: [
          {
            pattern: '/packages/wallet/src/initialization/instances/alpha/',
            owners: ['@MetaMask/a-team', '@MetaMask/b-team'],
          },
        ],
      },
    ]);
  });

  it('does not list the Core Platform team twice when it already owns a package', () => {
    const config: CodeownersConfig = {
      packages: {
        'platform-package': { teams: ['@MetaMask/core-platform'] },
      },
      overrides: [],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections[0]?.subsections?.[0]).toStrictEqual({
      title: 'platform-package',
      rules: [
        {
          pattern: '/packages/platform-package',
          owners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/CHANGELOG.md',
          owners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/package.json',
          owners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/tsconfig.*',
          owners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/typedoc.json',
          owners: ['@MetaMask/core-platform'],
        },
      ],
    });
  });

  it('appends overrides after Packages', () => {
    const config: CodeownersConfig = {
      packages: {},
      overrides: [
        {
          pattern: '/packages/zebra/specific',
          owners: ['@MetaMask/team'],
        },
      ],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections).toStrictEqual([
      { title: 'Packages', rules: [], subsections: [] },
      { title: 'Overrides', rules: config.overrides },
    ]);
  });

  it('emits initialization rules after the wallet package rule', () => {
    const config: CodeownersConfig = {
      packages: {
        'accounts-controller': {
          teams: ['@MetaMask/accounts-engineers'],
          initializationPath: 'accounts-controller',
        },
        wallet: { teams: ['@MetaMask/core-platform'] },
      },
      overrides: [
        {
          pattern: '/packages/eth-json-rpc-middleware/src/methods',
          owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
        },
      ],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections).toStrictEqual([
      {
        title: 'Packages',
        rules: [],
        subsections: [
          {
            title: 'accounts-controller',
            rules: [
              {
                pattern: '/packages/accounts-controller',
                owners: ['@MetaMask/accounts-engineers'],
              },
              {
                pattern: '/packages/accounts-controller/CHANGELOG.md',
                owners: [
                  '@MetaMask/accounts-engineers',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/accounts-controller/package.json',
                owners: [
                  '@MetaMask/accounts-engineers',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/accounts-controller/tsconfig.*',
                owners: [
                  '@MetaMask/accounts-engineers',
                  '@MetaMask/core-platform',
                ],
              },
              {
                pattern: '/packages/accounts-controller/typedoc.json',
                owners: [
                  '@MetaMask/accounts-engineers',
                  '@MetaMask/core-platform',
                ],
              },
            ],
          },
          {
            title: 'wallet',
            rules: [
              {
                pattern: '/packages/wallet',
                owners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/CHANGELOG.md',
                owners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/package.json',
                owners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/tsconfig.*',
                owners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/typedoc.json',
                owners: ['@MetaMask/core-platform'],
              },
            ],
          },
        ],
      },
      {
        title: 'Overrides',
        rules: [
          {
            pattern:
              '/packages/wallet/src/initialization/instances/accounts-controller/',
            owners: ['@MetaMask/accounts-engineers'],
          },
          {
            pattern: '/packages/eth-json-rpc-middleware/src/methods',
            owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
          },
        ],
      },
    ]);
  });
});
