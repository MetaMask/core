/* eslint-disable n/no-process-env, n/no-process-exit */
// Wrapper for `yarn skills`. Picks a multi-source-aware tools/sync from
// whichever skill repo is configured and delegates.
//
// Source configuration comes from env vars first, then .skills.local.
// Prefer the public MetaMask/skills sync CLI whenever it is available:
//   1. METAMASK_SKILLS_DIR/tools/sync
//   2. .skills-cache/metamask-skills/tools/sync (zero-config default)
//   3. CONSENSYS_SKILLS_DIR/tools/sync (private fallback when no public source exists)
// The public sync still walks every configured source. Cache fallback means
// `yarn skills` works out of the box from a fresh checkout; if the cache is
// missing, this wrapper clones it before delegating.

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { CACHE_DIR, ensurePublicSkillsCache } from './skills-postinstall';

const REPO = 'core';
const SOURCE_ENV_KEYS = [
  'METAMASK_SKILLS_DIR',
  'CONSENSYS_SKILLS_DIR',
] as const;
const NO_SOURCE_MESSAGE = [
  'No skills source available.',
  '',
  '`yarn skills` normally clones the public skills repo into',
  '.skills-cache/metamask-skills automatically. If that did not happen',
  '(for example, you are offline), point at a clone manually in .skills.local:',
  '',
  '  git clone https://github.com/MetaMask/skills ~/dev/metamask/skills',
  '  echo METAMASK_SKILLS_DIR=~/dev/metamask/skills >> .skills.local',
  '',
  'Optional private overlay (Consensys internal, SSH required):',
  '  git clone git@github.com:Consensys/skills.git ~/dev/Consensys/skills',
  '  echo CONSENSYS_SKILLS_DIR=~/dev/Consensys/skills >> .skills.local',
  '',
  'Then re-run `yarn skills`.',
  '',
].join('\n');
const NO_BASH_MESSAGE = [
  'No supported Bash found.',
  '',
  '`yarn skills` requires Bash 4+ because the shared skills installer uses',
  'modern Bash features. macOS /bin/bash is 3.2.',
  '',
  'Install a current Bash, then re-run `yarn skills`:',
  '  brew install bash',
  '',
].join('\n');

type StatSync = typeof statSync;
type ReadFileSync = typeof readFileSync;
type SpawnSync = typeof spawnSync;

type SkillSourceEnv = Record<
  (typeof SOURCE_ENV_KEYS)[number],
  string | undefined
>;
type SyncScriptPick = { sync: string };

export function cacheDir(cwd: string): string {
  return path.join(cwd, CACHE_DIR);
}

export function syncIn(dir: string, stat?: StatSync): string | null {
  const statFn = stat ?? statSync;
  const candidate = path.join(dir, 'tools', 'sync');
  try {
    if (statFn(candidate).isFile()) {
      return candidate;
    }
  } catch {
    // ignored
  }
  return null;
}

export function bashMajorVersion(
  candidate: string,
  spawn?: SpawnSync,
): number | null {
  const spawnFn = spawn ?? spawnSync;
  const result = spawnFn(candidate, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }

  const match = `${result.stdout}${result.stderr}`.match(
    /GNU bash, version (\d+)\./u,
  );
  return match ? Number(match[1]) : null;
}

export function pickBash(
  env?: NodeJS.ProcessEnv,
  spawn?: SpawnSync,
): string | null {
  const resolvedEnv = env ?? process.env;
  const candidates = [
    resolvedEnv.BASH,
    'bash',
    '/opt/homebrew/bin/bash',
    '/usr/local/bin/bash',
    '/bin/bash',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of new Set(candidates)) {
    const major = bashMajorVersion(candidate, spawn);
    if (major && major >= 4) {
      return candidate;
    }
  }

  return null;
}

export function expandLeadingTilde(
  value: string | undefined,
  env?: NodeJS.ProcessEnv,
): string | undefined {
  if (!value?.startsWith('~')) {
    return value;
  }

  const home = (env ?? process.env).HOME;
  if (!home) {
    return value;
  }

  if (value === '~') {
    return home;
  }

  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(home, value.slice(2));
  }

  return value;
}

export function parseLocalConfig(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = /^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$/u.exec(line);
    if (!match?.groups) {
      continue;
    }

    let value = match.groups.value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match.groups.key] = value;
  }

  return parsed;
}

