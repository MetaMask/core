import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateAllActionTypesFiles } from './fix';
import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';

const { withinSandbox } = createSandbox('messenger/fix-action-types');

describe('generateAllActionTypesFiles', () => {
  it('generates files for controllers (no ESLint)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await generateAllActionTypesFiles([controller], null);
      consoleSpy.mockRestore();

      const outputFile = path.join(
        directoryPath,
        'TestController-method-action-types.ts',
      );
      const content = await fs.promises.readFile(outputFile, 'utf8');
      const expected = generateActionTypesContent(controller);

      expect(content).toBe(expected);
    });
  });

  it('generates files for multiple controllers', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const controllers: SourceInfo[] = [
        {
          name: 'FooController',
          filePath: path.join(directoryPath, 'FooController.ts'),
          methods: [{ name: 'doFoo', jsDoc: '' }],
        },
        {
          name: 'BarService',
          filePath: path.join(directoryPath, 'BarService.ts'),
          methods: [{ name: 'doBar', jsDoc: '' }],
        },
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await generateAllActionTypesFiles(controllers, null);
      consoleSpy.mockRestore();

      const fooFile = path.join(
        directoryPath,
        'FooController-method-action-types.ts',
      );
      const barFile = path.join(
        directoryPath,
        'BarService-method-action-types.ts',
      );

      const fooContent = await fs.promises.readFile(fooFile, 'utf8');
      const barContent = await fs.promises.readFile(barFile, 'utf8');

      expect(fooContent).toContain('FooController');
      expect(barContent).toContain('BarService');
    });
  });

  it('invokes ESLint when provided', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),

        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const mockEslint = {
        instance: { lintFiles: jest.fn().mockResolvedValue([]) },
        eslintClass: {
          outputFixes: jest.fn().mockResolvedValue(undefined),
          getErrorResults: jest.fn().mockReturnValue([]),
        },
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await generateAllActionTypesFiles([controller], mockEslint);
      consoleSpy.mockRestore();

      expect(mockEslint.instance.lintFiles).toHaveBeenCalledWith([
        path.join(directoryPath, 'TestController-method-action-types.ts'),
      ]);
      expect(mockEslint.eslintClass.outputFixes).toHaveBeenCalled();
      expect(mockEslint.eslintClass.getErrorResults).toHaveBeenCalled();
    });
  });

  it('returns false when ESLint reports errors', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const controller: SourceInfo = {
        name: 'TestController',
        filePath: path.join(directoryPath, 'TestController.ts'),
        methods: [{ name: 'doStuff', jsDoc: '' }],
      };

      const mockEslint = {
        instance: {
          lintFiles: jest.fn().mockResolvedValue([{ filePath: 'test.ts' }]),
        },
        eslintClass: {
          outputFixes: jest.fn().mockResolvedValue(undefined),
          getErrorResults: jest
            .fn()
            .mockReturnValue([{ filePath: 'test.ts', messages: ['err'] }]),
        },
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await generateAllActionTypesFiles(
        [controller],
        mockEslint,
      );

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ ESLint errors:',
        expect.anything(),
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
