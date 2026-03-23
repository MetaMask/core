import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkActionTypesFiles } from './check';
import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';

describe('checkActionTypesFiles', () => {
  let tmpDir: string;
  const originalExitCode = globalThis.process.exitCode;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'check-action-types-'),
    );
    globalThis.process.exitCode = undefined;
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    globalThis.process.exitCode = originalExitCode;
  });

  it('reports up to date when files match (no ESLint)', async () => {
    const controller: SourceInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const content = generateActionTypesContent(controller);
    await fs.promises.writeFile(
      path.join(tmpDir, 'TestController-method-action-types.ts'),
      content,
      'utf8',
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await checkActionTypesFiles([controller], null);
    consoleSpy.mockRestore();

    expect(globalThis.process.exitCode).toBeUndefined();
  });

  it('reports out of date when files differ', async () => {
    const controller: SourceInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    await fs.promises.writeFile(
      path.join(tmpDir, 'TestController-method-action-types.ts'),
      '// outdated content\n',
      'utf8',
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await checkActionTypesFiles([controller], null);
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    expect(globalThis.process.exitCode).toBe(1);
  });

  it('reports missing files', async () => {
    const controller: SourceInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await checkActionTypesFiles([controller], null);
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    expect(globalThis.process.exitCode).toBe(1);
  });

  it('reports non-ENOENT errors when accessing files', async () => {
    const controller: SourceInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    // Mock fs.promises.access to throw a non-ENOENT error
    const accessSpy = jest
      .spyOn(fs.promises, 'access')
      .mockRejectedValue(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await checkActionTypesFiles([controller], null);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error reading'),
      expect.anything(),
    );
    expect(globalThis.process.exitCode).toBe(1);

    accessSpy.mockRestore();
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('uses ESLint when provided', async () => {
    const controller: SourceInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const content = generateActionTypesContent(controller);
    await fs.promises.writeFile(
      path.join(tmpDir, 'TestController-method-action-types.ts'),
      content,
      'utf8',
    );

    const mockEslint = {
      instance: { lintFiles: jest.fn().mockResolvedValue([]) },
      static: {
        outputFixes: jest.fn().mockResolvedValue(undefined),
        getErrorResults: jest.fn().mockReturnValue([]),
      },
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await checkActionTypesFiles([controller], mockEslint);
    consoleSpy.mockRestore();

    expect(mockEslint.instance.lintFiles).toHaveBeenCalled();
    expect(mockEslint.static.outputFixes).toHaveBeenCalled();
    expect(globalThis.process.exitCode).toBeUndefined();
  });
});
