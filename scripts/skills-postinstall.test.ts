import type { Stats } from 'fs';

import {
  autoUpdateSkills,
  CACHE_DIR,
  ensurePublicSkillsCache,
  isGitDir,
  postinstall,
  PUBLIC_REPO,
  parseSkillsLocal,
  shouldAutoUpdateSkills,
  shouldSkipPostinstall,
  warn,
} from './skills-postinstall';

function statGitDir(existing: boolean): typeof import('fs').statSync {
  return jest.fn(() => {
    if (!existing) {
      throw new Error('missing');
    }
    return { isDirectory: () => true } as Stats;
  }) as unknown as typeof import('fs').statSync;
}

function readSkillsLocal(content: string): typeof import('fs').readFileSync {
  return (() => content) as unknown as typeof import('fs').readFileSync;
}

function spawnWithStatuses(
  statuses: number[],
): typeof import('child_process').spawnSync {
  let index = 0;
  return jest.fn(() => {
    const status = statuses[index] ?? 0;
    index += 1;
    return {
      status,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    };
  }) as unknown as typeof import('child_process').spawnSync;
}

describe('skills-postinstall', () => {
  it('skips when explicitly disabled or running in CI without force', () => {
    expect(shouldSkipPostinstall({ SKILLS_SKIP_POSTINSTALL: '1' })).toBe(true);
    expect(shouldSkipPostinstall({ CI: 'true' })).toBe(true);
    expect(
      shouldSkipPostinstall({ CI: 'true', SKILLS_FORCE_POSTINSTALL: '1' }),
    ).toBe(false);
  });

  it('only auto-updates generated skills when explicitly opted in', () => {
    expect(shouldAutoUpdateSkills({}, readSkillsLocal(''))).toBe(false);
    expect(shouldAutoUpdateSkills({ SKILLS_AUTO_UPDATE: '0' })).toBe(false);
    expect(shouldAutoUpdateSkills({ SKILLS_AUTO_UPDATE: '1' })).toBe(true);
    expect(shouldAutoUpdateSkills({ SKILLS_AUTO_UPDATE: 'true' })).toBe(true);
    expect(shouldAutoUpdateSkills({ SKILLS_AUTO_UPDATE: 'YES' })).toBe(true);
    expect(
      shouldAutoUpdateSkills({}, readSkillsLocal('SKILLS_AUTO_UPDATE=1\n')),
    ).toBe(true);
    expect(
      shouldAutoUpdateSkills(
        { SKILLS_AUTO_UPDATE: '0' },
        () => 'SKILLS_AUTO_UPDATE=1\n',
      ),
    ).toBe(false);
  });

  it('parses .skills.local shell-style assignments', () => {
    expect(
      parseSkillsLocal(
        '# comment\nexport SKILLS_AUTO_UPDATE="yes"\nSKILLS_DOMAINS=perps\n',
      ),
    ).toStrictEqual({
      SKILLS_AUTO_UPDATE: 'yes',
      SKILLS_DOMAINS: 'perps',
    });
  });

  it('detects whether the public cache is a git checkout', () => {
    expect(isGitDir(CACHE_DIR, statGitDir(true))).toBe(true);
    expect(isGitDir(CACHE_DIR, statGitDir(false))).toBe(false);
  });

  it('clones the public skills cache when cache is absent', () => {
    const mkdir = jest.fn();
    const spawn = spawnWithStatuses([0]);

    expect(
      ensurePublicSkillsCache({
        mkdir,
        spawn,
        stat: statGitDir(false),
      }),
    ).toBe(true);
    expect(mkdir).toHaveBeenCalledWith('.skills-cache', { recursive: true });
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'git',
      ['clone', '--depth', '1', '--branch', 'main', PUBLIC_REPO, CACHE_DIR],
      { stdio: 'ignore' },
    );
  });

  it('does not run yarn skills by default', () => {
    const spawn = spawnWithStatuses([0, 0]);

    expect(
      postinstall({
        env: {},
        readFile: readSkillsLocal(''),
        spawn,
        stat: statGitDir(true),
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('runs yarn skills after cache refresh when auto-update is opted in', () => {
    const spawn = spawnWithStatuses([0, 0, 0]);

    expect(
      postinstall({
        env: { SKILLS_AUTO_UPDATE: '1' },
        spawn,
        stat: statGitDir(true),
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenNthCalledWith(3, 'yarn', ['skills'], {
      stdio: 'inherit',
    });
  });

  it('runs yarn skills when cache refresh fails but .skills.local has a source checkout', () => {
    const spawn = spawnWithStatuses([1, 0]);

    expect(
      postinstall({
        env: {},
        readFile: readSkillsLocal(
          'SKILLS_AUTO_UPDATE=1\nMETAMASK_SKILLS_DIR=/tmp/metamask-skills\n',
        ),
        spawn,
        stat: statGitDir(false),
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenNthCalledWith(2, 'yarn', ['skills'], {
      stdio: 'inherit',
    });
  });

  it('warns but does not fail when auto-update sync fails', () => {
    const stderr = { write: jest.fn() };

    expect(autoUpdateSkills({ spawn: spawnWithStatuses([1]), stderr })).toBe(
      false,
    );
    expect(stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('skills sync failed'),
    );
  });

  it('returns without side effects when postinstall is skipped', () => {
    const spawn = spawnWithStatuses([]);

    expect(postinstall({ env: { SKILLS_SKIP_POSTINSTALL: '1' }, spawn })).toBe(
      0,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('formats warnings consistently', () => {
    const stderr = { write: jest.fn() };

    warn('install failed', stderr);

    expect(stderr.write).toHaveBeenCalledWith(
      'skills cache: install failed (run `yarn skills` for details)\n',
    );
  });
});
