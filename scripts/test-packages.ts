import { getWorkspaceLocations } from '@metamask/action-utils';
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PACKAGES_ON_JEST } from '../test-runner-package-map.cjs';

type WorkspaceManifest = {
  name: string;
  scripts?: Record<string, string>;
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Runs Jest packages individually and migrated packages in one Vitest process.
 */
async function main(): Promise<void> {
  const { workspaces } = JSON.parse(await readFile('package.json', 'utf8')) as {
    workspaces: string[];
  };
  const locations = await getWorkspaceLocations(workspaces, process.cwd());
  const manifests = await Promise.all(
    locations.map(async (location) => {
      return JSON.parse(
        await readFile(path.join(location, 'package.json'), 'utf8'),
      ) as WorkspaceManifest;
    }),
  );
  const jestPackages = manifests.filter(({ name }) =>
    PACKAGES_ON_JEST.has(name),
  );
  const vitestPackages = manifests.filter(
    ({ name }) => !PACKAGES_ON_JEST.has(name),
  );

  await runWorkspaceScript(
    jestPackages.map(({ name }) => name),
    'test',
    ['--coverage=false'],
  );
  await runWorkspaceScript(
    vitestPackages
      .filter(({ scripts }) => scripts?.['test:types'])
      .map(({ name }) => name),
    'test:types',
  );

  if (vitestPackages.length > 0) {
    await execa('yarn', ['test:vitest'], { stdio: 'inherit' });
  }
}

/**
 * Runs a package script only in the named workspaces.
 *
 * @param names - Workspace names to include.
 * @param script - The package script to run.
 * @param args - Arguments passed to the package script.
 */
async function runWorkspaceScript(
  names: string[],
  script: string,
  args: string[] = [],
): Promise<void> {
  if (names.length === 0) {
    return;
  }

  await execa(
    'yarn',
    [
      'workspaces',
      'foreach',
      '--all',
      '--parallel',
      '--verbose',
      ...names.flatMap((name) => ['--include', name]),
      'run',
      script,
      ...args,
    ],
    { stdio: 'inherit' },
  );
}
