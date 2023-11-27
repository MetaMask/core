import memfs, { vol } from 'memfs';
import path from 'path';

import { readAllFiles, writeFiles } from './fs-utils';

jest.mock('fs', () => memfs.fs);

describe('create-package/fs-utils', () => {
  describe('readAllFiles', () => {
    beforeEach(() => {
      vol.reset();
    });

    it('should read all files in the specified directory', async () => {
      vol.fromJSON({
        'dir/file1.txt': 'foo',
        'dir/file2.txt': 'bar',
        'dir/file3.txt': 'baz',
        'dir/subdir1/file4.txt': 'qux',
      });

      const files = await readAllFiles('dir/');

      expect(files).toStrictEqual({
        'file1.txt': 'foo',
        'file2.txt': 'bar',
        'file3.txt': 'baz',
        'subdir1/file4.txt': 'qux',
      });
    });
  });

  describe('writeFiles', () => {
    beforeEach(() => {
      vol.reset();
    });

    it('should write all files to the specified directory', async () => {
      vol.fromJSON({
        'dir/': null,
        'dir/subdir1/': null,
      });

      await writeFiles('dir/', {
        'file1.txt': 'foo',
        'file2.txt': 'bar',
        'file3.txt': 'baz',
        'subdir1/file4.txt': 'qux',
      });

      // memfs uses process.cwd() to resolve relative paths, so we need to take
      // that into account here.
      expect(vol.toJSON()).toStrictEqual({
        [path.join(process.cwd(), 'dir/file1.txt')]: 'foo',
        [path.join(process.cwd(), 'dir/file2.txt')]: 'bar',
        [path.join(process.cwd(), 'dir/file3.txt')]: 'baz',
        [path.join(process.cwd(), 'dir/subdir1/file4.txt')]: 'qux',
      });
    });
  });
});
