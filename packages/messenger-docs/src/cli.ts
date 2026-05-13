#!/usr/bin/env node

import execa from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import yargs from 'yargs';

import { generate } from './generate';

/**
 * Resolve the path to the docusaurus CLI binary and the node_modules
 * directory that contains the Docusaurus packages.
 *
 * @returns The docusaurus binary path and the node_modules directory.
 */
function resolveDocusaurus(): { bin: string; nodeModules: string } {
  const bin = require.resolve('@docusaurus/core/bin/docusaurus.mjs');
  const coreDir = path.dirname(path.dirname(bin));
  const nodeModules = path.dirname(path.dirname(coreDir));
  return { bin, nodeModules };
}

/**
 * Run a Docusaurus command.
 *
 * @param command - The docusaurus command (start, build, serve).
 * @param cwd - The site directory.
 * @param extraEnv - Extra environment variables passed through to the
 * Docusaurus process (e.g. `DOCS_PROJECT_LABEL`, `DOCS_COMMIT_SHA`).
 */
async function runDocusaurus(
  command: string,
  cwd: string,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  const { bin, nodeModules } = resolveDocusaurus();
  await execa(process.execPath, [bin, command], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: nodeModules, ...extraEnv },
  });
}

/**
 * Copy site files into the output directory using fs.cp with filtering.
 *
 * @param outDir - The output directory to set up.
 */
async function setupSite(outDir: string): Promise<void> {
  const siteDir = path.resolve(__dirname, '..', 'site');
  const skip = new Set(['node_modules', 'docs']);

  console.log(`\nSetting up Docusaurus site in ${outDir}...`);

  await copyDir(siteDir, outDir, skip);

  // Write a minimal package.json so Docusaurus doesn't warn about a missing one
  const pkgJsonPath = path.join(outDir, 'package.json');
  try {
    await fs.access(pkgJsonPath);
  } catch {
    await fs.writeFile(
      pkgJsonPath,
      JSON.stringify({ name: 'messenger-docs-site', private: true }, null, 2),
    );
  }
}

type MessengerDocsConfig = {
  scanDirs?: string[];
  title?: string;
};

/**
 * Read the `messenger-docs` config block out of the project's `package.json`,
 * returning the parsed package and config (both optional).
 *
 * @param projectPath - The project root path.
 * @returns The parsed package.json and config, or empty values on failure.
 */
async function readProjectPackageJson(projectPath: string): Promise<{
  pkg: Record<string, unknown>;
  config: MessengerDocsConfig;
}> {
  try {
    const pkgRaw = await fs.readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const config =
      (pkg['messenger-docs'] as MessengerDocsConfig | undefined) ?? {};
    return { pkg, config };
  } catch {
    return { pkg: {}, config: {} };
  }
}

/**
 * Resolve scanDirs by combining the base set with any CLI additions.
 *
 * The base set comes from `package.json#messenger-docs.scanDirs` when present,
 * otherwise defaults to `['src']`. Any directories supplied via `--scan-dir`
 * are appended to the base set (deduplicated, preserving order). This matches
 * the flag's documented "additional" semantics.
 *
 * @param config - The project's `messenger-docs` config.
 * @param cliScanDirs - Scan dirs provided via CLI flags.
 * @returns Resolved scan directories.
 */
function resolveScanDirs(
  config: MessengerDocsConfig,
  cliScanDirs: string[],
): string[] {
  const base = Array.isArray(config.scanDirs) ? config.scanDirs : ['src'];
  const combined = [...base, ...cliScanDirs];
  const seen = new Set<string>();
  return combined.filter((dir) => {
    if (seen.has(dir)) {
      return false;
    }
    seen.add(dir);
    return true;
  });
}

/**
 * Derive a human-readable project label from a `package.json` name. Handles
 * common MetaMask naming patterns:
 *
 * - `@metamask/core-monorepo` → "Core"
 * - `metamask-extension` → "Extension"
 * - `metamask-mobile` → "Mobile"
 * - `some-other-thing` → "Some Other Thing"
 *
 * @param packageName - The raw `name` field from `package.json`.
 * @returns A title-cased label, or null when the name yields nothing useful.
 */
function deriveProjectLabel(packageName: string): string | null {
  const stripped = packageName
    .replace(/^@[^/]+\//u, '')
    .replace(/-monorepo$/u, '')
    .replace(/^metamask-/u, '');
  if (!stripped) {
    return null;
  }
  return stripped
    .split('-')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(' ');
}

/**
 * Resolve the project label to stamp on the site title. Prefers an explicit
 * `messenger-docs.title` override, falling back to a label derived from
 * `package.json.name`.
 *
 * @param pkg - The parsed package.json contents.
 * @param config - The `messenger-docs` config block.
 * @returns The resolved project label, or null if neither source provided one.
 */
function resolveProjectLabel(
  pkg: Record<string, unknown>,
  config: MessengerDocsConfig,
): string | null {
  if (typeof config.title === 'string' && config.title.length > 0) {
    return config.title;
  }
  if (typeof pkg.name === 'string' && pkg.name.length > 0) {
    return deriveProjectLabel(pkg.name);
  }
  return null;
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
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const argv = await yargs(process.argv.slice(2))
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
    .option('scan-dir', {
      type: 'string',
      array: true,
      description:
        'Additional directories within the project to scan for messenger actions and events (note: may be specified multiple times)',
      default: [] as string[],
    })
    .option('output', {
      type: 'string',
      description: 'Output directory',
    })
    .epilogue(
      'Source directories can also be configured in package.json:\n  "messenger-docs": { "scanDirs": ["app", "src"] }',
    )
    .help().argv;

  const projectPathArg = argv['project-path'];
  const resolvedProjectPath = path.resolve(
    typeof projectPathArg === 'string' ? projectPathArg : '.',
  );
  const resolvedOutputDir = path.resolve(
    argv.output ?? path.join(resolvedProjectPath, '.messenger-docs'),
  );
  const { pkg, config } = await readProjectPackageJson(resolvedProjectPath);
  const scanDirs = resolveScanDirs(config, argv['scan-dir']);
  const projectLabel = resolveProjectLabel(pkg, config);
  const commitSha = await resolveCommitSha(resolvedProjectPath);

  // Step 1: Generate docs
  await generate({
    projectPath: resolvedProjectPath,
    outputDir: resolvedOutputDir,
    scanDirs,
    projectLabel,
    commitSha,
  });

  // Step 2: If --build, --serve, or --dev, set up and run Docusaurus
  if (argv.build || argv.serve || argv.dev) {
    await setupSite(resolvedOutputDir);

    const docusaurusEnv: Record<string, string> = {};
    if (projectLabel) {
      docusaurusEnv.DOCS_PROJECT_LABEL = projectLabel;
    }
    if (commitSha) {
      docusaurusEnv.DOCS_COMMIT_SHA = commitSha;
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

/**
 * Recursively copy a directory, skipping specified directory names.
 *
 * @param src - Source directory.
 * @param dest - Destination directory.
 * @param skip - Set of directory names to skip.
 */
async function copyDir(
  src: string,
  dest: string,
  skip: Set<string>,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (skip.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, skip);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
