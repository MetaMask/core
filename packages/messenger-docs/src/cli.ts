#!/usr/bin/env node

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { generate } from './generate';

/**
 * Run a command asynchronously with inherited stdio.
 *
 * @param command - The command to run.
 * @param args - The command arguments.
 * @param cwd - The working directory.
 * @param env - Optional environment variables.
 */
async function run(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command failed with exit code ${code}: ${command} ${args.join(
              ' ',
            )}`,
          ),
        );
      }
    });
    child.on('error', reject);
  });
}

/**
 * Run a Docusaurus command with NODE_PATH set so that the output directory
 * can resolve packages from this package's node_modules.
 *
 * @param bin - Path to the docusaurus binary.
 * @param command - The docusaurus command (start, build, serve).
 * @param cwd - The site directory.
 * @param nodeModules - The node_modules directory containing Docusaurus packages.
 */
async function runDocusaurus(
  bin: string,
  command: string,
  cwd: string,
  nodeModules: string,
): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const env = { ...process.env, NODE_PATH: nodeModules };
  await run(process.execPath, [bin, command], cwd, env);
}

/**
 * Resolve the path to the docusaurus CLI binary and the node_modules
 * directory that contains the Docusaurus packages.
 *
 * @returns The docusaurus binary path and the node_modules directory.
 */
function resolveDocusaurus(): { bin: string; nodeModules: string } {
  const bin = require.resolve('@docusaurus/core/bin/docusaurus.mjs');
  // Walk up from @docusaurus/core/bin/docusaurus.mjs to find node_modules
  const coreDir = path.dirname(path.dirname(bin));
  const nodeModules = path.dirname(path.dirname(coreDir));
  return { bin, nodeModules };
}

/**
 * Parse CLI arguments and run the messenger docs generator.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  let build = false;
  let serve = false;
  let dev = false;
  let outputDir: string | undefined;
  let projectPath: string | undefined;
  const scanDirs: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--build':
        build = true;
        break;
      case '--serve':
        serve = true;
        break;
      case '--dev':
        dev = true;
        break;
      case '--output':
        i += 1;
        outputDir = args[i];
        if (!outputDir || outputDir.startsWith('-')) {
          console.error('Error: --output requires a path argument');
          process.exitCode = 1;
          return;
        }
        break;
      case '--scan-dir':
        i += 1;
        if (!args[i] || args[i].startsWith('-')) {
          console.error('Error: --scan-dir requires a path argument');
          process.exitCode = 1;
          return;
        }
        scanDirs.push(args[i]);
        break;
      case '--help':
        printHelp();
        return;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          printHelp();
          process.exitCode = 1;
          return;
        }
        projectPath = arg;
        break;
    }
  }

  // Resolve paths
  const resolvedProjectPath = path.resolve(projectPath ?? process.cwd());
  const resolvedOutputDir = path.resolve(
    outputDir ?? path.join(resolvedProjectPath, '.messenger-docs'),
  );

  // Step 1: Generate docs
  await generate({
    projectPath: resolvedProjectPath,
    outputDir: resolvedOutputDir,
    ...(scanDirs.length > 0 ? { scanDirs } : {}),
  });

  // Step 2: If --build, --serve, or --dev, set up and run Docusaurus
  if (build || serve || dev) {
    await setupSite(resolvedOutputDir);

    const { bin: docusaurus, nodeModules } = resolveDocusaurus();

    if (dev) {
      console.log('\nStarting dev server...');
      await runDocusaurus(docusaurus, 'start', resolvedOutputDir, nodeModules);
    } else if (build || serve) {
      console.log('\nBuilding static site...');
      await runDocusaurus(docusaurus, 'build', resolvedOutputDir, nodeModules);

      if (serve) {
        console.log('\nServing static site...');
        await runDocusaurus(
          docusaurus,
          'serve',
          resolvedOutputDir,
          nodeModules,
        );
      }
    }
  }
}

/**
 * Copy template files into the output directory.
 *
 * @param outDir - The output directory to set up.
 */
async function setupSite(outDir: string): Promise<void> {
  const templateDir = path.resolve(__dirname, '..', 'template');

  console.log(`\nSetting up Docusaurus site in ${outDir}...`);

  // Copy template files (skip node_modules and docs if they exist in template)
  await copyDir(templateDir, outDir, new Set(['node_modules', 'docs']));

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
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (skip.has(entry.name)) {
        continue;
      }
      await copyDir(srcPath, destPath, skip);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Print usage help.
 */
function printHelp(): void {
  console.log(`
Usage: messenger-docs [project-path] [options]

Generate Messenger API documentation for MetaMask controller packages.
Scans packages/*/src (.ts), configured source dirs, and node_modules/@metamask (.d.cts).

Arguments:
  project-path      Path to the project to scan (default: current directory)

Options:
  --build           Generate docs and build static site
  --serve           Generate docs, build, and serve static site
  --dev             Generate docs and start dev server with hot reload
  --scan-dir <dir>  Extra source directory to scan (repeatable, default: src)
  --output <dir>    Output directory (default: <project-path>/.messenger-docs)
  --help            Show this help message

Source directories can also be configured in package.json:
  "messenger-docs": { "scanDirs": ["app", "src"] }

Examples:
  messenger-docs                                   # Scan cwd
  messenger-docs --serve                           # Generate, build, and serve
  messenger-docs --scan-dir app --scan-dir shared  # Scan app/ and shared/
  messenger-docs --output ./my-docs                # Custom output directory
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
