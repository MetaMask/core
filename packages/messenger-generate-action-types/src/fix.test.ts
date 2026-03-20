import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { generateAllActionTypesFiles } from './fix';
import { generateActionTypesContent } from './generate-content';
import type { ControllerInfo } from './parse-controller';

describe('generateAllActionTypesFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fix-action-types-'),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates files for controllers (no ESLint)', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),
      exposedMethods: ['doStuff'],
      methods: [{ name: 'doStuff', jsDoc: '', signature: 'doStuff' }],
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles([controller], null, null);
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
        exposedMethods: ['doFoo'],
        methods: [{ name: 'doFoo', jsDoc: '', signature: 'doFoo' }],
      },
      {
        name: 'BarService',
        filePath: path.join(tmpDir, 'BarService.ts'),
        exposedMethods: ['doBar'],
        methods: [{ name: 'doBar', jsDoc: '', signature: 'doBar' }],
      },
    ];

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles(controllers, null, null);
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
      exposedMethods: ['doStuff'],
      methods: [{ name: 'doStuff', jsDoc: '', signature: 'doStuff' }],
    };

    const mockESLint = {
      lintFiles: jest.fn().mockResolvedValue([]),
    };

    const mockESLintStatic = {
      outputFixes: jest.fn().mockResolvedValue(undefined),
      getErrorResults: jest.fn().mockReturnValue([]),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await generateAllActionTypesFiles(
      [controller],
      mockESLint,
      mockESLintStatic,
    );
    consoleSpy.mockRestore();

    expect(mockESLint.lintFiles).toHaveBeenCalledWith([
      path.join(tmpDir, 'TestController-method-action-types.ts'),
    ]);
    expect(mockESLintStatic.outputFixes).toHaveBeenCalled();
    expect(mockESLintStatic.getErrorResults).toHaveBeenCalled();
  });
});
