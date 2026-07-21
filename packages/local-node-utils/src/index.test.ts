/* eslint-disable jest/expect-expect, n/no-sync */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getCacheKey,
  mergeArtifactConfig,
  requireCompletePlatformConfig,
  resolvePlatformConfig,
} from './artifact';
import { getMetamaskCacheDirectory } from './cache-directory';
import { readCliValue } from './cli';
import { readPackageJsonToolConfig } from './package-json';
import type { ArtifactConfig } from './types';

describe('artifact helpers', () => {
  const defaults: ArtifactConfig = {
    version: '1.0.0',
    platforms: {
      'linux-x64': {
        checksum: 'abc',
        url: 'https://example.com/linux',
      },
    },
  };

  it('merges artifact config overrides', () => {
    assert.deepEqual(
      mergeArtifactConfig(defaults, {
        version: '2.0.0',
        platforms: {
          'darwin-arm64': {
            checksum: 'def',
            url: 'https://example.com/darwin',
          },
        },
      }),
      {
        version: '2.0.0',
        platforms: {
          'linux-x64': defaults.platforms['linux-x64'],
          'darwin-arm64': {
            checksum: 'def',
            url: 'https://example.com/darwin',
          },
        },
      },
    );
  });

  it('resolves platform config from current override', () => {
    assert.deepEqual(
      resolvePlatformConfig(
        {
          platforms: {
            current: {
              checksum: 'current',
              url: 'https://example.com/current',
            },
          },
        },
        'linux-x64',
        'test artifact',
      ),
      {
        checksum: 'current',
        url: 'https://example.com/current',
      },
    );
  });

  it('throws when platform config is missing', () => {
    assert.throws(
      () => resolvePlatformConfig(defaults, 'darwin-arm64', 'test artifact'),
      /No test artifact is configured for darwin-arm64/u,
    );
  });

  it('merges artifact config defaults when override is missing', () => {
    assert.deepEqual(mergeArtifactConfig(defaults, undefined), defaults);
  });

  it('requires complete platform config values', () => {
    assert.deepEqual(
      requireCompletePlatformConfig(
        {
          checksum: 'abc',
          url: 'https://example.com',
        },
        'CLI',
      ),
      {
        checksum: 'abc',
        url: 'https://example.com',
      },
    );
    assert.throws(
      () =>
        requireCompletePlatformConfig({ url: 'https://example.com' }, 'CLI'),
      /CLI require both a URL and a checksum/u,
    );
  });

  it('builds a stable cache key', () => {
    const config = {
      checksum: 'abc',
      url: 'https://example.com/linux',
    };

    assert.equal(
      getCacheKey(config),
      createHash('sha256')
        .update(`${config.url}:${config.checksum}`)
        .digest('hex'),
    );
  });
});

describe('cache directory', () => {
  it('uses the global MetaMask cache when Yarn global cache is enabled', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const homeDirectory = mkdtempSync(join(tmpdir(), 'local-node-utils-home-'));
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');

    assert.equal(
      getMetamaskCacheDirectory({ cwd, homeDirectory }),
      join(homeDirectory, '.cache', 'metamask'),
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    assert.equal(
      getMetamaskCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('uses the local MetaMask cache when .yarnrc.yml is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));

    assert.equal(
      getMetamaskCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });
});

describe('cli helpers', () => {
  it('reads the next CLI value', () => {
    assert.equal(readCliValue('--platform', 'linux-x64'), 'linux-x64');
  });

  it('throws when a CLI value is missing', () => {
    assert.throws(
      () => readCliValue('--platform', undefined),
      /--platform requires a value/u,
    );
  });
});

describe('package.json helpers', () => {
  it('reads the first matching tool config key', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        javaTronUp: {
          binDirectory: './bin',
        },
        'java-tron-up': {
          cacheDirectory: './cache',
        },
      }),
    );

    assert.deepEqual(
      readPackageJsonToolConfig({
        cwd,
        configKeys: ['javaTronUp', 'javatronup', 'java-tron-up'],
      }),
      {
        binDirectory: './bin',
      },
    );
  });

  it('returns an empty object when package.json is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));

    assert.deepEqual(
      readPackageJsonToolConfig({
        cwd,
        configKeys: ['java-tron-up'],
      }),
      {},
    );
  });

  it('throws when package.json is invalid JSON', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    writeFileSync(join(cwd, 'package.json'), '{');

    assert.throws(
      () =>
        readPackageJsonToolConfig({
          cwd,
          configKeys: ['java-tron-up'],
        }),
      /SyntaxError/u,
    );
  });

  it('skips non-object config entries', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        javaTronUp: 'not-an-object',
        'java-tron-up': {
          cacheDirectory: './cache',
        },
      }),
    );

    assert.deepEqual(
      readPackageJsonToolConfig({
        cwd,
        configKeys: ['javaTronUp', 'java-tron-up'],
      }),
      {
        cacheDirectory: './cache',
      },
    );
  });
});
