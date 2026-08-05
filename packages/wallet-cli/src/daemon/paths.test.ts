import { join } from 'node:path';

import { getDaemonPaths } from './paths.js';

describe('getDaemonPaths', () => {
  it('returns correct paths for the given data directory', () => {
    const dataDir = '/tmp/test-data';
    const paths = getDaemonPaths(dataDir);

    expect(paths).toStrictEqual({
      socketPath: join(dataDir, 'daemon.sock'),
      pidPath: join(dataDir, 'daemon.pid'),
      logPath: join(dataDir, 'daemon.log'),
      dbPath: join(dataDir, 'wallet.db'),
    });
  });
});
