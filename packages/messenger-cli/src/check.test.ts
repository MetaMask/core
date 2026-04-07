import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { checkActionTypesFiles } from './check';
import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';

const { withinSandbox } = createSandbox('messenger/check-action-types');

describe('checkActionTypesFiles', () => {
  it('reports up to date when files match (no ESLint)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const content = generateActionTypesContent(controller);
      await fs.promises.writeFile(
        path.join(directoryPath, 'TestController-method-action-types.ts'),
        content,
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await checkActionTypesFiles([controller], null);
      consoleSpy.mockRestore();

      expect(result).toBe(true);
    });
  });

  it('reports out of date when files differ', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      await fs.promises.writeFile(
        path.join(directoryPath, 'TestController-method-action-types.ts'),
        '// outdated content\n',
        'utf8',
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await checkActionTypesFiles([controller], null);
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      expect(result).toBe(false);
    });
  });

  it('reports missing files', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await checkActionTypesFiles([controller], null);
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      expect(result).toBe(false);
    });
  });

  it('reports non-ENOENT errors when accessing files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      // Mock fs.promises.access to throw a non-ENOENT error
      const accessSpy = jest
        .spyOn(fs.promises, 'access')
        .mockRejectedValue(
          Object.assign(new Error('EPERM'), { code: 'EPERM' }),
        );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await checkActionTypesFiles([controller], null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error reading'),
        expect.anything(),
      );
      expect(result).toBe(false);

      accessSpy.mockRestore();
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  it('uses ESLint when provided', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const content = generateActionTypesContent(controller);
      await fs.promises.writeFile(
        path.join(directoryPath, 'TestController-method-action-types.ts'),
        content,
        'utf8',
      );

      const mockEslint = {
        instance: { lintFiles: jest.fn().mockResolvedValue([]) },
        eslintClass: {
          outputFixes: jest.fn().mockResolvedValue(undefined),
        },
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await checkActionTypesFiles([controller], mockEslint);
      consoleSpy.mockRestore();

      expect(mockEslint.instance.lintFiles).toHaveBeenCalled();
      expect(mockEslint.eslintClass.outputFixes).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
