import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkActionTypesFiles } from './check';
import { generateActionTypesContent } from './generate-content';
import type { ControllerInfo } from './parse-controller';

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
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),
      exposedMethods: ['doStuff'],
      methods: [{ name: 'doStuff', jsDoc: '', signature: 'doStuff' }],
    };

    const content = generateActionTypesContent(controller);
    await fs.promises.writeFile(
      path.join(tmpDir, 'TestController-method-action-types.ts'),
      content,
      'utf8',
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await checkActionTypesFiles([controller], null, null);
    consoleSpy.mockRestore();

    expect(globalThis.process.exitCode).toBeUndefined();
  });

  it('reports out of date when files differ', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),
      exposedMethods: ['doStuff'],
      methods: [{ name: 'doStuff', jsDoc: '', signature: 'doStuff' }],
    };

    await fs.promises.writeFile(
      path.join(tmpDir, 'TestController-method-action-types.ts'),
      '// outdated content\n',
      'utf8',
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await checkActionTypesFiles([controller], null, null);
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    expect(globalThis.process.exitCode).toBe(1);
  });

  it('reports missing files', async () => {
    const controller: ControllerInfo = {
      name: 'TestController',
      filePath: path.join(tmpDir, 'TestController.ts'),
      exposedMethods: ['doStuff'],
      methods: [{ name: 'doStuff', jsDoc: '', signature: 'doStuff' }],
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    await checkActionTypesFiles([controller], null, null);
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    expect(globalThis.process.exitCode).toBe(1);
  });
});
