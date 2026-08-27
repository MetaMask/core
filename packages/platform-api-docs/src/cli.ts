#!/usr/bin/env node

import execa from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import npmWhich from 'npm-which';
import yargs from 'yargs';

import { generate, resolveRepoUrl } from './generate.js';
import type { RootCapabilitiesTypeReference } from './root-messenger-discovery.js';
import { parseRootCapabilitiesTypeReference } from './root-messenger-discovery.js';

/**
 * Arguments shared by both discovery strategies.
 */
type CommonArguments = {
  /** Whether to build the generated site. */
  build: boolean;
  /** Whether to serve the production build. */
  serve: boolean;
  /** Whether to serve the development site. */
  dev: boolean;
  /** Path to the project being documented. */
  'project-path': string;
  /** Directory where generated documentation is written. */
  output?: string;
  /** Label displayed in the generated documentation. */
  'project-label'?: string;
  /** URL where the generated site is served. */
  'site-url'?: string;
  /** Base path where the generated site is served. */
  'site-base-url'?: string;
};

/**
 * Arguments for the strategy that scans configured source directories.
 */
type ScanStrategyArguments = {
  /** The selected strategy. */
  strategy: 'scan';
  /** Directories, relative to the project root, to scan. */
  scanDir: string[];
};

/**
 * Arguments for the strategy that resolves a root messenger's type unions.
 */
type RootMessengerStrategyArguments = {
  /** The selected strategy. */
  strategy: 'root-messenger';
  /** The root messenger actions type reference. */
  rootActions: RootCapabilitiesTypeReference;
  /** The root messenger events type reference. */
  rootEvents: RootCapabilitiesTypeReference;
};

/**
 * Parsed CLI arguments, discriminated by the selected discovery strategy.
 */
type ParsedArguments = CommonArguments &
  (ScanStrategyArguments | RootMessengerStrategyArguments);

/**
 * Locate the Docusaurus binary in this package's `node_modules/.bin`. Using
 * `npm-which` lets the lookup track wherever the installed Docusaurus puts
 * its binary, so a future Docusaurus upgrade can't break this path.
 *
 * @returns Absolute path to the `docusaurus` executable.
 */
function resolveDocusaurus(): string {
  return npmWhich(__dirname).sync('docusaurus');
}

/**
 * Run a Docusaurus command.
 *
 * @param command - The docusaurus command (start, build, serve).
 * @param cwd - The site directory.
 * @param extraEnv - Extra environment variables passed through to the
 * Docusaurus process (e.g. `DOCS_PROJECT_LABEL`, `DOCS_COMMIT_SHA`,
 * `DOCS_REPO_URL`).
 */
