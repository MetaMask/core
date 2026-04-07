import { createSandbox } from '@metamask/utils/node';
import execa from 'execa';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const TSX_PATH = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(
  ROOT_DIR,
  'packages',
  'messenger-cli',
  'src',
  'docs',
  'cli.ts',
);

/**
 * Runs the docs CLI with the given arguments.
 *
 * @param args - The CLI arguments.
 * @returns The execa result.
 */
async function runCLI(args: string[]): Promise<execa.ExecaReturnValue> {
  return await execa(TSX_PATH, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    reject: false,
    all: true,
  });
}

const { withinSandbox } = createSandbox('messenger-cli/docs-cli');

jest.setTimeout(30_000);

describe('messenger-docs CLI (functional)', () => {
  it('generates docs for a project with action types', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'FooController.ts'),
        `
export type FooControllerGetAction = {
  type: 'FooController:get';
  handler: () => string;
};
`,
      );

      const result = await runCLI([directoryPath]);

      expect(result.exitCode).toBe(0);
      expect(result.all).toContain('Found 1 messenger items');
      expect(result.all).toContain('Generated docs for 1 namespaces');
    });
  });

  it('accepts --scan-dir flag', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'Bar.ts'),
        `
export type BarDoAction = {
  type: 'Bar:do';
  handler: () => void;
};
`,
      );

      const result = await runCLI([
        directoryPath,
        '--scan-dir',
        'app',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.all).toContain('Found 1 messenger items');
    });
  });

  it('accepts --output flag', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'Baz.ts'),
        `
export type BazAction = {
  type: 'Baz:get';
  handler: () => number;
};
`,
      );

      const outputDir = path.join(directoryPath, 'custom-output');
      const result = await runCLI([
        directoryPath,
        '--output',
        outputDir,
      ]);

      expect(result.exitCode).toBe(0);

      const docsExist = await fs.promises
        .access(path.join(outputDir, 'docs', 'Baz', 'actions.md'))
        .then(() => true)
        .catch(() => false);
      expect(docsExist).toBe(true);
    });
  });

  it('reads scanDirs from package.json messenger-docs config', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'Qux.ts'),
        `
export type QuxAction = {
  type: 'Qux:run';
  handler: () => void;
};
`,
      );
      await fs.promises.writeFile(
        path.join(directoryPath, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          'messenger-docs': { scanDirs: ['app'] },
        }),
      );

      const result = await runCLI([directoryPath]);

      expect(result.exitCode).toBe(0);
      expect(result.all).toContain('Found 1 messenger items');
    });
  });

  it('shows help with --help', async () => {
    expect.assertions(2);

    const result = await runCLI(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.all).toContain('Generate Messenger API documentation');
  });

  it('exits with error when no scannable directories found', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const result = await runCLI([directoryPath]);

      expect(result.exitCode).not.toBe(0);
      expect(result.all).toContain('No scannable directories found');
    });
  });
});
