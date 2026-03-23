import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { generateAllActionTypesFiles } from './fix';
import { generateActionTypesContent } from './generate-content';
import type { ControllerInfo } from './parse-source';

describe('generateAllActionTypesFiles', () => {
  let tmpDir: string;
  const originalExitCode = globalThis.process.exitCode;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fix-action-types-'),
    );
    globalThis.process.exitCode = undefined;
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    globalThis.process.exitCode = originalExitCode;
  });

  it('generates files for controllers (no ESLint)', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles([controller], null);
    consoleSpy.mockRestore();

    const outputFile = path.join(
      tmpDir,
      'TestController-method-action-types.ts',
    );
    const content = await fs.promises.readFile(outputFile, 'utf8');
    const expected = generateActionTypesContent(controller);

    expect(content).toBe(expected);
  });

  it('generates files for multiple controllers', async () => {
    const controllers: ControllerInfo[] = [
      {
        name: 'FooController',
        filePath: path.join(tmpDir, 'FooController.ts'),
        methods: [{ name: 'doFoo', jsDoc: '' }],
      },
      {
        name: 'BarService',
        filePath: path.join(tmpDir, 'BarService.ts'),
        methods: [{ name: 'doBar', jsDoc: '' }],
      },
    ];

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles(controllers, null);
    consoleSpy.mockRestore();

    const fooFile = path.join(tmpDir, 'FooController-method-action-types.ts');
    const barFile = path.join(tmpDir, 'BarService-method-action-types.ts');

    const fooContent = await fs.promises.readFile(fooFile, 'utf8');
    const barContent = await fs.promises.readFile(barFile, 'utf8');

    expect(fooContent).toContain('FooController');
    expect(barContent).toContain('BarService');
  });

  it('invokes ESLint when provided', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),

      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const mockEslint = {
      instance: { lintFiles: jest.fn().mockResolvedValue([]) },
      static: {
        outputFixes: jest.fn().mockResolvedValue(undefined),
        getErrorResults: jest.fn().mockReturnValue([]),
      },
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles([controller], mockEslint);
    consoleSpy.mockRestore();

    expect(mockEslint.instance.lintFiles).toHaveBeenCalledWith([
      path.join(tmpDir, 'TestController-method-action-types.ts'),
    ]);
    expect(mockEslint.static.outputFixes).toHaveBeenCalled();
    expect(mockEslint.static.getErrorResults).toHaveBeenCalled();
  });

  it('sets exitCode when ESLint reports errors', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),
      methods: [{ name: 'doStuff', jsDoc: '' }],
    };

    const mockEslint = {
      instance: {
        lintFiles: jest.fn().mockResolvedValue([{ filePath: 'test.ts' }]),
      },
      static: {
        outputFixes: jest.fn().mockResolvedValue(undefined),
        getErrorResults: jest
          .fn()
          .mockReturnValue([{ filePath: 'test.ts', messages: ['err'] }]),
      },
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await generateAllActionTypesFiles([controller], mockEslint);

    expect(globalThis.process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ESLint errors:',
      expect.anything(),
    );

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
