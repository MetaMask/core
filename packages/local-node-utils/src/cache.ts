/* eslint-disable import-x/no-nodejs-modules */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function cleanInstallerCache({
  cacheDirectory,
  namespace,
}: {
  cacheDirectory: string;
  namespace: string;
}): Promise<void> {
  await rm(join(cacheDirectory, namespace), {
    force: true,
    recursive: true,
  });
}
