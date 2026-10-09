/* oxlint-disable node/no-sync */

import { spawn } from 'node:child_process';
import type { ChannelListener } from 'node:diagnostics_channel';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * Permissions that are a plain on/off switch in the generated config, keyed by
 * the permission name the audit channels report.
 */
const BOOLEAN_FLAGS = {
  ChildProcess: '--allow-child-process',
  Net: '--allow-net',
  WorkerThreads: '--allow-worker',
  Addon: '--allow-addons',
  WASI: '--allow-wasi',
  Inspector: '--allow-inspector',
  FFI: '--allow-ffi',
};

/**
 * Environment variables worth expressing paths in terms of, most specific
 * first. Anything matching one of these keeps the config portable across
 * machines and CI runners.
 */
const ENV_TOKENS = [
  'GITHUB_STEP_SUMMARY',
  'GITHUB_OUTPUT',
  'GITHUB_ENV',
  'GITHUB_PATH',
  'GITHUB_WORKSPACE',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'npm_config_cache',
  'YARN_CACHE_FOLDER',
  'TMPDIR',
  'HOME',
];

/**
 * Write permissions that are added implicitly by `lavamoat/.runner-plugin.js`.
 */
const RUNNER_PROVIDED_WRITES = new Set(['$TMPDIR']);

/**
 * Files that module and workspace resolution probes for while walking from the
 * project directory up to the file system root. The hits are almost all misses,
 * but they are still audited, and granting each one would bake this machine's
 * directory layout into the config.
 */
const RESOLUTION_MARKERS = new Set([
  // Module and workspace resolution.
  '.git',
  '.npmrc',
  '.yarnrc.yml',
  'jsconfig.json',
  'lerna.json',
  'node_modules',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'yarn.lock',
  // Tools that search for their own configuration the same way.
  '.browserslistrc',
  '.editorconfig',
  'browserslist',
  'browserslist.config.js',
  'browserslist.config.mjs',
]);

const AUDIT_DIRECTORY = mkdtempSync(join(tmpdir(), 'permission-audit-'));
const AUDIT_LOG = join(AUDIT_DIRECTORY, 'permissions.ndjson');

/**
 * macOS and Windows resolve paths case-insensitively, and tools like
 * TypeScript probe with inconsistent casing. Comparing case-sensitively there
 * would leak absolute machine paths into the config as unmatched outsiders.
 */
const USE_CASE_INSENSITIVE_PATHS =
  process.platform === 'darwin' || process.platform === 'win32';

/**
 * The command line options this script was invoked with.
 */
type Options = {
  /**
   * The `package.json` script to audit.
   */
  scriptName: string;

  /**
   * Anything this script does not recognise, handed to the audited script
   * rather than interpreted here, so that auditing a command that takes
   * arguments reads the same as running it: `audit test --coverage`.
   */
  scriptArgs: string[];

  /**
   * Where to write the generated config, or `undefined` to write it to
   * standard output.
   */
  outPath: string | undefined;

  /**
   * Whether to show the audited script's own output and explain how each grant
   * was chosen, rather than printing the config alone.
   */
  verbose: boolean;
};

/**
 * A directory that absolute paths are rewritten relative to, turning a machine
 * specific path into a portable grant.
 *
 * Matching is anchored at the start of the path, which is what makes the
 * longest entry the most specific one: every token names a place to start
 * from, never a segment that could appear part way along.
 */
type PortablePrefix = {
  /**
   * The absolute path to match, normalised for comparison.
   */
  prefix: string;

  /**
   * What to rewrite a matching path to, such as `./` or `$HOME`.
   */
  token: string;
};

/**
 * The payload published on a `node:permission-model:*` channel. Unlike
 * {@link AuditRecord}, the permission arrives as a bare string, since the
 * channel makes no guarantee about which names it may add.
 */
type PermissionMessage = {
  /**
   * Which permission was checked.
   */
  permission: string;

  /**
   * The resource it applied to, if any.
   */
  resource: string;
};

/**
 * A single permission grant, along with why it ended up that broad.
 */
