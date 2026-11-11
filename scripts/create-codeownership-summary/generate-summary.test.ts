import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import config from '../../codeowners.ts';
import type { CodeownersConfig } from '../manage-codeowners/types.ts';
import { generateCodeownershipSummary } from './generate-summary.ts';

vi.mock(import('execa'), () => ({ execa: vi.fn() }));

describe('generateCodeownershipSummary', () => {
  it('asks Git for each path changed since the merge base, including both paths of renamed files', async () => {
    mockChangedFilePaths([]);

    await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'feature',
      codeownersConfig: config,
    });

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', '-z', '--no-renames', 'main...feature'],
      { cwd: '/path/to/repository', stripFinalNewline: false },
    );
  });

  it('lists files by the teams whose approval is required, then lists files co-owned by Core Platform', async () => {
    mockChangedFilePaths([
      'packages/example-controller/src/index.ts',
      'packages/example-controller/CHANGELOG.md',
      'packages/shared-controller/package.json',
    ]);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: {
        packages: {
          'example-controller': { teams: ['@MetaMask/team-a'] },
          'shared-controller': {
            teams: ['@MetaMask/team-b', '@MetaMask/team-c'],
          },
        },
        overrides: [],
      },
    });

    expect(summary).toBe(
      [
        '## Codeownership summary',
        '',
        '## 🛑 Files requiring codeowner review',
        '',
        "To merge this PR, you'll need to get approvals from the following owner groups.",
        '**For files with multiple owners, approval from one owner is sufficient.**',
        '',
        '**@MetaMask/team-a** (2 files)',
        '',
        '- `packages/example-controller/CHANGELOG.md`',
        '- `packages/example-controller/src/index.ts`',
        '',
        '**@MetaMask/team-b** _or_ **@MetaMask/team-c** (1 file)',
        '',
        '- `packages/shared-controller/package.json`',
        '',
        '<details><summary><h2>ℹ️ Files co-owned by Core Platform (expand for more)</h2></summary>',
        '',
        '> [!NOTE]',
        '> For convenience in maintaining this repo, the Core Platform team co-owns',
        '> certain files across all packages, such as manifests and changelogs. **It is',
        '> not required to seek approval from Core Platform to change these files. This',
        '> section is purely informational.**',
        '',
        '- `packages/example-controller/CHANGELOG.md`',
        '- `packages/shared-controller/package.json`',
        '</details>',
        '',
      ].join('\n'),
    );
  });

  it('only asks for approvals from the listed owners when no files have multiple owners', async () => {
    mockChangedFilePaths(['a.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        { pattern: '*.ts', owners: ['@MetaMask/team-a'] },
      ]),
    });

    expect(summary).toContain(
      "To merge this PR, you'll need to get approvals from the following owners.\n",
    );
    expect(summary).not.toContain('approval from one owner is sufficient');
  });

  it('omits the section about files co-owned by Core Platform when none changed', async () => {
    mockChangedFilePaths(['packages/accounts-controller/src/index.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: config,
    });

    expect(summary).not.toContain('Files co-owned by Core Platform');
  });

  it("requires approval only from a package's own teams for its changelog and manifest", async () => {
    mockChangedFilePaths([
      'packages/accounts-controller/src/index.ts',
      'packages/accounts-controller/CHANGELOG.md',
      'packages/accounts-controller/package.json',
    ]);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: config,
    });

    expect(summary).toContain('**@MetaMask/accounts-engineers** (3 files)');
    expect(summary).not.toContain(
      '**@MetaMask/accounts-engineers** _or_ **@MetaMask/core-platform**',
    );
  });

  it('lists the changelog and manifest of a package owned by Core Platform as co-owned', async () => {
    mockChangedFilePaths([
      'packages/sample-controllers/CHANGELOG.md',
      'packages/sample-controllers/package.json',
    ]);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: config,
    });

    expect(summary).toContain('**@MetaMask/core-platform** (2 files)');
    expect(summary).toContain(
      '<h2>ℹ️ Files co-owned by Core Platform (expand for more)</h2>',
    );
  });

  it('lets overrides take precedence over package rules', async () => {
    mockChangedFilePaths([
      'packages/eth-json-rpc-middleware/src/methods/index.ts',
    ]);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: config,
    });

    expect(summary).toContain(
      '**@MetaMask/confirmations** _or_ **@MetaMask/core-platform**',
    );
  });

  it('lets initialization rules take precedence over the Wallet package rule', async () => {
    mockChangedFilePaths([
      'packages/wallet/src/initialization/instances/accounts-controller/index.ts',
    ]);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: config,
    });

    expect(summary).toContain('**@MetaMask/accounts-engineers**');
  });

  it('uses only the last matching rule', async () => {
    mockChangedFilePaths(['packages/example/src/index.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        { pattern: '*', owners: ['@MetaMask/core-platform'] },
        {
          pattern: '/packages/example',
          owners: ['@MetaMask/accounts-engineers'],
        },
      ]),
    });

    expect(summary).not.toContain('**@MetaMask/core-platform**');
    expect(summary).toContain('**@MetaMask/accounts-engineers**');
  });

  it('normalizes shared owner sets so each file is listed once', async () => {
    mockChangedFilePaths(['a.ts', 'b.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        {
          pattern: 'a.ts',
          owners: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
        },
        {
          pattern: 'b.ts',
          owners: [
            '@MetaMask/extension-platform',
            '@MetaMask/mobile-platform',
            '@MetaMask/mobile-platform',
          ],
        },
      ]),
    });

    expect(summary).toContain(
      '**@MetaMask/extension-platform** _or_ **@MetaMask/mobile-platform** (2 files)\n\n- `a.ts`\n- `b.ts`\n',
    );
  });

  it('lists full paths in sorted order', async () => {
    mockChangedFilePaths(['z/index.ts', 'a/nested/index.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        { pattern: '*.ts', owners: ['@MetaMask/core-platform'] },
      ]),
    });

    expect(summary).toContain('- `a/nested/index.ts`\n- `z/index.ts`\n');
  });

  it('matches paths case-sensitively', async () => {
    mockChangedFilePaths(['guide.md']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        { pattern: '/Guide.md', owners: ['@MetaMask/core-platform'] },
      ]),
    });

    expect(summary).toBe('');
  });

  it('treats a rule without owners as clearing ownership', async () => {
    mockChangedFilePaths(['src/a.ts']);

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig([
        { pattern: '/src', owners: ['@MetaMask/accounts-engineers'] },
        { pattern: '/src/a.ts', owners: [] },
      ]),
    });

    expect(summary).toBe('');
  });

  it('keeps oversized summaries below the GitHub comment limit with an explicit warning', async () => {
    mockChangedFilePaths(
      Array.from(
        { length: 400 },
        (_value, index) => `group-${index}/${'long-path-'.repeat(15)}.ts`,
      ),
    );

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      codeownersConfig: createConfig(
        Array.from({ length: 400 }, (_value, index) => ({
          pattern: `/group-${index}/`,
          owners: [`@MetaMask/team-${index}`],
        })),
      ),
    });

    expect(summary.length).toBeLessThan(65_536);
    expect(summary).toContain(
      'Remaining file groups omitted because this summary reached the comment size limit. Run `yarn create-codeownership-summary` to see the full summary.',
    );
  });
});

/**
 * Make `git diff --name-only -z` report the given paths as changed.
 *
 * @param filePaths - Repository-relative paths of the changed files.
 */
function mockChangedFilePaths(filePaths: string[]): void {
  // @ts-expect-error: Partial mock.
  vi.mocked(execa).mockResolvedValue({
    stdout: filePaths.map((filePath) => `${filePath}\0`).join(''),
  });
}

/**
 * Build a configuration with only the given rules.
 *
 * @param overrides - Rules in precedence order, with later rules winning.
 * @returns A configuration with no packages.
 */
function createConfig(
  overrides: CodeownersConfig['overrides'],
): CodeownersConfig {
  return { packages: {}, overrides };
}
