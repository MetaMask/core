import { createSandbox } from '@metamask/utils/node';
import execa from 'execa';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { generate, resolveRepoUrl } from './generate.js';

const { withinSandbox } = createSandbox('platform-api-docs/generate');

jest.setTimeout(30_000);

/**
 * Initialize a git repository in the given directory with an `origin` remote
 * pointing at the provided URL and `refs/remotes/origin/HEAD` symbolically
 * pointing at `refs/remotes/origin/main`. Used to exercise the source-link
 * resolution paths in {@link generate} without depending on a real network.
 *
 * @param directoryPath - Absolute path to initialize the repo in.
 * @param remoteUrl - URL to set as the `origin` remote.
 */
async function initGitRepo(
  directoryPath: string,
  remoteUrl: string,
): Promise<void> {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd: directoryPath });
  await execa('git', ['remote', 'add', 'origin', remoteUrl], {
    cwd: directoryPath,
  });
  await execa(
    'git',
    ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'],
    { cwd: directoryPath },
  );
}

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

export type FooControllerMessenger = Messenger<'FooController', FooControllerGetStateAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
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

export type BarMessenger = Messenger<'Bar', BarAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
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

export type MyMessenger = Messenger<'My', MyGetAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
    });
  });

  it('scans a package whose name collides with an exclusion pattern', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      // The exclusions drop directories named `test`, `dist` and friends. They
      // must be anchored at each package's `src`, not at `packages`, or a
      // package that happens to be *called* `test` is dropped whole.
      const pkgSrc = path.join(directoryPath, 'packages', 'test', 'src');
      await fs.promises.mkdir(pkgSrc, { recursive: true });
      await fs.promises.writeFile(
        path.join(pkgSrc, 'Controller.ts'),
        `
export type TestPkgGetAction = {
  type: 'TestPkg:get';
  handler: () => string;
};

export type TestPkgMessenger = Messenger<'TestPkg', TestPkgGetAction, never>;
`,
      );
      // A genuine test directory nested inside that package is still excluded.
      const nestedTestDir = path.join(pkgSrc, 'test');
      await fs.promises.mkdir(nestedTestDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(nestedTestDir, 'Helper.ts'),
        `
export type NestedGetAction = {
  type: 'Nested:get';
  handler: () => string;
};

export type NestedMessenger = Messenger<'Nested', NestedGetAction, never>;
`,
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
      expect(result.namespaces).toBe(1);
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

export type TestMessenger = Messenger<'Test', TestGetAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
    });
  });

  it('follows symlinked @metamask packages when scanning node_modules/@metamask/*/dist', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      // In a yarn-workspaces layout, `node_modules/@metamask/<pkg>` is a
      // symlink to the package's actual directory. `listTargetSubdirectories`
      // must follow these symlinks when scanning node_modules.
      const realPkgDir = path.join(directoryPath, 'real-pkg');
      const distDir = path.join(realPkgDir, 'dist');
      await fs.promises.mkdir(distDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(distDir, 'index.d.cts'),
        `
export type LinkedGetAction = {
  type: 'Linked:get';
  handler: () => boolean;
};

export type LinkedMessenger = Messenger<'Linked', LinkedGetAction, never>;
`,
      );

      const scopedDir = path.join(directoryPath, 'node_modules', '@metamask');
      await fs.promises.mkdir(scopedDir, { recursive: true });
      await fs.promises.symlink(
        realPkgDir,
        path.join(scopedDir, 'linked-pkg'),
        'dir',
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
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
          strategy: 'scan',
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

      // The JSDoc'd file is named to sort first so it's encountered
      // first — that way the second (no-doc) file is the one that gets
      // skipped by the dedup logic.
      await fs.promises.writeFile(
        path.join(srcDir, 'a-with-doc.ts'),
        `
/** Gets foo. */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooAction, never>;
`,
      );

      await fs.promises.writeFile(
        path.join(srcDir, 'b-no-doc.ts'),
        `
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
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
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.namespaces).toBe(0);
      expect(result.actions).toBe(0);
      expect(result.events).toBe(0);
    });
  });

  it('renders GitHub source links when the project has a GitHub origin remote', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await initGitRepo(
        directoryPath,
        'https://github.com/test-owner/test-repo.git',
      );

      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'GitController.ts'),
        `
export type GitGetAction = {
  type: 'Git:get';
  handler: () => string;
};

export type GitMessenger = Messenger<'Git', GitGetAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Git', 'actions.md'),
        'utf8',
      );

      expect(actionsMd).toContain(
        'https://github.com/test-owner/test-repo/blob/main/',
      );
      expect(actionsMd).toContain('src/GitController.ts');
    });
  });

  it('uses the documented commit SHA in source links when provided', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initGitRepo(
        directoryPath,
        'https://github.com/test-owner/test-repo.git',
      );

      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'GitController.ts'),
        `
export type GitGetAction = {
  type: 'Git:get';
  handler: () => string;
};

export type GitMessenger = Messenger<'Git', GitGetAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
        commitSha: 'abc1234',
      });

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Git', 'actions.md'),
        'utf8',
      );

      // The link should pin to the documented commit, not the default branch.
      expect(actionsMd).toContain(
        'https://github.com/test-owner/test-repo/blob/abc1234/',
      );
    });
  });

  it('skips unreadable source files and still documents the rest', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      // A valid file so the build still produces something.
      await fs.promises.writeFile(
        path.join(srcDir, 'Ok.ts'),
        `
