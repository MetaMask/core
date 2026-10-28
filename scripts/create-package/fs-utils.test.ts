import { createSandbox, writeFile, readFile } from '@metamask/node-utils';
import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { readAllFiles, writeFiles } from './fs-utils.ts';

const { withinSandbox } = createSandbox('create-package/fs-utils');

describe('create-package/fs-utils', () => {
  describe('readAllFiles', () => {
    it('should read all files and sub-directories in the specified directory', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
            ] as const
          ).map(async ([filePath, content]) => {
            await writeFile(path.join(dirPath, filePath), content);
          }),
        );

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
        });
      });
    });

    it('should read all files and sub-directories in the specified directory (deeply nested)', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
              ['subdir1/subdir2/subdir3/file5.txt', 'quux'],
            ] as const
          ).map(async ([filePath, content]) => {
            await writeFile(path.join(dirPath, filePath), content);
          }),
        );

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
          'subdir1/subdir2/subdir3/file5.txt': 'quux',
        });
      });
    });

    it('should ignore file system entities that are neither files nor directories', async () => {
      expect.assertions(1);

      const dirPath = path.join('/fake', 'dir/');
      vi.spyOn(fs, 'readdir').mockResolvedValue([
        {
          // @ts-expect-error: Mock name.
          name: 'file1.txt',
          isDirectory: (): boolean => false,
          isFile: (): boolean => true,
        },
        {
          // @ts-expect-error: Mock name.
          name: 'file2.txt',
          isDirectory: (): boolean => false,
          isFile: (): boolean => false,
        },
      ]);

      vi.spyOn(fs, 'readFile').mockResolvedValue('foo');
      const files = await readAllFiles(dirPath);

      expect(files).toStrictEqual({
        'file1.txt': 'foo',
      });
    });
  });

  describe('writeFiles', () => {
    it('should write all files to the specified directory', async () => {
      expect.assertions(4);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await writeFiles(dirPath, {
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
        });

        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
            ] as const
          ).map(async ([filePath, content]) => {
            expect(await readFile(path.join(dirPath, filePath))).toStrictEqual(
              content,
            );
          }),
        );
      });
    });

    it('should write all files to the specified directory (deeply nested)', async () => {
      expect.assertions(5);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await writeFiles(dirPath, {
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
          'subdir1/subdir2/subdir3/file5.txt': 'quux',
        });

        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
              ['subdir1/subdir2/subdir3/file5.txt', 'quux'],
            ] as const
          ).map(async ([filePath, content]) => {
            expect(await readFile(path.join(dirPath, filePath))).toStrictEqual(
              content,
            );
          }),
        );
      });
    });
  });
});
