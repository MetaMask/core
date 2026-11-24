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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owner groups.

      (Note: For files with multiple owners, approval from one owner is sufficient.)

      <details>
      <summary><strong>@MetaMask/team-a</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>packages/example-controller/CHANGELOG.md</code></li>
      <li><code>packages/example-controller/src/index.ts</code></li>
      </ul>
      </details>

      <details>
      <summary><strong>@MetaMask/team-b <em>or</em> @MetaMask/team-c</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>packages/shared-controller/package.json</code></li>
      <li><code>packages/shared-controller/README.md</code></li>
      </ul>
      </details>

      ---

      ### ℹ️ Files co-owned by \`@MetaMask/core-platform\`

      For convenience in maintaining this repo, this team co-owns the following files and thus may approve changes to them.

      > [!NOTE]
      > You do not need to get approval from \`@MetaMask/core-platform\` to merge this PR.

      <details>
      <summary><em>(Expand to view list of files)</em></summary>
      <ul>
      <li><code>packages/example-controller/CHANGELOG.md</code></li>
      <li><code>packages/shared-controller/package.json</code></li>
      </ul>
      </details>

      ---

      ### ℹ️ Files co-owned by \`@MetaMask/technical-writers\`

      For convenience in maintaining this repo, this team co-owns the following files and thus may approve changes to them.

      > [!NOTE]
      > You do not need to get approval from \`@MetaMask/technical-writers\` to merge this PR.

      <details>
      <summary><em>(Expand to view list of files)</em></summary>
      <ul>
      <li><code>packages/shared-controller/README.md</code></li>
      </ul>
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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>a.ts</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>packages/example-controller/src/index.ts</code></li>
      </ul>
      </details>

    `);
  });

  it('says maintenance owners may approve when they are approval-required owners', async () => {
    mockGitRepository({
      codeowners: outdent`
        /docs @MetaMask/core-platform
        /packages/example-controller/CHANGELOG.md @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform

      `,
      changedFilePaths: [
        'docs/guide.md',
        'packages/example-controller/CHANGELOG.md',
      ],
    });

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
    });

    expect(summary).toContain(
      'For convenience in maintaining this repo, this team co-owns the following files and thus may approve changes to them.',
    );
    expect(summary).not.toContain('> [!NOTE]');
    expect(summary).toContain(
      '### ℹ️ Files co-owned by `@MetaMask/core-platform`',
    );
    expect(summary).toContain(
      '<details>\n<summary><em>(Expand to view list of files)</em></summary>',
    );
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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/core-platform</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>packages/example-controller/CHANGELOG.md</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>a.md</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>a.ts</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/accounts-engineers</strong> (1 file)</summary>
      <br>
      <ul>
      <li><code>packages/example/src/index.ts</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owner groups.

      (Note: For files with multiple owners, approval from one owner is sufficient.)

      <details>
      <summary><strong>@MetaMask/extension-platform <em>or</em> @MetaMask/mobile-platform</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>a.ts</code></li>
      <li><code>b.ts</code></li>
      </ul>
      </details>

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
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/core-platform</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>a/nested/index.ts</code></li>
      <li><code>z/index.ts</code></li>
      </ul>
      </details>

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

  it('lists every file when the summary fits within the maximum length', async () => {
    mockGitRepository({
      codeowners: '/a/ @MetaMask/team-a\n',
      changedFilePaths: ['a/1.ts', 'a/2.ts'],
    });
    const expectedSummary = outdent`
      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>a/1.ts</code></li>
      <li><code>a/2.ts</code></li>
      </ul>
      </details>

    `;

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      maxLength: expectedSummary.length,
    });

    expect(summary).toBe(expectedSummary);
  });

  it('shortens every file list to the same number of files when the summary would exceed the maximum length', async () => {
    mockGitRepository({
      codeowners: outdent`
        /a/ @MetaMask/core-platform @MetaMask/team-a # maintenance-owner: @MetaMask/core-platform
        /b/ @MetaMask/team-b

      `,
      changedFilePaths: [
        ...Array.from(
          { length: 30 },
          (_value, index) => `a/${String(index + 1).padStart(2, '0')}.ts`,
        ),
        'b/index.ts',
      ],
    });
    const expectedSummary = outdent`
      > [!WARNING]
      > This PR seems large! Some changed files needed to be omitted to post the summary below. Run \`yarn create-codeownership-summary\` on this branch to see the full output.

      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (30 files)</summary>
      <br>
      <ul>
      <li>... <em>(30 more files)</em> ...</li>
      </ul>
      </details>

      <details>
      <summary><strong>@MetaMask/team-b</strong> (1 file)</summary>
      <br>
      <ul>
      <li>... <em>(1 more file)</em> ...</li>
      </ul>
      </details>

      ---

      ### ℹ️ Files co-owned by \`@MetaMask/core-platform\`

      For convenience in maintaining this repo, this team co-owns the following files and thus may approve changes to them.

      > [!NOTE]
      > You do not need to get approval from \`@MetaMask/core-platform\` to merge this PR.

      <details>
      <summary><em>(Expand to view list of files)</em></summary>
      <ul>
      <li>... <em>(30 more files)</em> ...</li>
      </ul>
      </details>

    `;

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      maxLength: expectedSummary.length,
    });

    expect(summary).toBe(expectedSummary);
  });

  it('says how many files were left out of a list when it is only one', async () => {
    const longDirectoryPath = `a/${'long-directory-name-'.repeat(12)}`;
    mockGitRepository({
      codeowners: '/a/ @MetaMask/team-a\n',
      changedFilePaths: [
        `${longDirectoryPath}1.ts`,
        `${longDirectoryPath}2.ts`,
      ],
    });
    const expectedSummary = outdent`
      > [!WARNING]
      > This PR seems large! Some changed files needed to be omitted to post the summary below. Run \`yarn create-codeownership-summary\` on this branch to see the full output.

      ### 🛑 Files requiring codeowner review

      To merge this PR, you'll need to get approvals from the following owners.

      <details>
      <summary><strong>@MetaMask/team-a</strong> (2 files)</summary>
      <br>
      <ul>
      <li><code>${longDirectoryPath}1.ts</code></li>
      <li>... <em>(1 more file)</em> ...</li>
      </ul>
      </details>

    `;

    const summary = await generateCodeownershipSummary({
      repositoryDirectoryPath: '/path/to/repository',
      baseRef: 'main',
      headRef: 'HEAD',
      maxLength: expectedSummary.length + 1,
    });

    expect(summary.trimEnd()).toBe(expectedSummary.trimEnd());
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
