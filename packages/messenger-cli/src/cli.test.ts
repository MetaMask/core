import { createSandbox } from '@metamask/utils/node';
import execa from 'execa';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TSX_PATH = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(
  ROOT_DIR,
  'packages',
  'messenger-cli',
  'src',
  'cli.ts',
);

/**
 * Runs the CLI with the given arguments.
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

/**
 * Recursively lists generated `-method-action-types.ts` files in a directory.
 *
 * @param dir - The directory to search.
 * @returns Sorted list of relative paths to generated files.
 */
async function listGeneratedFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('-method-action-types.ts')) {
        results.push(path.relative(dir, fullPath));
      }
    }
  }

  await walk(dir);
  return results.sort();
}

const { withinSandbox } = createSandbox('messenger/cli-functional');

jest.setTimeout(30_000);

describe('generate-action-types CLI (functional)', () => {
  describe('--generate', () => {
    it('generates FooController-method-action-types.ts for a controller with multiple documented methods', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'FooController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['getState', 'reset'] as const;

class FooController {
  /**
   * Gets the current state.
   */
  getState() {
    return {};
  }

  /**
   * Resets the controller.
   */
  reset() {
    return;
  }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          'FooController-method-action-types.ts',
        ]);

        const content = await fs.promises.readFile(
          path.join(directoryPath, 'FooController-method-action-types.ts'),
          'utf8',
        );
        expect(content).toBe(`/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { FooController } from './FooController';

/**
 * Gets the current state.
 */
export type FooControllerGetStateAction = {
  type: \`FooController:getState\`;
  handler: FooController['getState'];
};

/**
 * Resets the controller.
 */
export type FooControllerResetAction = {
  type: \`FooController:reset\`;
  handler: FooController['reset'];
};

/**
 * Union of all FooController action types.
 */
export type FooControllerMethodActions = FooControllerGetStateAction | FooControllerResetAction;
`);
      });
    });

    it('generates DataService-method-action-types.ts for a service with JSDoc containing @param and @returns', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'DataService.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['fetchItems'] as const;

class DataService {
  /**
   * Fetches items from the API.
   *
   * @returns The items.
   */
  fetchItems() {
    return [];
  }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          'DataService-method-action-types.ts',
        ]);

        const content = await fs.promises.readFile(
          path.join(directoryPath, 'DataService-method-action-types.ts'),
          'utf8',
        );
        expect(content).toBe(`/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DataService } from './DataService';

/**
 * Fetches items from the API.
 *
 * @returns The items.
 */
export type DataServiceFetchItemsAction = {
  type: \`DataService:fetchItems\`;
  handler: DataService['fetchItems'];
};

/**
 * Union of all DataService action types.
 */
export type DataServiceMethodActions = DataServiceFetchItemsAction;
`);
      });
    });

    it('generates correct types for a controller with many methods without JSDoc', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'BarController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['enable', 'disable', 'isEnabled'] as const;

class BarController {
  enable() { return; }
  disable() { return; }
  isEnabled() { return true; }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          'BarController-method-action-types.ts',
        ]);

        const content = await fs.promises.readFile(
          path.join(directoryPath, 'BarController-method-action-types.ts'),
          'utf8',
        );
        expect(content).toBe(`/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { BarController } from './BarController';

export type BarControllerEnableAction = {
  type: \`BarController:enable\`;
  handler: BarController['enable'];
};

export type BarControllerDisableAction = {
  type: \`BarController:disable\`;
  handler: BarController['disable'];
};

export type BarControllerIsEnabledAction = {
  type: \`BarController:isEnabled\`;
  handler: BarController['isEnabled'];
};

/**
 * Union of all BarController action types.
 */
export type BarControllerMethodActions = BarControllerEnableAction | BarControllerDisableAction | BarControllerIsEnabledAction;
`);
      });
    });

    it('generates AuthService-method-action-types.ts for a service with @param and @returns JSDoc', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'AuthService.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['authenticate'] as const;

class AuthService {
  /**
   * Authenticates the user.
   *
   * @param token - The auth token.
   * @returns Whether authentication succeeded.
   */
  authenticate(token: string) {
    return token.length > 0;
  }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          'AuthService-method-action-types.ts',
        ]);

        const content = await fs.promises.readFile(
          path.join(directoryPath, 'AuthService-method-action-types.ts'),
          'utf8',
        );
        expect(content).toBe(`/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AuthService } from './AuthService';

/**
 * Authenticates the user.
 *
 * @param token - The auth token.
 * @returns Whether authentication succeeded.
 */
export type AuthServiceAuthenticateAction = {
  type: \`AuthService:authenticate\`;
  handler: AuthService['authenticate'];
};

/**
 * Union of all AuthService action types.
 */
export type AuthServiceMethodActions = AuthServiceAuthenticateAction;
`);
      });
    });

    it('generates separate files for both a controller and service in the same directory', async () => {
      expect.assertions(8);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'MyController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['doWork'] as const;
class MyController {
  doWork() { return true; }
}
`,
          'utf8',
        );
        await fs.promises.writeFile(
          path.join(directoryPath, 'MyService.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['query'] as const;
class MyService {
  query() { return []; }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          'MyController-method-action-types.ts',
          'MyService-method-action-types.ts',
        ]);

        const controllerContent = await fs.promises.readFile(
          path.join(directoryPath, 'MyController-method-action-types.ts'),
          'utf8',
        );
        expect(controllerContent).toContain('MyControllerDoWorkAction');
        expect(controllerContent).toContain("handler: MyController['doWork']");
        expect(controllerContent).toContain('MyControllerMethodActions');

        const serviceContent = await fs.promises.readFile(
          path.join(directoryPath, 'MyService-method-action-types.ts'),
          'utf8',
        );
        expect(serviceContent).toContain('MyServiceQueryAction');
        expect(serviceContent).toContain("handler: MyService['query']");
        expect(serviceContent).toContain('MyServiceMethodActions');
      });
    });

    it('discovers and generates files for sources in nested subdirectories', async () => {
      expect.assertions(4);

      await withinSandbox(async ({ directoryPath }) => {
        const subDir = path.join(directoryPath, 'nested');
        await fs.promises.mkdir(subDir);
        await fs.promises.writeFile(
          path.join(subDir, 'NestedController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['doNested'] as const;
class NestedController {
  doNested() { return 'nested'; }
}
`,
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([
          path.join('nested', 'NestedController-method-action-types.ts'),
        ]);

        const content = await fs.promises.readFile(
          path.join(subDir, 'NestedController-method-action-types.ts'),
          'utf8',
        );
        expect(content).toContain('NestedControllerDoNestedAction');
        expect(content).toContain("handler: NestedController['doNested']");
      });
    });

    it('warns and generates no files when no sources are found', async () => {
      expect.assertions(3);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'empty.ts'),
          'export const foo = 1;',
          'utf8',
        );

        const result = await runCLI(['--generate', directoryPath]);
        expect(result.exitCode).toBe(0);
        expect(result.all).toContain('No controllers/services found');

        const generatedFiles = await listGeneratedFiles(directoryPath);
        expect(generatedFiles).toStrictEqual([]);
      });
    });
  });

  describe('--check', () => {
    it('exits 0 when generated files are up to date', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'TestController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
          'utf8',
        );

        await runCLI(['--generate', directoryPath]);
        const result = await runCLI(['--check', directoryPath]);

        expect(result.exitCode).toBe(0);
        expect(result.all).toContain('up to date');
      });
    });

    it('exits 1 when generated files are out of date', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'TestController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
          'utf8',
        );
        await fs.promises.writeFile(
          path.join(directoryPath, 'TestController-method-action-types.ts'),
          '// outdated\n',
          'utf8',
        );

        const result = await runCLI(['--check', directoryPath]);

        expect(result.exitCode).toBe(1);
        expect(result.all).toContain('out of date');
      });
    });

    it('exits 1 when generated files are missing', async () => {
      expect.assertions(2);

      await withinSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'TestController.ts'),
          `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
          'utf8',
        );

        const result = await runCLI(['--check', directoryPath]);

        expect(result.exitCode).toBe(1);
        expect(result.all).toContain('does not exist');
      });
    });
  });

  describe('argument validation', () => {
    it('exits 1 when neither --check nor --fix is provided', async () => {
      expect.assertions(1);

      await withinSandbox(async ({ directoryPath }) => {
        const result = await runCLI([directoryPath]);
        expect(result.exitCode).toBe(1);
      });
    });
  });
});
