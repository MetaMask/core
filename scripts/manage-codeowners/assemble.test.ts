import { describe, expect, it } from 'vitest';

import { assembleCodeownersSections } from './assemble.ts';
import type { CodeownersConfig } from './types.ts';

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
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
              },
              {
                pattern: '/packages/alpha/CHANGELOG.md',
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/alpha/package.json',
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/alpha/tsconfig.*',
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/alpha/typedoc.json',
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/alpha/vitest.config.*',
                primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
            ],
          },
          {
            title: 'zebra',
            rules: [
              {
                pattern: '/packages/zebra',
                primaryOwners: ['@MetaMask/z-team'],
              },
              {
                pattern: '/packages/zebra/CHANGELOG.md',
                primaryOwners: ['@MetaMask/z-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/zebra/package.json',
                primaryOwners: ['@MetaMask/z-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/zebra/tsconfig.*',
                primaryOwners: ['@MetaMask/z-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/zebra/typedoc.json',
                primaryOwners: ['@MetaMask/z-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/zebra/vitest.config.*',
                primaryOwners: ['@MetaMask/z-team'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
            ],
          },
        ],
      },
      {
        title: 'Overrides',
        rules: [],
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
          primaryOwners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/CHANGELOG.md',
          primaryOwners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/package.json',
          primaryOwners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/tsconfig.*',
          primaryOwners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/typedoc.json',
          primaryOwners: ['@MetaMask/core-platform'],
        },
        {
          pattern: '/packages/platform-package/vitest.config.*',
          primaryOwners: ['@MetaMask/core-platform'],
        },
      ],
    });
  });

  it("makes Core Platform a maintenance owner of the files it co-owns in other teams' packages", () => {
    const config: CodeownersConfig = {
      packages: {
        'example-controller': {
          teams: ['@MetaMask/b-team', '@MetaMask/a-team'],
        },
      },
      overrides: [],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections[0]?.subsections?.[0]?.rules).toStrictEqual([
      {
        pattern: '/packages/example-controller',
        primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
      },
      ...[
        'CHANGELOG.md',
        'package.json',
        'tsconfig.*',
        'typedoc.json',
        'vitest.config.*',
      ].map((fileName) => ({
        pattern: `/packages/example-controller/${fileName}`,
        primaryOwners: ['@MetaMask/a-team', '@MetaMask/b-team'],
        maintenanceOwners: ['@MetaMask/core-platform'],
      })),
    ]);
  });

  it('does not make Core Platform a maintenance owner of files in packages it owns', () => {
    const config: CodeownersConfig = {
      packages: {
        'shared-controller': {
          teams: ['@MetaMask/core-platform', '@MetaMask/a-team'],
        },
      },
      overrides: [],
    };

    const sections = assembleCodeownersSections(config);

    expect(
      sections[0]?.subsections?.[0]?.rules.map(
        ({ maintenanceOwners }) => maintenanceOwners,
      ),
    ).toStrictEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('appends overrides after Packages', () => {
    const config: CodeownersConfig = {
      packages: {},
      overrides: [
        {
          pattern: '/packages/zebra/specific',
          primaryOwners: ['@MetaMask/team'],
        },
      ],
    };

    const sections = assembleCodeownersSections(config);

    expect(sections).toStrictEqual([
      { title: 'Packages', rules: [], subsections: [] },
      { title: 'Overrides', rules: config.overrides },
    ]);
  });

  it('emits initialization rules in the wallet package section', () => {
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
          primaryOwners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
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
                primaryOwners: ['@MetaMask/accounts-engineers'],
              },
              {
                pattern: '/packages/accounts-controller/CHANGELOG.md',
                primaryOwners: ['@MetaMask/accounts-engineers'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/accounts-controller/package.json',
                primaryOwners: ['@MetaMask/accounts-engineers'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/accounts-controller/tsconfig.*',
                primaryOwners: ['@MetaMask/accounts-engineers'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/accounts-controller/typedoc.json',
                primaryOwners: ['@MetaMask/accounts-engineers'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/accounts-controller/vitest.config.*',
                primaryOwners: ['@MetaMask/accounts-engineers'],
                maintenanceOwners: ['@MetaMask/core-platform'],
              },
            ],
          },
          {
            title: 'wallet',
            rules: [
              {
                pattern: '/packages/wallet',
                primaryOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern:
                  '/packages/wallet/src/initialization/instances/accounts-controller/',
                primaryOwners: ['@MetaMask/accounts-engineers'],
              },
              {
                pattern: '/packages/wallet/CHANGELOG.md',
                primaryOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/package.json',
                primaryOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/tsconfig.*',
                primaryOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/typedoc.json',
                primaryOwners: ['@MetaMask/core-platform'],
              },
              {
                pattern: '/packages/wallet/vitest.config.*',
                primaryOwners: ['@MetaMask/core-platform'],
              },
            ],
          },
        ],
      },
      {
        title: 'Overrides',
        rules: [
          {
            pattern: '/packages/eth-json-rpc-middleware/src/methods',
            primaryOwners: [
              '@MetaMask/confirmations',
              '@MetaMask/core-platform',
            ],
          },
        ],
      },
    ]);
  });
});
