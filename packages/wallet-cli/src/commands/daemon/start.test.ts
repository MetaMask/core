import { ensureDaemon } from '../../daemon/daemon-spawn';
import { runCommand } from '../../test/run-command';
import DaemonStart from './start';

jest.mock('../../daemon/daemon-spawn');

const mockEnsureDaemon = jest.mocked(ensureDaemon);

const FLAGS = [
  '--infura-project-id',
  'key',
  '--password',
  'pw',
  '--srp',
  'phrase',
];

describe('daemon start', () => {
  it('reports the socket path on a fresh start', async () => {
    mockEnsureDaemon.mockResolvedValue({
      state: 'started',
      socketPath: '/tmp/daemon.sock',
    });

    const { stdout } = await runCommand(DaemonStart, FLAGS);

    expect(stdout).toContain('Daemon running. Socket: /tmp/daemon.sock');
    expect(mockEnsureDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        infuraProjectId: 'key',
        password: 'pw',
        srp: 'phrase',
      }),
    );
  });

  it('warns that flags were not applied when a daemon is already running', async () => {
    mockEnsureDaemon.mockResolvedValue({
      state: 'already-running',
      socketPath: '/tmp/daemon.sock',
    });

    const { stdout } = await runCommand(DaemonStart, FLAGS);

    expect(stdout).toContain('Daemon already running');
    expect(stdout).toContain('not applied');
  });

  it('passes password: undefined to ensureDaemon when --password is omitted', async () => {
    mockEnsureDaemon.mockResolvedValue({
      state: 'started',
      socketPath: '/tmp/daemon.sock',
    });

    await runCommand(DaemonStart, [
      '--infura-project-id',
      'key',
      '--srp',
      'phrase',
    ]);

    expect(mockEnsureDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ password: undefined }),
    );
  });
});