export type OkAction = {
  type: 'Ok:run';
  handler: () => void;
};

export type OkMessenger = Messenger<'Ok', OkAction, never>;
`,
      );
      // A broken symlink pointing nowhere. It matches `**‍/*.ts` by name, but
      // cannot be read, so it must not stop the valid file being documented.
      await fs.promises.symlink(
        '/this/path/does/not/exist',
        path.join(srcDir, 'Bad.ts'),
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
    });
  });

  it('groups events into their own list and emits an events-only namespace page', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'EventsOnly.ts'),
        `
export type EventsOnlyChangeEvent = {
  type: 'EventsOnly:change';
  payload: [number];
};

export type EventsOnlyMessenger = Messenger<'EventsOnly', never, EventsOnlyChangeEvent>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(0);
      expect(result.events).toBe(1);
      // Sanity: the events page exists; the actions page does not.
      const eventsExists = await fs.promises
        .access(path.join(outputDir, 'docs', 'EventsOnly', 'events.md'))
        .then(() => true)
        .catch(() => false);
      expect(eventsExists).toBe(true);
    });
  });

  it('cleans the docs directory when regenerating into the same output', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'First.ts'),
        `
export type FirstAction = { type: 'First:do'; handler: () => void };
export type FirstMessenger = Messenger<'First', FirstAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const docsDir = path.join(outputDir, 'docs');

      // First run creates the docs directory.
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });
      const firstExists = await fs.promises
        .access(path.join(docsDir, 'First', 'actions.md'))
        .then(() => true)
        .catch(() => false);
      expect(firstExists).toBe(true);

      // Rewrite the source so the first namespace disappears.
      await fs.promises.rm(path.join(srcDir, 'First.ts'));
      await fs.promises.writeFile(
        path.join(srcDir, 'Second.ts'),
        `
export type SecondAction = { type: 'Second:do'; handler: () => void };
export type SecondMessenger = Messenger<'Second', SecondAction, never>;
`,
      );

      // Second run should remove the stale `First/` directory before
      // writing the new output.
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });
      const stalePresent = await fs.promises
        .access(path.join(docsDir, 'First'))
        .then(() => true)
        .catch(() => false);
      expect(stalePresent).toBe(false);
    });
  });

  it('orders namespaces alphabetically when there are multiple', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'Multi.ts'),
        `
export type ZooAction = { type: 'Zoo:do'; handler: () => void };
export type AlphaAction = { type: 'Alpha:do'; handler: () => void };

export type ZooMessenger = Messenger<'Zoo', ZooAction, never>;
export type AlphaMessenger = Messenger<'Alpha', AlphaAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      const indexMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'index.md'),
        'utf8',
      );
      // Index lists namespaces alphabetically — "Alpha" should appear before
      // "Zoo" even though "Zoo" was written first.
      expect(indexMd.indexOf('Alpha')).toBeLessThan(indexMd.indexOf('Zoo'));
    });
  });

  it('replaces a duplicate of the same kind when the second occurrence has a higher score', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });

      // No-JSDoc copy sorts first, JSDoc'd copy sorts second — so the
      // dedup logic *replaces* the existing entry in place rather than
      // skipping the new one.
      await fs.promises.writeFile(
        path.join(srcDir, 'a-no-doc.ts'),
        `
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooAction, never>;
`,
      );
      await fs.promises.writeFile(
        path.join(srcDir, 'b-with-doc.ts'),
        `
/** Documented. */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Foo', 'actions.md'),
        'utf8',
      );
      expect(actionsMd).toContain('Documented.');
    });
  });

  it('replaces a duplicate when the better-scored variant has a different kind', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });

      // Two files declare a capability with the same typeString
      // ("Dupe:thing") but disagree on the kind. The "home" file
      // (matching the namespace) gets the higher dedup score; the
      // filenames are chosen so the lower-scored variant is encountered
      // first.
      await fs.promises.writeFile(
        path.join(srcDir, 'a-other.ts'),
        `
export type DupeAction = { type: 'Dupe:thing'; handler: () => void };
export type OtherMessenger = Messenger<'Other', DupeAction, never>;
`,
      );
      await fs.promises.writeFile(
        path.join(srcDir, 'z-DupeController.ts'),
        `
export type DupeEvent = { type: 'Dupe:thing'; payload: [] };
export type DupeMessenger = Messenger<'Dupe', never, DupeEvent>;
`,
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
        scanDirs: ['src'],
      });

      // The home-package version wins: Dupe:thing is documented as an event
      // exactly once.
      expect(result.actions).toBe(0);
      expect(result.events).toBe(1);
    });
  });

  it('sorts multiple actions and events within a single namespace by type string', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'Foo.ts'),
        `
export type FooZooAction = { type: 'Foo:zoo'; handler: () => void };
export type FooBarAction = { type: 'Foo:bar'; handler: () => void };
export type FooZapEvent = { type: 'Foo:zap'; payload: [] };
export type FooBeepEvent = { type: 'Foo:beep'; payload: [] };

export type FooMessenger = Messenger<
  'Foo',
  FooZooAction | FooBarAction,
  FooZapEvent | FooBeepEvent
>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Foo', 'actions.md'),
        'utf8',
      );
      const eventsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Foo', 'events.md'),
        'utf8',
      );
      expect(actionsMd.indexOf('Foo:bar')).toBeLessThan(
        actionsMd.indexOf('Foo:zoo'),
      );
      expect(eventsMd.indexOf('Foo:beep')).toBeLessThan(
        eventsMd.indexOf('Foo:zap'),
      );
    });
  });

  it('replaces an event with a higher-scored action variant of the same type string', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });

      // The first-encountered file declares `Dupe:thing` as an event in a
      // non-home namespace; the second declares it as an action in the home
      // namespace. The action wins on dedup score, so the event must be
      // removed from `group.events` and the action pushed into
      // `group.actions` — the reverse direction of the
      // action-replaced-by-event case covered above.
      await fs.promises.writeFile(
        path.join(srcDir, 'a-other.ts'),
        `