type Grant = {
  /**
   * The grant as it will appear in the generated config.
   */
  type: string;

  /**
   * Where the path sits.
   */
  location: 'project' | 'token' | 'ancestor' | 'outside';
};

/**
 * One permission check, as published by the audit channels and appended to the
 * log by the collector.
 */
type AuditRecord = {
  /**
   * The process that exercised the permission.
   */
  pid: string;

  /**
   * That process's arguments, used to attribute the record when reporting.
   */
  argv: string;

  /**
   * Which permission was checked.
   */
  permission:
    | 'Addon'
    | 'ChildProcess'
    | 'FFI'
    | 'FileSystemRead'
    | 'FileSystemWrite'
    | 'FileSystem'
    | 'Inspector'
    | 'Net'
    | 'WorkerThreads'
    | 'WASI';

  /**
   * The path, host, or command it applied to. Empty for the permissions that
   * are a plain on/off switch, such as `WorkerThreads`.
   */
  resource: string;
};

/**
 * A grant that had to reach outside the project, kept so that a widened config
 * is never silent about why it was widened.
 */
type Escape = {
  /**
   * Whether the grant was needed for reading or for writing.
   */
  action: 'read' | 'write';

  /**
   * The grant that was emitted.
   */
  grant: string;

  /**
   * How many audited paths collapsed into this same grant.
   */
  count: number;

  /**
   * One of the paths responsible, shown as an example.
   */
  cause: string;
};

/**
 * What the audit records add up to: a description of everything the script
 * actually did, before any of it is turned into a config.
 */
type Summary = {
  /**
   * The paths the script read, already generalised into portable grants.
   */
  reads: Set<string>;

  /**
   * The paths the script wrote, already generalised into portable grants.
   */
  writes: Set<string>;

  /**
   * The `--allow-*` flags for the permissions that are a plain on/off switch.
   */
  flags: Set<string>;

  /**
   * The hosts the script connected to. Not expressible in the config, which
   * treats networking as a single switch, but useful when reviewing it.
   */
  hosts: Set<string>;

  /**
   * The commands the script spawned, useful for the same reason as the hosts.
   */
  commands: Set<string>;

  /**
   * Every grant that reached outside the project, keyed by action and grant.
   */
  escapes: Map<string, Escape>;
};

/**
 * A generated LavaMoat script config.
 */
type Config = {
  /**
   * How the config was produced and how far it can be trusted.
   */
  notes: string;

  /**
   * The flags to run the script with.
   */
  nodeOptions: Record<string, string | boolean | string[]>;
};

/**
 * Normalise a path for comparison on the current platform. Length is
 * preserved, so offsets taken from a comparison key still apply to the
 * original path.
 *
 * @param path - The path to normalise.
 * @returns The comparison key.
 */
function buildComparablePath(path: string): string {
  return USE_CASE_INSENSITIVE_PATHS ? path.toLowerCase() : path;
}

/**
 * Compare two strings alphabetically. This is the same comparator `sort` uses
 * by default. We define it here so that we can use it in places where we are
 * using a more complex sorting strategy, and we need a default fallback.
 *
 * @param a - The first string.
 * @param b - The second string.
 * @returns A negative number if `a` sorts first, a positive number if `b`
 * does, and zero if they are equal.
 */
function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/**
 * Resolve a path to its canonical form, tolerating paths that no longer exist.
 *
 * @param path - The path to resolve.
 * @returns The canonical path, or the original on failure.
 */
function canonicalisePath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Build the table used to rewrite absolute paths into portable tokens, longest
 * first so the most specific prefix wins.
 *
 * @returns The prefixes, most specific first.
 */
function buildPortablePrefixes(): PortablePrefix[] {
  const prefixes: PortablePrefix[] = [];

  /**
   * Register a path and its canonical form under the same token.
   *
   * @param path - The path to register.
   * @param token - The token to rewrite it to.
   */
  const add = (path: string | undefined, token: string): void => {
    if (!path || !isAbsolute(path)) {
      return;
    }

    for (const variant of new Set([resolve(path), canonicalisePath(path)])) {
      prefixes.push({ prefix: buildComparablePath(variant), token });
    }
  };

  // The project directory has to win over `$HOME`, which contains it. Ordering
  // by length below takes care of that.
  add(process.cwd(), './');

  for (const name of ENV_TOKENS) {
    // eslint-disable-next-line n/no-process-env
    add(process.env[name], `$${name}`);
  }

  add(tmpdir(), '$TMPDIR');
  add(homedir(), '$HOME');

  return prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
}