async function runDocusaurus(
  command: string,
  cwd: string,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  await execa(resolveDocusaurus(), [command], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

/**
 * Copy site files into the output directory, skipping `node_modules`, `docs`,
 * and `tsconfig.json`. `docs` is owned by the doc generator and shouldn't be
 * carried over from the source `site/` directory. `tsconfig.json` extends the
 * monorepo's `tsconfig.base.json` via a relative path that only resolves from
 * the source location — it's there for IDE / lint inheritance, not for
 * Docusaurus, which uses `jiti` and doesn't consult the tsconfig at runtime.
 *
 * @param outDir - The output directory to set up.
 */
async function setupSite(outDir: string): Promise<void> {
  const packageDir = path.resolve(__dirname, '..');
  const siteDir = path.join(packageDir, 'site');
  const packageNodeModules = path.join(packageDir, 'node_modules');
  const skip = new Set(['node_modules', 'docs', 'tsconfig.json']);

  console.log(`\nSetting up Docusaurus site in ${outDir}...`);

  // `fs.cp` has been available since Node 16.7 and only got the "stable"
  // marker in 22.3 — it's functional throughout our supported Node range
  // (`^18.18 || >=20`), even though the linter flags the older versions.
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  await fs.cp(siteDir, outDir, {
    recursive: true,
    filter: (source) => !skip.has(path.basename(source)),
  });

  // Symlink this package's `node_modules` into the output so the copied
  // `docusaurus.config.ts` and the rest of Docusaurus's bundling pipeline can
  // resolve their deps the same way they do in the source tree. Without it,
  // Node's resolver walks up from the output and can't reach our nested deps
  // when the package is installed as a regular dependency by an external
  // consumer (e.g. `metamask-extension`, `metamask-mobile`).
  const linkPath = path.join(outDir, 'node_modules');
  try {
    // `'junction'` works cross-platform (POSIX ignores it; Windows uses it
    // without admin) — `'dir'` would require admin on Windows.
    await fs.symlink(packageNodeModules, linkPath, 'junction');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  // Write a minimal package.json so Docusaurus doesn't warn about a missing one
  const pkgJsonPath = path.join(outDir, 'package.json');
  try {
    await fs.access(pkgJsonPath);
  } catch {
    await fs.writeFile(
      pkgJsonPath,
      JSON.stringify(
        { name: 'platform-api-docs-site', private: true },
        null,
        2,
      ),
    );
  }
}

/**
 * Resolve the short Git commit SHA the docs are being generated from.
 * Returns null when the project isn't a git repo or git isn't available.
 *
 * @param projectPath - The project root path.
 * @returns The short SHA, or null on failure.
 */
async function resolveCommitSha(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectPath,
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Reject flag combinations that don't make sense, so a mistaken invocation
 * fails instead of silently producing docs built the wrong way.
 *
 * Flags belonging to the strategy that wasn't selected are errors rather than
 * ignored. Used as a yargs `.check`, so failures print alongside usage.
 *
 * @param argv - The parsed arguments.
 * @param argv.strategy - The selected discovery strategy.
 * @param argv.rootActions - The parsed root actions type reference.
 * @param argv.rootEvents - The parsed root events type reference.
 * @param argv.scanDir - The additional directories to scan.
 * @returns True when the combination is valid.
 */
function checkStrategyArgs({
  strategy,
  rootActions,
  rootEvents,
  scanDir = [],
}: {
  strategy?: 'root-messenger' | 'scan';
  rootActions?: RootCapabilitiesTypeReference;
  rootEvents?: RootCapabilitiesTypeReference;
  scanDir?: string[];
}): ScanStrategyArguments | RootMessengerStrategyArguments {
  if (strategy !== 'root-messenger') {
    if (rootActions !== undefined || rootEvents !== undefined) {
      throw new Error(
        '--root-actions and --root-events only apply to --strategy root-messenger.',
      );
    }
    return { strategy: 'scan', scanDir };
  }

  if (rootActions === undefined || rootEvents === undefined) {
    throw new Error(
      '--strategy root-messenger requires both --root-actions and --root-events, ' +
        'each written as "<file>#<TypeName>".',
    );
  }
  if (scanDir.length > 0) {
    throw new Error(
      '--scan-dir only applies to --strategy scan; --strategy root-messenger reads ' +
        'only the files named by --root-actions and --root-events.',
    );
  }

  return { strategy, rootActions, rootEvents };
}

/**
 * Parse and validate CLI arguments.
 *
 * @param argumentsForParsing - Arguments to parse, excluding the Node and
 * script paths.
 * @returns Parsed arguments, discriminated by discovery strategy.
 */
async function parseArguments(
  argumentsForParsing: string[] = process.argv.slice(2),
): Promise<ParsedArguments> {
  const argv = await yargs(argumentsForParsing)
    .command(
      '$0 [project-path]',
      'Produces documentation for the platform API, the set of actions and events available in clients through the message bus.',
      (yargsInstance) => {
        yargsInstance.positional('project-path', {
          type: 'string',
          description: 'Path to the project to scan',
          default: '.',
        });
      },
    )
    .option('build', {
      type: 'boolean',
      description:
        'Generate platform API docs and build a production-ready site',
      default: false,
    })
    .option('serve', {
      type: 'boolean',
      description:
        'Generate platform API docs and serve a production-ready site',
      default: false,
    })
    .option('dev', {
      type: 'boolean',
      description:
        'Generate platform API docs and serve a development-only site',
      default: false,
    })
    .option('strategy', {
      type: 'string',
      description:
        'How to find messenger actions and events. "scan" parses every source and declaration file looking for messenger types. "root-messenger" instead resolves the two types the project declares for its root messenger',
      default: 'scan',
    })
    .choices('strategy', ['scan', 'root-messenger'] as const)
    .option('root-actions', {
      type: 'string',
      coerce: parseRootCapabilitiesTypeReference,
      description:
        'Type aliasing the union of every action on the root messenger, written as "<file>#<TypeName>" (required with --strategy root-messenger)',
    })
    .option('root-events', {
      type: 'string',
      coerce: parseRootCapabilitiesTypeReference,
      description:
        'Type aliasing the union of every event on the root messenger, written as "<file>#<TypeName>" (required with --strategy root-messenger)',
    })
    .option('scan-dir', {
      type: 'array',
      string: true,
      description:
        'Additional directories within the project to scan for messenger actions and events (note: may be specified multiple times)',
      default: [],
    })
    .option('output', {
      type: 'string',
      description: 'Output directory',
    })
    .option('project-label', {
      type: 'string',
      description:
        'Short label identifying the project (e.g. "Core", "Extension") — stamped on the site title and headings',
    })
    .option('site-url', {
      type: 'string',
      description:
        'Absolute URL the built site will be served from, e.g. https://metamask.github.io',
    })
    .option('site-base-url', {
      type: 'string',
      description:
        'Path prefix the built site will be served under, e.g. /core/platform-api/',
    })
    .help()
    .parse();

  const strategyArguments = checkStrategyArgs(argv);

  const projectPath = argv['project-path'];
  if (typeof projectPath !== 'string') {
    throw new Error('Expected --project-path to be a string.');
  }

  return {
    build: argv.build,
    serve: argv.serve,
    dev: argv.dev,
    'project-path': projectPath,
    output: argv.output,
    'project-label': argv['project-label'],
    'site-url': argv['site-url'],
    'site-base-url': argv['site-base-url'],
    ...strategyArguments,
  };
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const argv = await parseArguments();

  const resolvedProjectPath = path.resolve(argv['project-path']);
  const resolvedOutputDir = path.resolve(
    argv.output ?? path.join(resolvedProjectPath, '.platform-api-docs'),
  );
  const projectLabel =
    argv['project-label'] && argv['project-label'].length > 0
      ? argv['project-label']
      : null;
  const commitSha = await resolveCommitSha(resolvedProjectPath);
  const repoUrl = await resolveRepoUrl(resolvedProjectPath);

  // Step 1: Generate docs
  if (argv.strategy === 'root-messenger') {
    await generate({
      projectPath: resolvedProjectPath,
      outputDir: resolvedOutputDir,
      projectLabel,
      commitSha,
      strategy: 'root-messenger',
      rootActions: argv.rootActions,
      rootEvents: argv.rootEvents,
    });
  } else {
    const scanDirs = ['src', ...argv.scanDir].filter(
      (dir, index, dirs) => dirs.indexOf(dir) === index,
    );

    await generate({
      projectPath: resolvedProjectPath,
      outputDir: resolvedOutputDir,
      projectLabel,
      commitSha,
      strategy: 'scan',
      scanDirs,
    });
  }

  // Step 2: If --build, --serve, or --dev, set up and run Docusaurus
  if (argv.build || argv.serve || argv.dev) {
    await setupSite(resolvedOutputDir);

    // Translate CLI flags into the environment variables Docusaurus's
    // config reads. Keeping the CLI surface flag-only means consumers
    // (workflow files, package.json scripts) don't have to know how the
    // values are plumbed through to Docusaurus.
    const docusaurusEnv: Record<string, string> = {};
    if (projectLabel) {
      docusaurusEnv.DOCS_PROJECT_LABEL = projectLabel;
    }
    if (commitSha) {
      docusaurusEnv.DOCS_COMMIT_SHA = commitSha;
    }
    if (repoUrl) {
      docusaurusEnv.DOCS_REPO_URL = repoUrl;
    }
    if (typeof argv['site-url'] === 'string' && argv['site-url'].length > 0) {
      docusaurusEnv.DOCS_URL = argv['site-url'];
    }
    if (
      typeof argv['site-base-url'] === 'string' &&
      argv['site-base-url'].length > 0
    ) {
      docusaurusEnv.DOCS_BASE_URL = argv['site-base-url'];
    }

    if (argv.dev) {
      console.log('\nStarting dev server...');
      await runDocusaurus('start', resolvedOutputDir, docusaurusEnv);
    } else if (argv.build || argv.serve) {
      console.log('\nBuilding static site...');
      await runDocusaurus('build', resolvedOutputDir, docusaurusEnv);

      if (argv.serve) {
        console.log('\nServing static site...');
        await runDocusaurus('serve', resolvedOutputDir, docusaurusEnv);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