export type DupeEvent = { type: 'Dupe:thing'; payload: [] };
export type OtherMessenger = Messenger<'Other', never, DupeEvent>;
`,
      );
      await fs.promises.writeFile(
        path.join(srcDir, 'z-DupeController.ts'),
        `
export type DupeAction = { type: 'Dupe:thing'; handler: () => void };
export type DupeMessenger = Messenger<'Dupe', DupeAction, never>;
`,
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(1);
      expect(result.events).toBe(0);
    });
  });

  it('strips trailing "Controller"/"Service" from the namespace, not interior occurrences', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });

      // Both files declare `ServiceWorkerController:tick` but disagree on
      // the kind. The home file's name contains `serviceworker` — the
      // namespace with its trailing `Controller` stripped. If the
      // suffix-strip regex matched interior occurrences instead, it
      // would strip the leading `Service` and look for
      // `workercontroller`, which the home filename doesn't contain, and
      // the wrong variant would win.
      await fs.promises.writeFile(
        path.join(srcDir, 'a-other.ts'),
        `
export type SWAction = { type: 'ServiceWorkerController:tick'; handler: () => void };
export type OtherMessenger = Messenger<'Other', SWAction, never>;
`,
      );
      await fs.promises.writeFile(
        path.join(srcDir, 'serviceworker-home.ts'),
        `