const PORTABLE_PREFIXES = buildPortablePrefixes();

/**
 * Build the set of directories between the project and the filesystem root.
 *
 * @param projectPath - The path to the project.
 * @returns Every strict ancestor of the project directory.
 */
function buildProjectAncestors(projectPath: string): Set<string> {
  const ancestors = new Set<string>();

  let currentDirectory = projectPath;
  let parentDirectory = dirname(currentDirectory);

  while (parentDirectory !== currentDirectory) {
    ancestors
      .add(buildComparablePath(parentDirectory))
      .add(buildComparablePath(canonicalisePath(parentDirectory)));
    currentDirectory = parentDirectory;
    parentDirectory = dirname(currentDirectory);
  }

  return ancestors;
}

const PROJECT_ANCESTORS = buildProjectAncestors(process.cwd());

/**
 * Decide whether a path was read only because a tool searched upwards from the
 * project for a dependency or a configuration file.
 *
 * @param target - The resolved path from an audit record.
 * @returns True if the path is a by-product of such a search.
 */
function isAncestorSearchPath(target: string): boolean {
  const key = buildComparablePath(target);

  if (PROJECT_ANCESTORS.has(key)) {
    return true;
  }

  if (
    PROJECT_ANCESTORS.has(buildComparablePath(dirname(target))) &&
    RESOLUTION_MARKERS.has(buildComparablePath(basename(target)))
  ) {
    return true;
  }

  // Node walks every ancestor's `node_modules` looking for a dependency, so
  // those hits describe the machine's directory layout rather than the script.
  for (const ancestor of PROJECT_ANCESTORS) {
    const modules = join(ancestor, 'node_modules');
    if (key === modules || key.startsWith(modules + sep)) {
      return true;
    }
  }

  return false;
}

/**
 * Rewrite an absolute path into a portable, generalised grant.
 *
 * @param path - The absolute path from an audit record.
 * @param action - Whether the path was read or written. Resolution only ever
 * reads, so a write to one of those paths is a genuine write and must not be
 * widened to the whole file system.
 * @returns The classified grant, or undefined if the path is unusable.
 */
function tryCreatingGrant(
  path: string,
  action: 'read' | 'write',
): Grant | undefined {
  if (!path || !isAbsolute(path)) {
    return undefined;
  }

  const target = resolve(path);

  if (action === 'read' && isAncestorSearchPath(target)) {
    return { type: '/', location: 'ancestor' };
  }

  const key = buildComparablePath(target);
  for (const { prefix, token } of PORTABLE_PREFIXES) {
    if (key !== prefix && !key.startsWith(prefix + sep)) {
      continue;
    }

    if (token === './') {
      return { type: './', location: 'project' };
    }

    return { type: token, location: 'token' };
  }

  // Outside anything recognisable, grant the top-level directory rather than a
  // machine-specific path.
  //
  // On Windows this drops the drive, so `C:\Windows` becomes `/Windows`. That
  // is knowingly left alone: keeping the drive would put a path in the config
  // that means nothing on any other machine, and Windows has no portable
  // top-level namespace to rewrite it to. Such a grant needs a human anyway,
  // and it is reported as an escape so that it gets one.
  const [, top] = target.split(sep);
  return { type: top ? `/${top}` : '/', location: 'outside' };
}

/**
 * Collect the permissions that a script accesses via Node's diagnostics
 * channel, writing them to the log named by `PERMISSION_AUDIT_LOG`.
 *
 * Note that this function does not run in this process, but the process
 * responsible for auditing permissions (see {@link runScript}).
 */
