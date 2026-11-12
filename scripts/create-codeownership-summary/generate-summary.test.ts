import { execa } from 'execa';
import { outdent } from 'outdent';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { generateCodeownershipSummary } from './generate-summary.ts';

vi.mock(import('execa'), () => ({ execa: vi.fn() }));

describe('generateCodeownershipSummary', () => {
  it('returns an empty string when no changed files have codeowners', async () => {
    mockGitRepository({
      codeowners: '/packages/example-controller @MetaMask/team-a\n',
      changedFilePaths: ['unowned.txt'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe('');
  });

  it('lists files by the teams whose approval is required, then lists files co-owned by each maintenance owner', async () => {
    mockGitRepository({
      codeowners: outdent`
        /packages/example-controller @MetaMask/team-a
        /packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform
        /packages/shared-controller @MetaMask/team-b @MetaMask/team-c
        /packages/shared-controller/package.json @MetaMask/core-platform @MetaMask/team-b @MetaMask/team-c # maintenance-owner: @MetaMask/core-platform
        /packages/shared-controller/README.md @MetaMask/team-b @MetaMask/team-c @MetaMask/technical-writers # maintenance-owner: @MetaMask/technical-writers

      `,
      changedFilePaths: [
        'packages/example-controller/src/index.ts',
        'packages/example-controller/CHANGELOG.md',
        'packages/shared-controller/package.json',
        'packages/shared-controller/README.md',
      ],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owner groups.
      **For files with multiple owners, approval from one owner is sufficient.**

      **@MetaMask/team-a** (2 files)

      - \`packages/example-controller/CHANGELOG.md\`
      - \`packages/example-controller/src/index.ts\`

      **@MetaMask/team-b** _or_ **@MetaMask/team-c** (2 files)

      - \`packages/shared-controller/package.json\`
      - \`packages/shared-controller/README.md\`

      <details><summary><h2>ℹ️ Files co-owned by <code>@MetaMask/core-platform</code> (expand for more)</h2></summary>

      > [!NOTE]
      > For convenience in maintaining this repo, \`@MetaMask/core-platform\` co-owns
      > the following files. **It is not required to seek approval from
      > \`@MetaMask/core-platform\` to change these files. This section is purely
      > informational.**

      - \`packages/example-controller/CHANGELOG.md\`
      - \`packages/shared-controller/package.json\`
      </details>

      <details><summary><h2>ℹ️ Files co-owned by <code>@MetaMask/technical-writers</code> (expand for more)</h2></summary>

      > [!NOTE]
      > For convenience in maintaining this repo, \`@MetaMask/technical-writers\` co-owns
      > the following files. **It is not required to seek approval from
      > \`@MetaMask/technical-writers\` to change these files. This section is purely
      > informational.**

      - \`packages/shared-controller/README.md\`
      </details>

    `);
  });

  it('only asks for approvals from the listed owners when no files have multiple owners', async () => {
    mockGitRepository({
      codeowners: '*.ts @MetaMask/team-a\n',
      changedFilePaths: ['a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/team-a** (1 file)

      - \`a.ts\`

    `);
  });

  it('omits the section about co-owned files when no changed files have maintenance owners', async () => {
    mockGitRepository({
      codeowners: outdent`
        /packages/example-controller @MetaMask/team-a
        /packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform

      `,
      changedFilePaths: ['packages/example-controller/src/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/team-a** (1 file)

      - \`packages/example-controller/src/index.ts\`

    `);
  });

  it('requires approval from maintenance owners when they are the only owners of a file', async () => {
    mockGitRepository({
      codeowners:
        '/packages/example-controller/CHANGELOG.md @MetaMask/core-platform # maintenance-owner: @MetaMask/core-platform\n',
      changedFilePaths: ['packages/example-controller/CHANGELOG.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/core-platform** (1 file)

      - \`packages/example-controller/CHANGELOG.md\`

    `);
  });

  it("ignores maintenance owners that aren't among a rule's owners", async () => {
    mockGitRepository({
      codeowners:
        'a.md @MetaMask/team-a # maintenance-owner: @MetaMask/maintainers\n',
      changedFilePaths: ['a.md'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/team-a** (1 file)

      - \`a.md\`

    `);
  });

  it('ignores comments and blank lines in CODEOWNERS', async () => {
    mockGitRepository({
      codeowners: outdent`
        # The team that owns TypeScript files

        *.ts @MetaMask/team-a # Not an owner: @MetaMask/team-b

      `,
      changedFilePaths: ['a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/team-a** (1 file)

      - \`a.ts\`

    `);
  });

  it('uses only the last codeowner rule that matches a file', async () => {
    mockGitRepository({
      codeowners: outdent`
        * @MetaMask/core-platform
        /packages/example @MetaMask/accounts-engineers

      `,
      changedFilePaths: ['packages/example/src/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/accounts-engineers** (1 file)

      - \`packages/example/src/index.ts\`

    `);
  });

  it('normalizes shared owner sets so each file is listed once', async () => {
    mockGitRepository({
      codeowners: outdent`
        a.ts @MetaMask/mobile-platform @MetaMask/extension-platform
        b.ts @MetaMask/extension-platform @MetaMask/mobile-platform @MetaMask/mobile-platform

      `,
      changedFilePaths: ['a.ts', 'b.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owner groups.
      **For files with multiple owners, approval from one owner is sufficient.**

      **@MetaMask/extension-platform** _or_ **@MetaMask/mobile-platform** (2 files)

      - \`a.ts\`
      - \`b.ts\`

    `);
  });

  it('lists full paths in sorted order', async () => {
    mockGitRepository({
      codeowners: '*.ts @MetaMask/core-platform\n',
      changedFilePaths: ['z/index.ts', 'a/nested/index.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/core-platform** (2 files)

      - \`a/nested/index.ts\`
      - \`z/index.ts\`

    `);
  });

  it('matches paths case-sensitively', async () => {
    mockGitRepository({
      codeowners: '/Guide.md @MetaMask/core-platform\n',
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
      codeowners: outdent`
        /src @MetaMask/accounts-engineers
        /src/a.ts

      `,
      changedFilePaths: ['src/a.ts'],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe('');
  });

  it('omits the owner groups that would make the summary too long for a GitHub comment, with a warning', async () => {
    mockGitRepository({
      codeowners: outdent`
        /a/ @MetaMask/team-a
        /b/ @MetaMask/team-b

      `,
      changedFilePaths: [
        'a/index.ts',
        ...Array.from({ length: 10_000 }, (_value, index) => `b/${index}.ts`),
      ],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toBe(outdent`
      ## 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      **@MetaMask/team-a** (1 file)

      - \`a/index.ts\`

      > ⚠️ Remaining file groups omitted because this summary reached the comment size limit. Run \`yarn create-codeownership-summary\` to see the full summary.

    `);
  });
});

/**
 * Make Git behave as if `.github/CODEOWNERS` at the base ref `main` had the
 * given contents, and the given paths had changed on `HEAD` since it branched
 * off `main`.
 *
 * Git only responds to the exact commands that `generateCodeownershipSummary`
 * should run in `/path/to/repository`, and any other command throws. That way,
 * every test also checks that the summary lists the files changed since the
 * merge base (including both paths of renamed files), using the ownership
 * rules at the base ref.
 *
 * @param options - The options.
 * @param options.codeowners - The contents of `.github/CODEOWNERS` at `main`.
 * @param options.changedFilePaths - Repository-relative paths of the changed
 * files.
 */
function mockGitRepository({
  codeowners,
  changedFilePaths,
}: {
  codeowners: string;
  changedFilePaths: string[];
}): void {
  // Type assertion: execa is overloaded, and vi.when would otherwise type
  // calls using an overload that doesn't take arguments for the command
  const mockExeca = execa as unknown as Mock<
    (
      file: string,
      args: string[],
      options: Record<string, unknown>,
    ) => Promise<{ stdout: string }>
  >;
  vi.when(mockExeca, { onUnmatched: 'throw' })
    .calledWith('git', ['show', 'main:.github/CODEOWNERS'], {
      cwd: '/path/to/repository',
    })
    .thenResolve({ stdout: codeowners })
    .calledWith(
      'git',
      ['diff', '--name-only', '-z', '--no-renames', 'main...HEAD'],
      { cwd: '/path/to/repository', stripFinalNewline: false },
    )
    .thenResolve({
      stdout: changedFilePaths.map((filePath) => `${filePath}\0`).join(''),
    });
}
