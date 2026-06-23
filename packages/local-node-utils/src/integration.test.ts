import nock, { cleanAll } from 'nock';
/* eslint-disable jest/expect-expect, n/no-sync */
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractTarBz2Archive, extractTarGzArchive } from './archive';
import { cleanInstallerCache } from './cache';
import { getMetamaskCacheDirectory } from './cache-directory';
import { verifyFileChecksum } from './checksum';
import { runCommand } from './command';
import { downloadFileFromUrl, openDownloadStream } from './download';
import { isFileMissingError } from './errors';
import { installExecutableWrapper } from './executable-wrapper';
import { findExecutable, isDirectory, isFile } from './filesystem';
import { getPlatformKey, normalizeSystemArchitecture } from './platform';

jest.mock('./command', () => ({
  runCommand: jest.fn(),
}));

const runCommandMock = jest.mocked(runCommand);

describe('archive', () => {
  beforeEach(() => {
    runCommandMock.mockReset();
    runCommandMock.mockResolvedValue(undefined);
  });

  it('extracts tar.gz archives', async () => {
    await extractTarGzArchive('/tmp/archive.tar.gz', '/tmp/output');

    expect(runCommandMock).toHaveBeenCalledWith('tar', [
      '-xzf',
      '/tmp/archive.tar.gz',
      '-C',
      '/tmp/output',
    ]);
  });

  it('extracts tar.bz2 archives', async () => {
    await extractTarBz2Archive('/tmp/archive.tar.bz2', '/tmp/output');

    expect(runCommandMock).toHaveBeenCalledWith('tar', [
      '-xjf',
      '/tmp/archive.tar.bz2',
      '-C',
      '/tmp/output',
    ]);
  });
});

describe('cache', () => {
  it('removes a namespaced cache directory', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const namespaceDir = join(tempDir, 'java-tron-up', 'fullnode');
    mkdirSync(namespaceDir, { recursive: true });
    writeFileSync(join(namespaceDir, 'artifact.jar'), 'data');

    await cleanInstallerCache({
      cacheDirectory: tempDir,
      namespace: 'java-tron-up',
    });

    assert.equal(existsSync(namespaceDir), false);
  });
});

describe('download', () => {
  afterEach(() => {
    cleanAll();
  });

  it('downloads a file from a URL', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const destination = join(tempDir, 'nested', 'artifact.bin');

    nock('https://example.com').get('/artifact.bin').reply(200, 'artifact');

    await downloadFileFromUrl('https://example.com/artifact.bin', destination);

    assert.equal(readFileSync(destination, 'utf8'), 'artifact');
  });

  it('follows redirects', async () => {
    nock('https://example.com')
      .get('/redirect')
      .reply(302, '', { Location: 'https://example.com/final' });
    nock('https://example.com').get('/final').reply(200, 'redirected');

    const stream = await openDownloadStream(
      new URL('https://example.com/redirect'),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    assert.equal(Buffer.concat(chunks).toString('utf8'), 'redirected');
  });

  it('rejects failed downloads', async () => {
    nock('https://example.com').get('/missing.bin').reply(500, 'nope');

    await assert.rejects(
      downloadFileFromUrl(
        'https://example.com/missing.bin',
        join(tmpdir(), 'missing.bin'),
      ),
      /failed with 500/u,
    );
  });

  it('rejects redirect loops', async () => {
    nock('https://example.com')
      .persist()
      .get('/loop')
      .reply(302, '', { Location: 'https://example.com/loop' });

    await assert.rejects(
      openDownloadStream(new URL('https://example.com/loop')),
      /Too many redirects/u,
    );
  });
});

describe('cache directory warnings', () => {
  it('falls back to the local cache when .yarnrc.yml is invalid', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    writeFileSync(join(cwd, '.yarnrc.yml'), 'not: [valid');

    assert.equal(
      getMetamaskCacheDirectory({ cwd, toolName: 'java-tron-up' }),
      join(cwd, '.metamask', 'cache'),
    );
    assert.match(
      String(warnSpy.mock.calls[0]?.[0]),
      /using local java-tron-up cache/u,
    );

    warnSpy.mockRestore();
  });
});

describe('errors', () => {
  it('detects missing file errors', () => {
    assert.equal(isFileMissingError({ code: 'ENOENT' }), true);
    assert.equal(isFileMissingError(new Error('nope')), false);
  });
});

describe('platform', () => {
  it('returns a platform key', () => {
    assert.match(getPlatformKey(), /^(darwin|linux|win32)-/u);
  });

  it('normalizes the current architecture', () => {
    assert.equal(typeof normalizeSystemArchitecture(), 'string');
  });
});

describe('checksum', () => {
  it('verifies a file checksum', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const filePath = join(tempDir, 'artifact.bin');
    writeFileSync(filePath, 'hello');

    await verifyFileChecksum(
      filePath,
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      'test artifact',
    );
  });

  it('throws when checksums do not match', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const filePath = join(tempDir, 'artifact.bin');
    writeFileSync(filePath, 'hello');

    await assert.rejects(
      verifyFileChecksum(filePath, 'deadbeef', 'test artifact'),
      /test artifact checksum mismatch/u,
    );
  });
});

describe('filesystem', () => {
  it('finds nested executables by name', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const nestedDir = join(tempDir, 'release', 'bin');
    mkdirSync(nestedDir, { recursive: true });
    const executablePath = join(nestedDir, 'solana');
    writeFileSync(executablePath, '');
    chmodSync(executablePath, 0o755);

    assert.equal(findExecutable(tempDir, 'solana'), executablePath);
    assert.equal(findExecutable(tempDir, 'missing'), undefined);
    assert.equal(isDirectory(tempDir), true);
    assert.equal(isFile(executablePath), true);
    assert.equal(isDirectory(join(tempDir, 'missing')), false);
    assert.equal(isFile(join(tempDir, 'missing')), false);
  });
});

describe('executable wrapper', () => {
  it('installs wrappers with absolute and relative paths', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'local-node-utils-'));
    const binDirectory = join(tempDir, 'bin');
    const executablePath = join(tempDir, 'release', 'bin', 'solana');
    mkdirSync(join(tempDir, 'release', 'bin'), { recursive: true });
    writeFileSync(executablePath, '#!/bin/sh\necho solana\n');
    chmodSync(executablePath, 0o755);

    const relativeWrapper = await installExecutableWrapper({
      binDirectory,
      commandName: 'solana',
      executablePath,
      pathResolution: 'relative',
    });
    const absoluteWrapper = await installExecutableWrapper({
      binDirectory,
      commandName: 'tool',
      executableArgs: ['--flag'],
      executablePath,
      pathResolution: 'absolute',
    });

    assert.match(readFileSync(relativeWrapper, 'utf8'), /path\.resolve/u);
    assert.match(readFileSync(absoluteWrapper, 'utf8'), /--flag/u);
  });
});