export type SWEvent = { type: 'ServiceWorkerController:tick'; payload: [] };
export type SWMessenger = Messenger<'ServiceWorkerController', never, SWEvent>;
`,
      );

      const result = await generate({
        projectPath: directoryPath,
        outputDir: path.join(directoryPath, '.docs'),
        strategy: 'scan',
        scanDirs: ['src'],
      });

      expect(result.actions).toBe(0);
      expect(result.events).toBe(1);
    });
  });

  it('falls back to `main` when origin/HEAD is not set (shallow clone)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      // Initialize a git repo with a GitHub origin but DO NOT set
      // refs/remotes/origin/HEAD. This is the shape of a shallow CI clone:
      // origin is configured but the symbolic ref is absent, so
      // `resolveDefaultBranch` must fall back to "main".
      await execa('git', ['init', '-q', '-b', 'main'], { cwd: directoryPath });
      await execa(
        'git',
        [
          'remote',
          'add',
          'origin',
          'https://github.com/test-owner/test-repo.git',
        ],
        { cwd: directoryPath },
      );

      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'Foo.ts'),
        `
export type FooAction = { type: 'Foo:do'; handler: () => void };
export type FooMessenger = Messenger<'Foo', FooAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'Foo', 'actions.md'),
        'utf8',
      );
      expect(actionsMd).toContain('blob/main/');
    });
  });

  it('omits GitHub source links when the origin remote is not GitHub', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await initGitRepo(
        directoryPath,
        'https://gitlab.com/test-owner/test-repo.git',
      );

      const srcDir = path.join(directoryPath, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'NonGhController.ts'),
        `
export type NonGhGetAction = {
  type: 'NonGh:get';
  handler: () => string;
};

export type NonGhMessenger = Messenger<'NonGh', NonGhGetAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'scan',
        scanDirs: ['src'],
      });

      const actionsMd = await fs.promises.readFile(
        path.join(outputDir, 'docs', 'NonGh', 'actions.md'),
        'utf8',
      );

      expect(actionsMd).not.toContain('github.com');
      // Source path is rendered plain (no link) when there's no recognized remote.
      expect(actionsMd).toContain('`src/NonGhController.ts');
    });
  });
});

describe('resolveRepoUrl', () => {
  it('returns the bare repo URL for a GitHub origin remote', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initGitRepo(
        directoryPath,
        'https://github.com/test-owner/test-repo.git',
      );

      const url = await resolveRepoUrl(directoryPath);

      expect(url).toBe('https://github.com/test-owner/test-repo');
    });
  });

  it('returns null for a non-GitHub origin remote', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await initGitRepo(
        directoryPath,
        'https://gitlab.com/test-owner/test-repo.git',
      );

      const url = await resolveRepoUrl(directoryPath);

      expect(url).toBeNull();
    });
  });

  it('returns null when git is not available or the directory is not a repo', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      // No `git init` — `git remote get-url origin` will fail.
      const url = await resolveRepoUrl(directoryPath);

      expect(url).toBeNull();
    });
  });
});

