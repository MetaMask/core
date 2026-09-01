import { createSandbox } from '@metamask/utils/node';
import execa from 'execa';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TSX_PATH = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(
  ROOT_DIR,
  'packages',
  'platform-api-docs',
  'src',
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

const { withinSandbox } = createSandbox('platform-api-docs/cli');

jest.setTimeout(30_000);

describe('platform-api-docs CLI (functional)', () => {
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

export type FooControllerMessenger = Messenger<'FooController', FooControllerGetAction, never>;
`,
      );

      const result = await runCLI([directoryPath]);

      expect(result.exitCode).toBe(0);
      expect(result.all).toContain('Found 1 messenger item');
      expect(result.all).toContain('Generated docs for 1 namespace');
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

export type BarMessenger = Messenger<'Bar', BarDoAction, never>;
`,
      );

      const result = await runCLI([directoryPath, '--scan-dir', 'app']);

      expect(result.exitCode).toBe(0);
      expect(result.all).toContain('Found 1 messenger item');
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

export type BazMessenger = Messenger<'Baz', BazAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, 'custom-output');
      const result = await runCLI([directoryPath, '--output', outputDir]);

      expect(result.exitCode).toBe(0);

      const docsExist = await fs.promises
        .access(path.join(outputDir, 'docs', 'Baz', 'actions.md'))
        .then(() => true)
        .catch(() => false);
      expect(docsExist).toBe(true);
    });
  });

  it('stamps the project label on the generated index when --project-label is given', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'Qux.ts'),
        `
export type QuxAction = {
  type: 'Qux:run';
  handler: () => void;
};

export type QuxMessenger = Messenger<'Qux', QuxAction, never>;
`,
      );

      const result = await runCLI([directoryPath, '--project-label', 'Test']);

      expect(result.exitCode).toBe(0);
      const indexMd = await fs.promises.readFile(
        path.join(directoryPath, '.platform-api-docs', 'docs', 'index.md'),
        'utf8',
      );
      expect(indexMd).toContain('# Platform API (Test)');
    });
  });

  it('shows help with --help', async () => {
    expect.assertions(2);

    const result = await runCLI(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.all).toContain(
      'Produces documentation for the platform API, the set of actions and events\navailable in clients through the message bus',
    );
  });

  it('exits with error when no scannable directories found', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const result = await runCLI([directoryPath]);

      expect(result.exitCode).not.toBe(0);
      expect(result.all).toContain('No scannable directories found');
    });
  });

  describe('--strategy root-messenger', () => {
    /**
     * Write a project whose root messenger unions live in `app/types.ts`.
     *
     * @param directoryPath - The sandbox root.
     */
    async function writeRootMessengerProject(
      directoryPath: string,
    ): Promise<void> {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'types.ts'),
        `
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};

export type FooControllerStateChangeEvent = {
  type: 'FooController:stateChange';
  payload: [FooState, Patch[]];
};

export type GlobalActions = FooControllerGetStateAction;
export type GlobalEvents = FooControllerStateChangeEvent;
`,
      );
    }

    it('generates docs from the named root messenger unions', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--strategy',
          'root-messenger',
          '--root-actions',
          'app/types.ts#GlobalActions',
          '--root-events',
          'app/types.ts#GlobalEvents',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.all).toContain('Found 2 messenger items total');
        expect(result.all).toContain('Generated docs for 1 namespace');
      });
    });

    it('exits with error when the root type references are missing', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--strategy',
          'root-messenger',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain(
          'requires both --root-actions and --root-events',
        );
      });
    });

    it('exits with error when a root type reference is malformed', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--strategy',
          'root-messenger',
          '--root-actions',
          'app/types.ts',
          '--root-events',
          'app/types.ts#GlobalEvents',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain(
          'Expected a reference of the form "<file>#<TypeName>"',
        );
      });
    });

    it('exits with error when the named type is not declared', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--strategy',
          'root-messenger',
          '--root-actions',
          'app/types.ts#NotDeclared',
          '--root-events',
          'app/types.ts#GlobalEvents',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain('No type alias named "NotDeclared"');
      });
    });

    it('exits with error when --scan-dir is combined with it', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--strategy',
          'root-messenger',
          '--root-actions',
          'app/types.ts#GlobalActions',
          '--root-events',
          'app/types.ts#GlobalEvents',
          '--scan-dir',
          'app',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain(
          '--scan-dir only applies to --strategy scan',
        );
      });
    });

    it('exits with error when root type references are used with --strategy scan', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await writeRootMessengerProject(directoryPath);

        const result = await runCLI([
          directoryPath,
          '--root-actions',
          'app/types.ts#GlobalActions',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain(
          '--root-actions and --root-events only apply to --strategy root-messenger',
        );
      });
    });

    it('rejects an unknown strategy', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        const result = await runCLI([directoryPath, '--strategy', 'telepathy']);

        expect(result.exitCode).not.toBe(0);
        expect(result.all).toContain('Invalid values');
      });
    });
  });
});
