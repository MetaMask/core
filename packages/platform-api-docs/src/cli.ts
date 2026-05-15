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
    .option('project-label', {
      type: 'string',
      description:
        'Short label identifying the project (e.g. "Core", "Extension") — stamped on the site title and headings',
    })
    .help().argv;

  const projectPathArg = argv['project-path'];
  const resolvedProjectPath = path.resolve(
    typeof projectPathArg === 'string' ? projectPathArg : '.',
  );
  const resolvedOutputDir = path.resolve(
    argv.output ?? path.join(resolvedProjectPath, '.platform-api-docs'),
  );
  const scanDirs = ['src', ...argv['scan-dir']].filter(
    (dir, index, dirs) => dirs.indexOf(dir) === index,
  );
  const projectLabel =
    typeof argv['project-label'] === 'string' &&
    argv['project-label'].length > 0
      ? argv['project-label']
      : null;
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