describe('generate with the root-messenger strategy', () => {
  it('generates docs from the root messenger unions without scanning', async () => {
    expect.assertions(4);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'types.ts'),
        `
/**
 * Retrieves the state of the FooController.
 */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};

export type FooControllerStateChangeEvent = {
  type: 'FooController:stateChange';
  payload: [FooState, Patch[]];
};

export type GlobalActions = FooControllerGetStateAction;
export type GlobalEvents = FooControllerStateChangeEvent;
`,
      );

      // A messenger type outside the root capability collections. The scan
      // strategy would pick
      // it up; the root-messenger strategy must not, since it isn't reachable
      // from the root messenger.
      await fs.promises.writeFile(
        path.join(appDir, 'unreachable.ts'),
        `
export type OrphanDoAction = {
  type: 'Orphan:do';
  handler: () => void;
};

export type OrphanMessenger = Messenger<'Orphan', OrphanDoAction, never>;
`,
      );

      const outputDir = path.join(directoryPath, '.docs');
      const result = await generate({
        projectPath: directoryPath,
        outputDir,
        strategy: 'root-messenger',
        rootActions: {
          filePath: path.join('app', 'types.ts'),
          typeName: 'GlobalActions',
        },
        rootEvents: {
          filePath: path.join('app', 'types.ts'),
          typeName: 'GlobalEvents',
        },
      });

      expect(result).toStrictEqual({ namespaces: 1, actions: 1, events: 1 });

      const docsDir = path.join(outputDir, 'docs');
      const actionsMd = await fs.promises.readFile(
        path.join(docsDir, 'FooController', 'actions.md'),
        'utf8',
      );
      expect(actionsMd).toContain('FooController:getState');
      expect(actionsMd).toContain('Retrieves the state of the FooController.');
      expect(await fs.promises.readdir(docsDir)).not.toContain('Orphan');
    });
  });

  it('warns about capability types it could not document', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'types.ts'),
        `
export type GoodAction = {
  type: 'Good:do';
  handler: () => void;
};

export type UnnamespacedAction = {
  type: 'nocolon';
  handler: () => void;
};

export type GlobalActions =
  | GoodAction
  | UnnamespacedAction
  | { type: 'Anonymous:do'; handler: () => void };

export type GlobalEvents = never;
`,
      );

      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
        // Silence the warnings while asserting on them.
      });

      try {
        const result = await generate({
          projectPath: directoryPath,
          outputDir: path.join(directoryPath, '.docs'),
          strategy: 'root-messenger',
          rootActions: {
            filePath: path.join('app', 'types.ts'),
            typeName: 'GlobalActions',
          },
          rootEvents: {
            filePath: path.join('app', 'types.ts'),
            typeName: 'GlobalEvents',
          },
        });

        expect(result).toStrictEqual({ namespaces: 1, actions: 1, events: 0 });
        expect(warn).toHaveBeenCalledWith(
          'Warning: skipped 1 capability type declared inline, with no name to document: { type: "Anonymous:do"; handler: () => void; }',
        );
        expect(warn).toHaveBeenCalledWith(
          `Warning: skipped 1 capability type whose shape could not be read: UnnamespacedAction (${path.join('app', 'types.ts')}:7)`,
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('pluralizes the skipped-capability warnings and truncates long lists', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      // Twelve inline members, so the warning names ten and summarizes two.
      const anonymousMembers = Array.from(
        { length: 12 },
        (_unused, index) =>
          `  | { type: 'Anonymous:member${index}'; handler: () => void }`,
      ).join('\n');
      await fs.promises.writeFile(
        path.join(appDir, 'types.ts'),
        `
export type FirstBadAction = { type: 'nocolon1'; handler: () => void };
export type SecondBadAction = { type: 'nocolon2'; handler: () => void };

export type GlobalActions =
  | FirstBadAction
  | SecondBadAction
${anonymousMembers};

export type GlobalEvents = never;
`,
      );

      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
        // Silence the warnings while asserting on them.
      });

      try {
        await generate({
          projectPath: directoryPath,
          outputDir: path.join(directoryPath, '.docs'),
          strategy: 'root-messenger',
          rootActions: {
            filePath: path.join('app', 'types.ts'),
            typeName: 'GlobalActions',
          },
          rootEvents: {
            filePath: path.join('app', 'types.ts'),
            typeName: 'GlobalEvents',
          },
        }).catch(() => undefined);

        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /^Warning: skipped 12 capability types declared inline, with no name to document: .*, and 2 more$/u,
          ),
        );
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /^Warning: skipped 2 capability types whose shape could not be read: FirstBadAction \(.*\), SecondBadAction \(.*\)$/u,
          ),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('throws rather than emptying the docs when nothing resolves', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const appDir = path.join(directoryPath, 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'types.ts'),
        `
import type { Missing } from 'this-package-does-not-exist';

export type GlobalActions = Missing;
export type GlobalEvents = never;
`,
      );

      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
        // Silence the warnings; this test is about the throw.
      });

      try {
        await expect(
          generate({
            projectPath: directoryPath,
            outputDir: path.join(directoryPath, '.docs'),
            strategy: 'root-messenger',
            rootActions: {
              filePath: path.join('app', 'types.ts'),
              typeName: 'GlobalActions',
            },
            rootEvents: {
              filePath: path.join('app', 'types.ts'),
              typeName: 'GlobalEvents',
            },
          }),
        ).rejects.toThrow(
          "named by --root-actions, resolved to `Missing`. It's likely that an " +
            'individual action or event type is also `Missing`',
        );
      } finally {
        warn.mockRestore();
      }
    });
  });
});
