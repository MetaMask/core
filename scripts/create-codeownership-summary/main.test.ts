import { createSandbox } from '@metamask/node-utils';
import { execa } from 'execa';
import { outdent } from 'outdent';
import { describe, expect, it } from 'vitest';

import { main } from './main.ts';
import {
  commitFiles,
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

  it('prints the summary of the current branch compared with main by default', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, {
        'README.md': 'Base\n',
        '.github/CODEOWNERS': outdent`
          /packages/accounts-controller @MetaMask/accounts-engineers
          /packages/accounts-controller/CHANGELOG.md @MetaMask/accounts-engineers @MetaMask/core-platform # maintenance-owner: @MetaMask/core-platform
          /packages/sample-controllers @MetaMask/core-platform
          /packages/sample-controllers/package.json @MetaMask/core-platform

        `,
      });
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

      expect(output.stdout).toBe(outdent`
        ## 🛑 Files requiring codeowner review

        To merge this PR, you'll need to get approvals from the following owners.

        <details>
        <summary><strong>@MetaMask/accounts-engineers</strong> (2 files)</summary>

        - \`packages/accounts-controller/CHANGELOG.md\`
        - \`packages/accounts-controller/src/index.ts\`
        </details>

        <details>
        <summary><strong>@MetaMask/core-platform</strong> (1 file)</summary>

        - \`packages/sample-controllers/package.json\`
        </details>

        <details><summary><h2>ℹ️ Files co-owned by <code>@MetaMask/core-platform</code> (expand for more)</h2></summary>

        > [!NOTE]
        > For convenience in maintaining this repo, \`@MetaMask/core-platform\` co-owns
        > the following files. **It is not required to seek approval from
        > \`@MetaMask/core-platform\` to change these files. This section is purely
        > informational.**

        - \`packages/accounts-controller/CHANGELOG.md\`
        </details>

      `);
    });
  });

  it('uses HEAD for --head-ref by default', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, {
        'README.md': 'Base\n',
        '.github/CODEOWNERS':
          '/packages/accounts-controller @MetaMask/accounts-engineers\n',
      });
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

      expect(output.stdout).toBe(outdent`
        ## 🛑 Files requiring codeowner review

        To merge this PR, you'll need to get approvals from the following owners.

        <details>
        <summary><strong>@MetaMask/accounts-engineers</strong> (1 file)</summary>

        - \`packages/accounts-controller/src/index.ts\`
        </details>

      `);
    });
  });

  it('accepts --base-ref and --head-ref', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, {
        'README.md': 'Base\n',
        '.github/CODEOWNERS':
          '/packages/accounts-controller @MetaMask/accounts-engineers\n',
      });
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

      expect(output.stdout).toBe(outdent`
        ## 🛑 Files requiring codeowner review

        To merge this PR, you'll need to get approvals from the following owners.

        <details>
        <summary><strong>@MetaMask/accounts-engineers</strong> (1 file)</summary>

        - \`packages/accounts-controller/src/index.ts\`
        </details>

      `);
    });
  });

  it('prints nothing to stdout and explains on stderr when no changed files have codeowners', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await initializeRepository(directoryPath);
      await commitFiles(directoryPath, {
        'README.md': 'Base\n',
        '.github/CODEOWNERS':
          '/packages/accounts-controller @MetaMask/accounts-engineers\n',
      });
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
      expect(output.stderr).toBe('No changed files have codeowners.\n');
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
