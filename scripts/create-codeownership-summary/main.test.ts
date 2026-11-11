import { createSandbox } from '@metamask/node-utils';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { main } from './main.ts';
import {
  commitFiles,
  commitStagedChanges,
  createBranch,
  initializeRepository,
} from './test-helpers.ts';

const { withinSandbox } = createSandbox('create-codeownership-summary-main');

describe('main', () => {
  it('prints usage to the given output stream for --help', async () => {
    const { stdout, stderr, output } = createStreams();

    await main({
      argv: ['node', 'create-codeownership-summary.ts', '--help'],
      stdout,
      stderr,
      cwd: process.cwd(),
    });

    expect(output.stdout).toContain('--base-ref');
    expect(output.stderr).toBe('');
  });

  it('rejects unknown options and prints usage to the error stream', async () => {
    const { stdout, stderr, output } = createStreams();

    const promiseForRunning = main({
      argv: ['node', 'create-codeownership-summary.ts', '--nope'],
      stdout,
      stderr,
      cwd: process.cwd(),
    });

    await expect(promiseForRunning).rejects.toThrow('Unknown argument: nope');
    expect(output.stderr).toContain('--base-ref');
    expect(output.stdout).toBe('');
  });

  it('prints the summary for HEAD compared with the given base ref', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/index.ts': 'export {};\n',
      });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: ['node', 'create-codeownership-summary.ts', '--base-ref', 'main'],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toContain(
        '**@MetaMask/accounts-engineers** (1 file)',
      );
    });
  });

  it('prints the summary of the current branch compared with main by default', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/index.ts': 'export {};\n',
        'packages/accounts-controller/CHANGELOG.md': '# Changelog\n',
        'packages/sample-controllers/package.json': '{}\n',
      });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: ['node', 'create-codeownership-summary.ts'],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toBe(
        [
          '## Codeownership summary',
          '',
          '## 🛑 Files requiring codeowner review',
          '',
          "To merge this PR, you'll need to get approvals from the following owners.",
          '',
          '**@MetaMask/accounts-engineers** (2 files)',
          '',
          '- `packages/accounts-controller/CHANGELOG.md`',
          '- `packages/accounts-controller/src/index.ts`',
          '',
          '**@MetaMask/core-platform** (1 file)',
          '',
          '- `packages/sample-controllers/package.json`',
          '',
          '<details><summary><h2>ℹ️ Files co-owned by Core Platform (expand for more)</h2></summary>',
          '',
          '> [!NOTE]',
          '> For convenience in maintaining this repo, the Core Platform team co-owns',
          '> certain files across all packages, such as manifests and changelogs. **It is',
          '> not required to seek approval from Core Platform to change these files. This',
          '> section is purely informational.**',
          '',
          '- `packages/accounts-controller/CHANGELOG.md`',
          '- `packages/sample-controllers/package.json`',
          '</details>',
          '',
        ].join('\n'),
      );
    });
  });

  it('compares the given head ref instead of HEAD', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/index.ts': 'export {};\n',
      });
      await execa('git', ['checkout', 'main'], { cwd: directoryPath });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: [
          'node',
          'create-codeownership-summary.ts',
          '--base-ref',
          'main',
          '--head-ref',
          'feature',
        ],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toContain(
        'packages/accounts-controller/src/index.ts',
      );
    });
  });

  it('includes only changes made on the head ref since it branched off', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/feature.ts': 'export {};\n',
      });
      await execa('git', ['checkout', 'main'], { cwd: directoryPath });
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/main-only.ts': 'export {};\n',
      });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: [
          'node',
          'create-codeownership-summary.ts',
          '--head-ref',
          'feature',
        ],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toContain(
        '- `packages/accounts-controller/src/feature.ts`',
      );
      expect(output.stdout).not.toContain('main-only.ts');
    });
  });

  it('lists both the old and new paths of a renamed file', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, {
        'packages/accounts-controller/src/old.ts': 'export {};\n',
      });
      await createBranch(directoryPath, 'feature');
      await execa(
        'git',
        [
          'mv',
          'packages/accounts-controller/src/old.ts',
          'packages/accounts-controller/src/new.ts',
        ],
        { cwd: directoryPath },
      );
      await commitStagedChanges(directoryPath);
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: ['node', 'create-codeownership-summary.ts'],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toContain(
        '- `packages/accounts-controller/src/new.ts`\n- `packages/accounts-controller/src/old.ts`\n',
      );
    });
  });

  it('prints nothing to stdout when no changed files have codeowners', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, { 'unowned.txt': 'Text\n' });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: ['node', 'create-codeownership-summary.ts', '--base-ref', 'main'],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stdout).toBe('');
    });
  });

  it('explains on stderr when no changed files have codeowners', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, { 'README.md': 'Base\n' });
      await createBranch(directoryPath, 'feature');
      await commitFiles(directoryPath, { 'unowned.txt': 'Text\n' });
      const { stdout, stderr, output } = createStreams();

      await main({
        argv: ['node', 'create-codeownership-summary.ts', '--base-ref', 'main'],
        stdout,
        stderr,
        cwd: directoryPath,
      });

      expect(output.stderr).toContain('No changed files have codeowners.');
    });
  });
});

/**
 * Create output streams that remember what was written to them.
 *
 * @returns The streams and the text written to each.
 */
function createStreams(): {
  stdout: { write: (text: string) => boolean };
  stderr: { write: (text: string) => boolean };
  output: { stdout: string; stderr: string };
} {
  const output = { stdout: '', stderr: '' };
  return {
    stdout: {
      write: (text) => {
        output.stdout += text;
        return true;
      },
    },
    stderr: {
      write: (text) => {
        output.stderr += text;
        return true;
      },
    },
    output,
  };
}
