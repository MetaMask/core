/* eslint-disable import-x/no-nodejs-modules */
import { spawnSync } from 'node:child_process';
import { arch as osArch, platform as osPlatform } from 'node:os';

export function getPlatformKey(): string {
  return `${osPlatform()}-${normalizeSystemArchitecture()}`;
}

export function normalizeSystemArchitecture(architecture = osArch()): string {
  if (architecture === 'x64' && osPlatform() === 'darwin') {
    const result = spawnSync('sysctl', ['-n', 'sysctl.proc_translated'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.stdout.trim() === '1') {
      return 'arm64';
    }
  }

  return architecture;
}
