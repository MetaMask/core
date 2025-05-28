#!/usr/bin/env -S node --require "./node_modules/tsx/dist/preflight.cjs" --import "./node_modules/tsx/dist/loader.mjs"

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Dir } from 'node:fs';
import {
  copyFile,
  mkdir,
  opendir,
  rm,
  symlink,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { cwd, exit } from 'node:process';
import { parse as parseYaml } from 'yaml';

import { extractFrom } from './extract';
import { parseArgs, printBanner } from './options';
import type { Checksums, Architecture, Binary } from './types';
import { Extension, Platform } from './types';
import {
  getVersion,
  isCodedError,
  noop,
  say,
  transformChecksums,
} from './utils';

/**
 * Determines the cache directory based on the .yarnrc.yml configuration.
 * If global cache is enabled, returns a path in the user's home directory.
 * Otherwise, returns a local cache path in the current working directory.
 *
 * @returns The path to the cache directory
 */
export function getCacheDirectory(): string {
  let enableGlobalCache = false;
  try {
    const configFileContent = readFileSync('.yarnrc.yml', 'utf8');
    const parsedConfig = parseYaml(configFileContent);
    enableGlobalCache = parsedConfig?.enableGlobalCache ?? false;
  } catch (error) {
    // If file doesn't exist or can't be read, default to local cache
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return join(cwd(), '.metamask', 'cache');
    }
    // For other errors, log but continue with default
    console.warn(
      'Warning: Error reading .yarnrc.yml, using local cache:',
      error,
    );
  }
  return enableGlobalCache
    ? join(homedir(), '.cache', 'metamask')
    : join(cwd(), '.metamask', 'cache');
}

/**
 * Generates the URL for downloading the Foundry binary archive.
 *
 * @param repo - The GitHub repository (e.g., 'foundry-rs/foundry')
 * @param tag - The release tag (e.g., 'v1.0.0')
 * @param version - The version string
 * @param platform - The target platform (e.g., Platform.Linux)
 * @param arch - The target architecture (e.g., 'amd64')
 * @returns The URL for the binary archive
 */
export function getBinaryArchiveUrl(
  repo: string,
  tag: string,
  version: string,
  platform: Platform,
  arch: string,
): string {
  const ext = platform === Platform.Windows ? Extension.Zip : Extension.Tar;
  return `https://github.com/${repo}/releases/download/${tag}/foundry_${version}_${platform}_${arch}.${ext}`;
}

/**
 * Checks if binaries are already in the cache. If not, downloads and extracts them.
 *
 * @param url - The URL to download the binaries from
 * @param binaries - The list of binaries to download
 * @param cachePath - The path to the cache directory
 * @param platform - The target platform
 * @param arch - The target architecture
 * @param checksums - Optional checksums for verification
 * @returns A promise that resolves to the directory containing the downloaded binaries
 */
export async function checkAndDownloadBinaries(
  url: URL,
  binaries: Binary[],
  cachePath: string,
  platform: Platform,
  arch: Architecture,
  checksums?: Checksums,
): Promise<Dir> {
  let downloadedBinaries: Dir;
  try {
    say(`checking cache`);
    downloadedBinaries = await opendir(cachePath);
    say(`found binaries in cache`);
  } catch (e: unknown) {
    say(`binaries not in cache`);
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      say(`installing from ${url.toString()}`);
      // directory doesn't exist, download and extract
      const platformChecksums = transformChecksums(checksums, platform, arch);
      await extractFrom(url, binaries, cachePath, platformChecksums);
      downloadedBinaries = await opendir(cachePath);
    } else {
      throw e;
    }
  }
  return downloadedBinaries;
}

/**
 * Installs the downloaded binaries by creating symlinks or copying files.
 *
 * @param downloadedBinaries - The directory containing the downloaded binaries
 * @param BIN_DIR - The target directory for installation
 * @param cachePath - The path to the cache directory
 * @returns A promise that resolves when installation is complete
 */
export async function installBinaries(
  downloadedBinaries: Dir,
  BIN_DIR: string,
  cachePath: string,
): Promise<void> {
  for await (const file of downloadedBinaries) {
    if (!file.isFile()) {
      continue;
    }
    const target = join(file.parentPath, file.name);
    const path = join(BIN_DIR, relative(cachePath, target));

    // create the BIN_DIR paths if they don't exists already
    await mkdir(BIN_DIR, { recursive: true });

    // clean up any existing files or symlinks
    await unlink(path).catch(noop);
    try {
      // create new symlink
      await symlink(target, path);
    } catch (e) {
      if (!(isCodedError(e) && ['EPERM', 'EXDEV'].includes(e.code))) {
        throw e;
      }
      // symlinking can fail if it's a cross-device/filesystem link, or for
      // permissions reasons, so we'll just copy the file instead
      await copyFile(target, path);
    }
    // check that it works by logging the version
    say(`installed - ${getVersion(path).toString()}`);
  }
}

/**
 * Downloads and installs Foundry binaries based on command-line arguments.
 * If the command is 'cache clean', it removes the cache directory.
 * Otherwise, it downloads and installs the specified binaries.
 *
 * @returns A promise that resolves when the operation is complete
 */
export async function downloadAndInstallFoundryBinaries(): Promise<void> {
  const parsedArgs = parseArgs();

  const CACHE_DIR = getCacheDirectory();

  if (parsedArgs.command === 'cache clean') {
    await rm(CACHE_DIR, { recursive: true, force: true });
    say('done!');
    exit(0);
  }

  const {
    repo,
    version: { version, tag },
    arch,
    platform,
    binaries,
    checksums,
  } = parsedArgs.options;

  printBanner();
  const bins = binaries.join(', ');
  say(`fetching ${bins} ${version} for ${platform} ${arch}`);

  const BIN_ARCHIVE_URL = getBinaryArchiveUrl(
    repo,
    tag,
    version,
    platform,
    arch,
  );
  const BIN_DIR = join(cwd(), 'node_modules', '.bin');

  const url = new URL(BIN_ARCHIVE_URL);
  const cacheKey = createHash('sha256')
    .update(`${BIN_ARCHIVE_URL}-${bins}`)
    .digest('hex');
  const cachePath = join(CACHE_DIR, cacheKey);

  const downloadedBinaries = await checkAndDownloadBinaries(
    url,
    binaries,
    cachePath,
    platform,
    arch,
    checksums,
  );

  await installBinaries(downloadedBinaries, BIN_DIR, cachePath);

  say('done!');
}
