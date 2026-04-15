import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { generate } from './generate';

const { withinSandbox } = createSandbox('messenger-cli/docs-generate');

jest.setTimeout(30_000);

describe('generate', () => {
  it('generates docs for a project with action types in src/', async () => {
    expect.assertions(4);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'FooController.ts'),
        `
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      expect(result.namespaces).toBe(1);
      expect(result.actions).toBe(1);
      expect(result.events).toBe(0);

      const docsDir = path.join(outputDir, 'docs');
      const actionsMd = await fs.promises.readFile(
        path.join(docsDir, 'FooController', 'actions.md'),
        'utf8',
      );
      expect(actionsMd).toContain('FooController:getState');
    });
  });

  it('generates index page and sidebars', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'types.ts'),
        `
export type BarAction = {
  type: 'Bar:do';
  handler: () => void;
};
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      const docsDir = path.join(outputDir, 'docs');
      const index = await fs.promises.readFile(
        path.join(docsDir, 'index.md'),
        'utf8',
      );
      expect(index).toContain('Bar');

      const sidebars = await fs.promises.readFile(
        path.join(outputDir, 'sidebars.ts'),
        'utf8',
      );
      expect(sidebars).toContain('Bar');
    });
  });

  it('scans packages/*/src/ for monorepo packages', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const pkgSrc = path.join(directoryPath, 'packages', 'my-pkg', 'src');
      await fs.promises.mkdir(pkgSrc, { recursive: true });
      await fs.promises.writeFile(
        path.join(pkgSrc, 'Controller.ts'),
        `
export type MyGetAction = {
  type: 'My:get';
  handler: () => string;
};
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
    });
  });

  it('scans node_modules/@metamask/*/dist/ for .d.cts files', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const distDir = path.join(
        directoryPath,
        'node_modules',
        '@metamask',
        'test-pkg',
        'dist',
      );
      await fs.promises.mkdir(distDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(distDir, 'index.d.cts'),
        `
export type TestGetAction = {
  type: 'Test:get';
  handler: () => boolean;
};
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
    });
  });

  it('throws when no scannable directories found', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const outputDir = path.join(directoryPath, '.docs');

      await expect(
        generate({
          projectPath: directoryPath,
          outputDir,
          scanDirs: ['nonexistent'],
        }),
      ).rejects.toThrow('No scannable directories found');
    });
  });

  it('deduplicates items preferring those with JSDoc', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });

      // File without JSDoc
      await fs.promises.writeFile(
        path.join(srcDir, 'a.ts'),
        `
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
      );

      // File with JSDoc (should win)
      await fs.promises.writeFile(
        path.join(srcDir, 'b.ts'),
        `
/** Gets foo. */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Foo', 'actions.md'),
        'utf8',
      );
      expect(actionsMd).toContain('Gets foo.');
    });
  });

  it('returns zero counts for project with no messenger types', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'utils.ts'),
        'export const x = 1;',
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        scanDirs: ['src'],
      });

      expect(result.namespaces).toBe(0);
      expect(result.actions).toBe(0);
      expect(result.events).toBe(0);
    });
  });
});
