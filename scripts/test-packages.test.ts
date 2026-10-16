import type { Result } from 'execa';
import { execa } from 'execa';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./test-packages.ts', import.meta.url));

describe('package test runner', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'core-test-packages-'));
    await mkdir(path.join(directory, 'bin'));
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] }),
    );
    await writeFile(
      path.join(directory, 'bin/yarn'),
      `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync('commands.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv.includes(process.env.TEST_FAIL_SCRIPT)) process.exit(2);
`,
      { mode: 0o755 },
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  /**
   * Adds a workspace to the temporary repository.
   *
   * @param name - The unscoped workspace name.
   * @param typeTests - Whether the workspace has a separate type test suite.
   */
  async function addWorkspace(name: string, typeTests = false): Promise<void> {
    const location = path.join(directory, 'packages', name);
    await mkdir(location, { recursive: true });
    await writeFile(
      path.join(location, 'package.json'),
      JSON.stringify({
        name: `@metamask/${name}`,
        scripts: {
          test: 'unit-tests',
          ...(typeTests ? { 'test:types': 'type-tests' } : {}),
        },
      }),
    );
  }

  /**
   * Runs the real dispatcher with a recording Yarn executable.
   *
   * @param env - Additional environment variables for the child process.
   * @returns The child process result.
   */
  async function run(env: Record<string, string> = {}): Promise<Result> {
    return execa(process.execPath, [script], {
      cwd: directory,
      reject: false,
      env: {
        PATH: `${path.join(directory, 'bin')}${path.delimiter}${process.env.PATH}`,
        ...env,
      },
    });
  }

  /**
   * Reads the commands executed by the dispatcher.
   *
   * @returns Yarn argument lists in execution order.
   */
  async function readCommands(): Promise<string[][]> {
    return (await readFile(path.join(directory, 'commands.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
  }

  it('keeps Jest package tests and runs migrated type tests before one Vitest invocation', async () => {
    await addWorkspace('base-controller');
    await addWorkspace('utils', true);
    await addWorkspace('first-vitest', true);
    await addWorkspace('second-vitest');

    expect((await run()).exitCode).toBe(0);

    expect(await readCommands()).toStrictEqual([
      [
        'workspaces',
        'foreach',
        '--all',
        '--parallel',
        '--verbose',
        '--include',
        '@metamask/base-controller',
        '--include',
        '@metamask/utils',
        'run',
        'test',
        '--coverage=false',
      ],
      [
        'workspaces',
        'foreach',
        '--all',
        '--parallel',
        '--verbose',
        '--include',
        '@metamask/first-vitest',
        'run',
        'test:types',
      ],
      ['test:vitest'],
    ]);
  });

  it('skips Vitest when every workspace still uses Jest', async () => {
    await addWorkspace('base-controller');

    expect((await run()).exitCode).toBe(0);

    const commands = await readCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('@metamask/base-controller');
    expect(commands[0]).toContain('test');
  });

  it('runs only one Vitest invocation when no Jest or type suites remain', async () => {
    await addWorkspace('first-vitest');
    await addWorkspace('second-vitest');

    expect((await run()).exitCode).toBe(0);
    expect(await readCommands()).toStrictEqual([['test:vitest']]);
  });

  it.each([
    { failedScript: 'test', commandCount: 1 },
    { failedScript: 'test:types', commandCount: 2 },
    { failedScript: 'test:vitest', commandCount: 3 },
  ])(
    'stops after a failing $failedScript command',
    async ({ failedScript, commandCount }) => {
      await addWorkspace('base-controller');
      await addWorkspace('first-vitest', true);

      expect((await run({ TEST_FAIL_SCRIPT: failedScript })).exitCode).not.toBe(
        0,
      );

      const commands = await readCommands();
      expect(commands).toHaveLength(commandCount);
      expect(commands.at(-1)).toContain(failedScript);
    },
  );
});
