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
 */
async function runDocusaurus(command: string, cwd: string): Promise<void> {
  const { bin, nodeModules } = resolveDocusaurus();
  await execa(process.execPath, [bin, command], {
    cwd,
    stdio: 'inherit',
    // eslint-disable-next-line n/no-process-env
    env: { ...process.env, NODE_PATH: nodeModules },
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

/**
 * Resolve scanDirs from CLI args, package.json config, or default.
 *
 * @param projectPath - The project root path.
 * @param cliScanDirs - Scan dirs provided via CLI flags.
 * @returns Resolved scan directories.
 */
async function resolveScanDirs(
  projectPath: string,
  cliScanDirs: string[],
): Promise<string[]> {
  if (cliScanDirs.length > 0) {
    return cliScanDirs;
  }

  try {
    const pkgRaw = await fs.readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const config = pkg['messenger-docs'] as { scanDirs?: string[] } | undefined;
    if (Array.isArray(config?.scanDirs)) {
      return config.scanDirs;
    }
  } catch {
    // No package.json or invalid — use default.
  }

  return ['src'];
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
      description: 'Generate documentation and build a production-ready site',
      default: false,
    })
    .option('serve', {
      type: 'boolean',
      description: 'Generate documentation and serve a production-ready site',
      default: false,
    })
    .option('dev', {
      type: 'boolean',
      description: 'Generate documentation and serve a development-only site',
      default: false,
    })
    .option('scan-dir', {
      type: 'string',
      array: true,
      description: 'Source directory to scan (may be specified multiple times)',
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
  const scanDirs = await resolveScanDirs(resolvedProjectPath, argv['scan-dir']);

  // Step 1: Generate docs
  await generate({
    projectPath: resolvedProjectPath,
    outputDir: resolvedOutputDir,
    scanDirs,
  });

  // Step 2: If --build, --serve, or --dev, set up and run Docusaurus
  if (argv.build || argv.serve || argv.dev) {
    await setupSite(resolvedOutputDir);

    if (argv.dev) {
      console.log('\nStarting dev server...');
      await runDocusaurus('start', resolvedOutputDir);
    } else if (argv.build || argv.serve) {
      console.log('\nBuilding static site...');
      await runDocusaurus('build', resolvedOutputDir);

      if (argv.serve) {
        console.log('\nServing static site...');
        await runDocusaurus('serve', resolvedOutputDir);
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