async function collect(): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const logPath = process.env.PERMISSION_AUDIT_LOG;

  // Without a log path there is nothing to report to, so stay out of the way
  // entirely rather than half-instrumenting the process.
  if (!logPath) {
    return;
  }

  // Because this function runs in a separate process, it cannot reference
  // imports outside of itself.
  const { channel } = await import('node:diagnostics_channel');
  const { closeSync, openSync, writeSync } = await import('node:fs');

  const fd = openSync(logPath, 'a');

  // The collector's own bookkeeping shows up on the very channels it listens
  // to. Drop those events so the report describes the audited script, not the
  // auditor.
  const ignored = new Set([logPath]);

  let writing = false;

  const listener: ChannelListener = (message: unknown): void => {
    const { permission, resource } = message as PermissionMessage;
    if (writing || ignored.has(resource)) {
      return;
    }

    writing = true;
    try {
      // O_APPEND writes below PIPE_BUF are atomic, so sibling processes can
      // share this file without locking. Synchronous keeps the record durable
      // even if the process dies before `exit` handlers run.
      writeSync(
        fd,
        `${JSON.stringify({
          pid: process.pid,
          argv: process.argv.slice(1),
          permission,
          resource,
        })}\n`,
      );
    } catch {
      // A broken audit log must never take down the audited script.
    } finally {
      writing = false;
    }
  };

  for (const name of [
    'fs',
    'net',
    'child',
    'worker',
    'inspector',
    'wasi',
    'addon',
    'ffi',
  ]) {
    channel(`node:permission-model:${name}`).subscribe(listener);
  }

  process.on('exit', () => {
    closeSync(fd);
  });
}

/**
 * Holds a mini-script that simply runs the `collect` function. This script is
 * loaded alongside the script that we want to audit so that we can collect
 * its accessed permissions (see {@link runScript}).
 */
const COLLECTOR_URL = `data:text/javascript,${encodeURIComponent(
  `await (${collect.toString()})()`,
)}`;

/**
 * Run the audited script and resolve with its exit status.
 *
 * @param scriptName - The name of the script to run.
 * @param scriptArgs - Arguments to hand to the script.
 * @param verbose - Whether to include verbose output.
 * @param logPath - Where the collector should append records.
 * @returns The exit code.
 */
async function runScript(
  scriptName: string,
  scriptArgs: string[],
  verbose: boolean,
  logPath: string,
): Promise<number> {
  return new Promise((resolveRun) => {
    const flags = [
      '--permission-audit',
      '--disable-warning=SecurityWarning',
      `--import ${COLLECTOR_URL}`,
    ];

    // `node --run` forwards everything after its own `--` to the script, so
    // auditing a command with arguments works the same as running it.
    const args = ['--run', scriptName];
    if (scriptArgs.length > 0) {
      args.push('--', ...scriptArgs);
    }

    const child = spawn('node', args, {
      // The audited script's output is noise next to the generated config, so
      // it is discarded unless it was asked for. Inheriting hands over this
      // process's own descriptors, so the script's output keeps its place in
      // the stream rather than arriving through a second pipe that a reader
      // would have to interleave. Nothing is buffered either, so a chatty
      // script cannot blow up memory here.
      stdio: verbose ? 'inherit' : 'ignore',
      env: {
        // eslint-disable-next-line n/no-process-env
        ...process.env,
        NODE_OPTIONS: flags.join(' '),

        // The `collect` function (which we are loading alongside the script
        // we want to audit) uses this log file to capture detected permissions.
        PERMISSION_AUDIT_LOG: logPath,
      },
    });

    child.on('close', (code, signal) => resolveRun(signal ? 1 : (code ?? 0)));
  });
}

/**
 * Read every record written during a pass.
 *
 * @param logPath - The log to read.
 * @returns The parsed records.
 */
function readAuditLog(logPath: string): AuditRecord[] {
  let contents;
  try {
    contents = readFileSync(logPath, 'utf8');
  } catch {
    return [];
  }

  return contents
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      // A process killed mid-write can leave a partial final line behind.
      try {
        return [JSON.parse(line) as AuditRecord];
      } catch {
        return [];
      }
    });
}

/**
 * Collapse a set of grants, dropping entries made redundant by a broader one.
 *
 * @param grants - The grants to collapse.
 * @returns The sorted, collapsed grants.
 */