export function loadSkillSourceEnv(
  cwd?: string,
  processEnv?: NodeJS.ProcessEnv,
  readFile?: ReadFileSync,
): SkillSourceEnv {
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedEnv = processEnv ?? process.env;
  const readFileFn = readFile ?? readFileSync;
  const env: SkillSourceEnv = {
    METAMASK_SKILLS_DIR: resolvedEnv.METAMASK_SKILLS_DIR,
    CONSENSYS_SKILLS_DIR: resolvedEnv.CONSENSYS_SKILLS_DIR,
  };

  try {
    const localConfig = parseLocalConfig(
      readFileFn(path.join(resolvedCwd, '.skills.local'), 'utf8'),
    );
    for (const key of SOURCE_ENV_KEYS) {
      env[key] ??= expandLeadingTilde(localConfig[key], resolvedEnv);
    }
  } catch {
    // ignored: .skills.local is optional
  }

  return env;
}

export function pickSyncScript(
  cwd: string,
  sourceEnv: SkillSourceEnv,
  stat?: StatSync,
): SyncScriptPick | null {
  const publicSync = sourceEnv.METAMASK_SKILLS_DIR
    ? syncIn(sourceEnv.METAMASK_SKILLS_DIR, stat)
    : null;
  if (publicSync) {
    return { sync: publicSync };
  }

  const cacheSync = syncIn(cacheDir(cwd), stat);
  if (cacheSync) {
    return { sync: cacheSync };
  }

  if (sourceEnv.CONSENSYS_SKILLS_DIR) {
    const privateSync = syncIn(sourceEnv.CONSENSYS_SKILLS_DIR, stat);
    if (privateSync) {
      return { sync: privateSync };
    }
  }

  return null;
}

export function buildDelegatedEnv(
  cwd: string,
  sourceEnv: SkillSourceEnv,
  processEnv?: NodeJS.ProcessEnv,
  stat?: StatSync,
): NodeJS.ProcessEnv {
  const env = { ...(processEnv ?? process.env) };
  for (const key of SOURCE_ENV_KEYS) {
    env[key] ??= sourceEnv[key];
  }
  if (!env.METAMASK_SKILLS_DIR && syncIn(cacheDir(cwd), stat)) {
    env.METAMASK_SKILLS_DIR = cacheDir(cwd);
  }
  return env;
}

export function prependBashToPath(
  env: NodeJS.ProcessEnv,
  bash: string,
): NodeJS.ProcessEnv {
  if (!bash.includes(path.sep)) {
    return env;
  }
  return {
    ...env,
    PATH: `${path.dirname(bash)}${path.delimiter}${env.PATH ?? ''}`,
  };
}

export function main(
  argv?: string[],
  cwd?: string,
  processEnv?: NodeJS.ProcessEnv,
  spawn?: SpawnSync,
  stat?: StatSync,
  readFile?: ReadFileSync,
): number {
  const resolvedArgv = argv ?? process.argv.slice(2);
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedEnv = processEnv ?? process.env;
  const spawnFn = spawn ?? spawnSync;
  const sourceEnv = loadSkillSourceEnv(resolvedCwd, resolvedEnv, readFile);

  if (!sourceEnv.METAMASK_SKILLS_DIR && !syncIn(cacheDir(resolvedCwd), stat)) {
    ensurePublicSkillsCache({ spawn: spawnFn, stat });
  }

  const picked = pickSyncScript(resolvedCwd, sourceEnv, stat);
  if (!picked) {
    process.stderr.write(NO_SOURCE_MESSAGE);
    return 1;
  }

  const bash = pickBash(resolvedEnv, spawnFn);
  if (!bash) {
    process.stderr.write(NO_BASH_MESSAGE);
    return 1;
  }

  const env = prependBashToPath(
    buildDelegatedEnv(resolvedCwd, sourceEnv, resolvedEnv, stat),
    bash,
  );

  const result = spawnFn(
    bash,
    [picked.sync, '--repo', REPO, '--target', resolvedCwd, ...resolvedArgv],
    { stdio: 'inherit', env },
  );
  return result.status ?? 1;
}

/* istanbul ignore next */
if (process.argv[1]?.endsWith(`${path.sep}skills-sync.ts`)) {
  process.exit(main());
}
