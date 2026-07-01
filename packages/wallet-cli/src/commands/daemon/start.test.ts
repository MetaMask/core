import { ensureDaemon } from '../../daemon/daemon-spawn';
import { runCommand } from '../../test/run-command';
import DaemonStart from './start';

jest.mock('../../daemon/daemon-spawn');

const mockEnsureDaemon = jest.mocked(ensureDaemon);

const SRP = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const FLAGS = ['--infura-project-id', 'key', '--password', 'pw', '--srp', SRP];

describe('daemon start', () => {
  it('reports the socket path on a fresh start', async () => {
    mockEnsureDaemon.mockResolvedValue({
      state: 'started',
      socketPath: '/tmp/daemon.sock',
    });

    const { stdout } = await runCommand(DaemonStart, FLAGS);

    expect(stdout).toContain('Daemon running. Socket: /tmp/daemon.sock');
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
});
