import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { generateCodeownershipSummary } from './generate-summary.ts';

vi.mock(import('execa'), () => ({ execa: vi.fn() }));

describe('generateCodeownershipSummary', () => {
  it('asks Git for each path changed since the merge base, including both paths of renamed files', async () => {
    mockGitRepository({
      filesAtBaseRef: { '.github/CODEOWNERS': '* @MetaMask/team-a\n' },
      changedFilePaths: [],
    });

    await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'feature',
    });

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', '-z', '--no-renames', 'main...feature'],
      { cwd: '/path/to/repository', stripFinalNewline: false },
    );
  });

  it('uses the ownership rules in the CODEOWNERS file at the base ref', async () => {
    mockGitRepository({
      filesAtBaseRef: { '.github/CODEOWNERS': '*.ts @MetaMask/team-a\n' },
      changedFilePaths: ['a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'main:.github/CODEOWNERS'],
      { cwd: '/path/to/repository' },
    );
    expect(summary).toContain('**@MetaMask/team-a** (1 file)');
  });

  it('throws if the base ref has no .github/CODEOWNERS, even if it has a CODEOWNERS file elsewhere', async () => {
    mockGitRepository({
      filesAtBaseRef: { CODEOWNERS: '*.ts @MetaMask/team-a\n' },
      changedFilePaths: ['a.ts'],
    });

    const promiseForGenerating = generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    await expect(promiseForGenerating).rejects.toThrow(
      "fatal: path '.github/CODEOWNERS' does not exist in 'main'",
    );
  });

  it('lists files by the teams whose approval is required, then lists files co-owned by maintenance owners', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          '/packages/example-controller @MetaMask/team-a',
          '/packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform',
          '/packages/shared-controller @MetaMask/team-b @MetaMask/team-c',
          '/packages/shared-controller/package.json @MetaMask/core-platform @MetaMask/team-b @MetaMask/team-c # maintenance-owner: @MetaMask/core-platform',
          '',
        ].join('\n'),
      },
      changedFilePaths: [
        'packages/example-controller/src/index.ts',
        'packages/example-controller/CHANGELOG.md',
        'packages/shared-controller/package.json',
      ],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(
      [
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
        '<details><summary><h2>ℹ️ Files co-owned by <code>@MetaMask/core-platform</code> (expand for more)</h2></summary>',
        '',
        '> [!NOTE]',
        '> For convenience in maintaining this repo, `@MetaMask/core-platform` co-owns',
        '> the following files. **It is not required to seek approval from',
        '> `@MetaMask/core-platform` to change these files. This section is purely',
        '> informational.**',
        '',
        '- `packages/example-controller/CHANGELOG.md`',
        '- `packages/shared-controller/package.json`',
        '</details>',
        '',
      ].join('\n'),
    );
  });

  it('only asks for approvals from the listed owners when no files have multiple owners', async () => {
    mockGitRepository({
      filesAtBaseRef: { '.github/CODEOWNERS': '*.ts @MetaMask/team-a\n' },
      changedFilePaths: ['a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain(
      "To merge this PR, you'll need to get approvals from the following owners.\n",
    );
    expect(summary).not.toContain('approval from one owner is sufficient');
  });

  it('omits the section about co-owned files when no changed files have maintenance owners', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          '/packages/example-controller @MetaMask/team-a',
          '/packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['packages/example-controller/src/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).not.toContain('Files co-owned by');
  });

  it("requires approval only from a file's other owners when it has a maintenance owner", async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS':
          '/packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform\n',
      },
      changedFilePaths: ['packages/example-controller/CHANGELOG.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain('**@MetaMask/team-a** (1 file)');
    expect(summary).not.toContain('**@MetaMask/core-platform**');
  });

  it('requires approval from maintenance owners when they are the only owners of a file', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS':
          '/packages/example-controller/CHANGELOG.md @MetaMask/core-platform # maintenance-owner: @MetaMask/core-platform\n',
      },
      changedFilePaths: ['packages/example-controller/CHANGELOG.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain('**@MetaMask/core-platform** (1 file)');
    expect(summary).not.toContain('Files co-owned by');
  });

  it("ignores maintenance owners that aren't among a rule's owners", async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS':
          'a.md @MetaMask/team-a # maintenance-owner: @MetaMask/maintainers\n',
      },
      changedFilePaths: ['a.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain('**@MetaMask/team-a** (1 file)');
    expect(summary).not.toContain('maintainers');
  });

  it('lists the files co-owned by each maintenance owner separately', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          'a.md @MetaMask/team-a @MetaMask/maintainers-1 # maintenance-owner: @MetaMask/maintainers-1',
          'b.md @MetaMask/team-a @MetaMask/maintainers-2 # maintenance-owner: @MetaMask/maintainers-2',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['a.md', 'b.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain(
      '<h2>ℹ️ Files co-owned by <code>@MetaMask/maintainers-1</code> (expand for more)</h2>',
    );
    expect(summary).toContain(
      '<h2>ℹ️ Files co-owned by <code>@MetaMask/maintainers-2</code> (expand for more)</h2>',
    );
  });

  it('ignores comments and blank lines in CODEOWNERS', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          '# The team that owns TypeScript files',
          '',
          '*.ts @MetaMask/team-a # Not an owner: @MetaMask/team-b',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain('**@MetaMask/team-a** (1 file)');
    expect(summary).not.toContain('team-b');
  });

  it('uses only the last matching rule', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          '* @MetaMask/core-platform',
          '/packages/example @MetaMask/accounts-engineers',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['packages/example/src/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).not.toContain('**@MetaMask/core-platform**');
    expect(summary).toContain('**@MetaMask/accounts-engineers**');
  });

  it('normalizes shared owner sets so each file is listed once', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          'a.ts @MetaMask/mobile-platform @MetaMask/extension-platform',
          'b.ts @MetaMask/extension-platform @MetaMask/mobile-platform @MetaMask/mobile-platform',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['a.ts', 'b.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain(
      '**@MetaMask/extension-platform** _or_ **@MetaMask/mobile-platform** (2 files)\n\n- `a.ts`\n- `b.ts`\n',
    );
  });

  it('lists full paths in sorted order', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': '*.ts @MetaMask/core-platform\n',
      },
      changedFilePaths: ['z/index.ts', 'a/nested/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain('- `a/nested/index.ts`\n- `z/index.ts`\n');
  });

  it('matches paths case-sensitively', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': '/Guide.md @MetaMask/core-platform\n',
      },
      changedFilePaths: ['guide.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe('');
  });

  it('treats a rule without owners as clearing ownership', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': [
          '/src @MetaMask/accounts-engineers',
          '/src/a.ts',
          '',
        ].join('\n'),
      },
      changedFilePaths: ['src/a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe('');
  });

  it('keeps oversized summaries below the GitHub comment limit with an explicit warning', async () => {
    mockGitRepository({
      filesAtBaseRef: {
        '.github/CODEOWNERS': Array.from(
          { length: 400 },
          (_value, index) => `/group-${index}/ @MetaMask/team-${index}\n`,
        ).join(''),
      },
      changedFilePaths: Array.from(
        { length: 400 },
        (_value, index) => `group-${index}/${'long-path-'.repeat(15)}.ts`,
      ),
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary.length).toBeLessThan(65_536);
    expect(summary).toContain('## 🛑 Files requiring codeowner review');
    expect(summary).toContain('**@MetaMask/team-0** (1 file)');
    expect(summary).toContain(
      'Remaining file groups omitted because this summary reached the comment size limit. Run `yarn create-codeownership-summary` to see the full summary.',
    );
  });
});

/**
 * Make Git behave as if the base ref `main` contained the given files and the
 * given paths had changed since the merge base.
 *
 * @param options - The options.
 * @param options.filesAtBaseRef - File contents at `main`, keyed by
 * repository-relative path. Asking Git for any other file at `main` fails.
 * @param options.changedFilePaths - Repository-relative paths of the changed
 * files.
 */
function mockGitRepository({
  filesAtBaseRef,
  changedFilePaths,
}: {
  filesAtBaseRef: Record<string, string>;
  changedFilePaths: string[];
}): void {
  vi.mocked(execa)
    // @ts-expect-error: Partial mock.
    .mockImplementation(async (command: string, args: string[]) => {
      if (args[0] === 'diff') {
        return {
          stdout: changedFilePaths.map((filePath) => `${filePath}\0`).join(''),
        };
      }

      const filePath = args[1]?.replace(/^main:/u, '');
      if (args[0] === 'show' && filePath !== undefined) {
        const content = filesAtBaseRef[filePath];
        if (content !== undefined) {
          return { stdout: content };
        }
        throw new Error(`fatal: path '${filePath}' does not exist in 'main'`);
      }

      throw new Error(`Unexpected execa call: ${command} ${args.join(' ')}`);
    });
}
