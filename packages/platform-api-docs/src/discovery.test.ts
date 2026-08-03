import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { findDtsFiles, findTsFiles } from './discovery.js';

const { withinSandbox } = createSandbox('platform-api-docs/discovery');

describe('findTsFiles', () => {
  it('finds .ts files in a directory', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'Controller.ts'),
        'export class Controller {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([path.join(directoryPath, 'Controller.ts')]);
    });
  });

  it('finds .ts files in nested subdirectories', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const subDir = path.join(directoryPath, 'sub');
      await fs.promises.mkdir(subDir);
      await fs.promises.writeFile(
        path.join(subDir, 'Nested.ts'),
        'export class Nested {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([path.join(subDir, 'Nested.ts')]);
    });
  });

  it('skips node_modules directories', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const nmDir = path.join(directoryPath, 'node_modules', 'pkg');
      await fs.promises.mkdir(nmDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(nmDir, 'index.ts'),
        'export default {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('skips dist directories', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const distDir = path.join(directoryPath, 'dist');
      await fs.promises.mkdir(distDir);
      await fs.promises.writeFile(
        path.join(distDir, 'index.ts'),
        'export default {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('skips test directories (__tests__, tests, test, __mocks__)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      for (const dir of ['__tests__', 'tests', 'test', '__mocks__']) {
        const testDir = path.join(directoryPath, dir);
        await fs.promises.mkdir(testDir);
        await fs.promises.writeFile(path.join(testDir, 'file.ts'), 'export {}');
      }

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('skips test files (.test.ts, .test-d.ts, .spec.ts)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'Controller.test.ts'),
        'describe("test", () => {})',
      );
      await fs.promises.writeFile(
        path.join(directoryPath, 'Controller.test-d.ts'),
        'export {}',
      );
      await fs.promises.writeFile(
        path.join(directoryPath, 'Controller.spec.ts'),
        'export {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('skips declaration files (.d.ts)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'types.d.ts'),
        'declare module "foo" {}',
      );

      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('returns empty array for empty directory', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const files = await findTsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });
});

describe('findDtsFiles', () => {
  it('finds .d.cts files in a directory', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'index.d.cts'),
        'export declare const foo: string;',
      );

      const files = await findDtsFiles(directoryPath);

      expect(files).toStrictEqual([path.join(directoryPath, 'index.d.cts')]);
    });
  });

  it('finds .d.cts files in nested subdirectories', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const subDir = path.join(directoryPath, 'sub');
      await fs.promises.mkdir(subDir);
      await fs.promises.writeFile(
        path.join(subDir, 'types.d.cts'),
        'export declare const bar: number;',
      );

      const files = await findDtsFiles(directoryPath);

      expect(files).toStrictEqual([path.join(subDir, 'types.d.cts')]);
    });
  });

  it('skips nested node_modules directories', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const nmDir = path.join(directoryPath, 'node_modules', 'pkg');
      await fs.promises.mkdir(nmDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(nmDir, 'index.d.cts'),
        'export declare const baz: boolean;',
      );

      const files = await findDtsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });

  it('returns empty array for empty directory', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const files = await findDtsFiles(directoryPath);

      expect(files).toStrictEqual([]);
    });
  });
});