function collapse(grants: Set<string>): string[] {
  if (grants.has('/')) {
    return ['/'];
  }

  // Prefer the project-relative grant first; it is the one reviewers care about.
  const sorted = [...grants].sort((a, b) => {
    if (a === './') {
      return -1;
    }

    if (b === './') {
      return 1;
    }

    return compareStrings(a, b);
  });

  return sorted.filter(
    (grant) =>
      !sorted.some((other) => other !== grant && grant.startsWith(`${other}/`)),
  );
}

/**
 * Parse the command line arguments.
 *
 * @returns The options the script was invoked with.
 */
async function parseArgv(): Promise<Options> {
  const argv = await yargs(hideBin(process.argv))
    // Anything this script does not recognise belongs to the script being
    // audited, so auditing a command reads the same as running it.
    .parserConfiguration({ 'unknown-options-as-args': true })
    .command('$0 <script>', 'Audit the permissions a package script needs.')
    .positional('script', {
      describe: 'The `package.json` script to audit.',
      type: 'string',
      demandOption: true,
    })
    .option('out', {
      describe: 'Write the config to this file instead of standard output.',
      type: 'string',
    })
    .option('verbose', {
      describe:
        "Show the audited script's own output, and explain how each grant was chosen.",
      type: 'boolean',
      default: false,
    })
    .example('$0 test --coverage', 'Audit `test`, passing `--coverage` to it.')
    .strictCommands()
    .parseAsync();

  return {
    scriptName: argv.script,
    // Unrecognised arguments belong to the audited script. Mapped because the
    // parser types them loosely, having no way to know they are strings.
    scriptArgs: argv._.map(String),
    outPath: argv.out,
    verbose: argv.verbose,
  };
}

/**
 * Reduce the raw audit records to the set of permissions the script exercised.
 *
 * This describes what happened, and deliberately stops short of deciding what
 * to grant, which {@link buildConfig} handles.
 *
 * @param records - Every record the collector wrote.
 * @returns The summarised permissions.
 */
function summariseAudit(records: AuditRecord[]): Summary {
  const summary: Summary = {
    reads: new Set<string>(),
    writes: new Set<string>(),
    flags: new Set<string>(),
    hosts: new Set<string>(),
    commands: new Set<string>(),
    escapes: new Map<string, Escape>(),
  };

  /**
   * Note that a grant reached outside the project.
   *
   * @param action - Whether the grant was for reading or writing.
   * @param grant - The grant that was emitted.
   * @param cause - The path responsible.
   */
  const addEscape = (
    action: 'read' | 'write',
    grant: string,
    cause: string,
  ): void => {
    const key = `${action} ${grant}`;
    const existing = summary.escapes.get(key);

    summary.escapes.set(key, {
      action,
      grant,
      count: (existing?.count ?? 0) + 1,
      cause: existing?.cause ?? cause,
    });
  };

  for (const { permission, resource } of records) {
    switch (permission) {
      case 'FileSystemRead': {
        const read = tryCreatingGrant(resource, 'read');
        if (read) {
          summary.reads.add(read.type);
          if (read.location !== 'project') {
            addEscape('read', read.type, resource);
          }
        }
        break;
      }

      case 'FileSystemWrite': {
        const written = tryCreatingGrant(resource, 'write');
        if (written) {
          summary.writes.add(written.type);
          if (written.location !== 'project') {
            addEscape('write', written.type, resource);
          }
        }
        break;
      }

      case 'FileSystem':
        // `fs.symlink` publishes this alongside ordinary read and write records
        // for both of its paths, so the specific grants above already cover it.
        break;

      default:
        break;
    }

    const flag = BOOLEAN_FLAGS[permission as keyof typeof BOOLEAN_FLAGS];
    if (flag) {
      summary.flags.add(flag);
    }

    if (permission === 'Net' && resource) {
      summary.hosts.add(resource);
    }

    if (permission === 'ChildProcess' && resource) {
      summary.commands.add(resource);
    }
  }

  return summary;
}

