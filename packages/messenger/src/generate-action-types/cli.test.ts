import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadESLint, main, parseCommandLineArguments } from './cli';

/**
 * Helper to list generated `-method-action-types.ts` files in a directory
 * (recursively).
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

describe('parseCommandLineArguments', () => {
  it('parses --fix with default path', async () => {
    const result = await parseCommandLineArguments(['--fix']);
    expect(result).toStrictEqual({
      check: false,
      fix: true,
      sourcePath: 'src',
    });
  });

  it('parses --check with custom path', async () => {
    const result = await parseCommandLineArguments(['--check', 'custom/path']);
    expect(result).toStrictEqual({
      check: true,
      fix: false,
      sourcePath: 'custom/path',
    });
  });

  it('rejects when neither --check nor --fix is provided', async () => {
    await expect(parseCommandLineArguments([])).rejects.toThrow(
      'Either --check or --fix must be provided.',
    );
  });
});

describe('loadESLint', () => {
  it('returns null or a valid ESLint object', async () => {
    const eslint = await loadESLint();
    expect([null, expect.objectContaining({})]).toContainEqual(eslint);
  });
});

describe('main', () => {
  let tmpDir: string;
  const originalExitCode = globalThis.process.exitCode;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'cli-functional-'),
    );
    globalThis.process.exitCode = undefined;
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    globalThis.process.exitCode = originalExitCode;
  });

  describe('--fix', () => {
    it('generates FooController-method-action-types.ts with correct types for a controller with multiple documented methods', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'FooController.ts'),
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([
        'FooController-method-action-types.ts',
      ]);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'FooController-method-action-types.ts'),
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

    it('generates DataService-method-action-types.ts with correct types for a service with JSDoc containing @returns', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'DataService.ts'),
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([
        'DataService-method-action-types.ts',
      ]);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'DataService-method-action-types.ts'),
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

    it('generates correct types for a controller with methods without JSDoc', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'BarController.ts'),
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([
        'BarController-method-action-types.ts',
      ]);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'BarController-method-action-types.ts'),
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

    it('generates correct types for a service with a single method', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'AuthService.ts'),
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([
        'AuthService-method-action-types.ts',
      ]);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'AuthService-method-action-types.ts'),
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

    it('generates separate files for both a controller and service in the same directory', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'MyController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doWork'] as const;
class MyController {
  doWork() { return true; }
}
`,
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'MyService.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['query'] as const;
class MyService {
  query() { return []; }
}
`,
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([
        'MyController-method-action-types.ts',
        'MyService-method-action-types.ts',
      ]);

      const controllerContent = await fs.promises.readFile(
        path.join(tmpDir, 'MyController-method-action-types.ts'),
        'utf8',
      );
      expect(controllerContent).toContain('MyControllerDoWorkAction');
      expect(controllerContent).toContain("handler: MyController['doWork']");
      expect(controllerContent).toContain('MyControllerMethodActions');

      const serviceContent = await fs.promises.readFile(
        path.join(tmpDir, 'MyService-method-action-types.ts'),
        'utf8',
      );
      expect(serviceContent).toContain('MyServiceQueryAction');
      expect(serviceContent).toContain("handler: MyService['query']");
      expect(serviceContent).toContain('MyServiceMethodActions');
    });

    it('discovers and generates files for sources in nested subdirectories', async () => {
      const subDir = path.join(tmpDir, 'nested');
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
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

    it('warns and generates no files when no sources are found', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'empty.ts'),
        'export const foo = 1;',
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No controllers/services found'),
      );
      consoleSpy.mockRestore();

      const generatedFiles = await listGeneratedFiles(tmpDir);
      expect(generatedFiles).toStrictEqual([]);
    });
  });

  describe('--check', () => {
    it('passes when generated files are up to date', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'TestController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
        'utf8',
      );

      const fixSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--fix', tmpDir]);
      fixSpy.mockRestore();

      const checkSpy = jest.spyOn(console, 'log').mockImplementation();
      await main(['--check', tmpDir]);
      checkSpy.mockRestore();

      expect(globalThis.process.exitCode).toBeUndefined();
    });

    it('fails when generated files are out of date', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'TestController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'TestController-method-action-types.ts'),
        '// outdated\n',
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      await main(['--check', tmpDir]);

      expect(globalThis.process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('fails when generated files are missing', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'TestController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;
class TestController {
  doStuff() { return true; }
}
`,
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      await main(['--check', tmpDir]);

      expect(globalThis.process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