/**
 * Turn a summary into the config that grants exactly those permissions.
 *
 * @param summary - What the audited script exercised.
 * @param scriptName - The script that was audited, named in the notes.
 * @param exitCode - The script's exit code, since a script that stopped early
 * cannot have exercised everything it needs.
 * @returns The config.
 */
function buildConfig(
  summary: Summary,
  scriptName: string,
  exitCode: number,
): Config {
  const reads = new Set([...summary.reads, ...summary.writes, './']);
  const writes = new Set(summary.writes);

  for (const grant of RUNNER_PROVIDED_WRITES) {
    writes.delete(grant);
  }

  const nodeOptions: Config['nodeOptions'] = {
    '--disable-warning': 'SecurityWarning',
    '--permission': true,
    '--allow-fs-read': collapse(reads),
    '--allow-fs-write': collapse(writes),
  };

  for (const flag of Object.values(BOOLEAN_FLAGS)) {
    nodeOptions[flag] = summary.flags.has(flag);
  }

  const incomplete =
    exitCode === 0
      ? ''
      : ` The audited run exited with ${exitCode} before completing, so these permissions are likely incomplete.`;

  return {
    notes: `Generated from a --permission-audit run of \`${scriptName}\`. Review before use: grants are widened to the nearest portable path, so they may be broader than strictly required.${incomplete}`,
    nodeOptions,
  };
}

/**
 * Surfaces details from the permission audit that are helpful for review.
 *
 * @param summary - What the audited script exercised.
 */
function reportSummary(summary: Summary): void {
  console.log('');
  const details: [label: string, values: Set<string>][] = [
    ['Network hosts', summary.hosts],
    ['Child commands', summary.commands],
  ];

  if (details.some(([, values]) => values.size > 0)) {
    for (const [label, values] of details) {
      if (values.size > 0) {
        console.log(`${label}:`);
        for (const value of [...values].sort()) {
          console.log(`  - ${value}`);
        }
      }
    }
  }

  if (summary.escapes.size > 0) {
    console.log('\nGrants reaching outside the project:');

    // Sorted by the same key the map is built from, so reads group before
    // writes and grants read in a stable order.
    const sorted = [...summary.escapes.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([, value]) => value);

    for (const { action, grant, count, cause } of sorted) {
      const more = count > 1 ? `, +${count - 1} more` : '';
      const provided =
        action === 'write' && RUNNER_PROVIDED_WRITES.has(grant)
          ? ' [implicit]'
          : '';

      console.log(`  ${action} ${grant} (e.g. ${cause}${more})${provided}`);
    }
  }
}

/**
 * Audit the permissions a package script needs, and print or write a config
 * granting exactly those.
 */
async function main(): Promise<void> {
  const { scriptName, outPath, verbose, scriptArgs } = await parseArgv();
  const exitCode = await runScript(scriptName, scriptArgs, verbose, AUDIT_LOG);
  const records = readAuditLog(AUDIT_LOG);

  rmSync(AUDIT_DIRECTORY, { recursive: true, force: true });

  // A non-zero exit is not necessarily a problem with the audit: a linter
  // reporting findings or a failing test exits non-zero too. Either way the
  // script stopped early, so whatever it had not reached yet is missing from
  // the config.
  const complete = exitCode === 0;
  if (!complete) {
    console.error(
      `Script exited with ${exitCode}, so it may not have exercised every ` +
        `permission it needs. Fix the failure and re-run for a complete config.`,
    );

    if (!verbose) {
      console.error(
        `Re-run with --verbose to see the script's output and diagnose it.`,
      );
    }
  }

  const summary = summariseAudit(records);
  const config = buildConfig(summary, scriptName, exitCode);
  const json = `${JSON.stringify(config, undefined, 2)}\n`;

  if (outPath) {
    writeFileSync(outPath, json);
    console.error(`Wrote ${outPath}`);
  } else {
    process.stdout.write(json);
  }

  if (verbose) {
    reportSummary(summary);
  }

  // Pass the script's own failure on, so that auditing a command can stand in
  // for running it without turning a failure into a success. Set rather than
  // exited, so that the config above is flushed first.
  process.exitCode = exitCode;
}

await main();
