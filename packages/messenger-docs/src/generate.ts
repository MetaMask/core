import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { findDtsFiles, findTsFiles } from './discovery';
import { extractFromFile } from './extraction';
import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown';
import type { MessengerItemDoc, NamespaceGroup } from './types';

/**
 * Compute a deduplication score for a messenger item, preferring items with
 * JSDoc and from the "home" package whose name matches the namespace.
 *
 * @param item - The messenger item to score.
 * @returns A numeric score (higher is better).
 */
function deduplicationScore(item: MessengerItemDoc): number {
  const jsDocScore = item.jsDoc ? 2 : 0;
  const namespacePrefix = item.typeString
    .split(':')[0]
    .replace(/Controller|Service/u, '')
    .toLowerCase();
  const homeScore = item.sourceFile.includes(namespacePrefix) ? 1 : 0;
  return jsDocScore + homeScore;
}

/**
 * Check whether a path exists.
 *
 * @param targetPath - The path to check.
 * @returns A promise that resolves to true if the path exists.
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const execFileAsync = promisify(execFile);

/**
 * Resolve the GitHub blob base URL for a project by reading its git remote.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A base URL like "https://github.com/Owner/Repo/blob/main/" or null.
 */
async function resolveRepoBaseUrl(projectPath: string): Promise<string | null> {
  try {
    const { stdout: remoteRaw } = await execFileAsync(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: projectPath },
    );

    const remote = remoteRaw.trim();

    // Parse owner/repo from SSH or HTTPS remote URLs
    // Handles aliases like github.com-Org used in SSH configs
    const match = remote.match(
      /github\.com[^:/]*[:/]([^/]+\/[^/]+?)(?:\.git)?$/u,
    );
    if (!match) {
      return null;
    }

    return `https://github.com/${match[1]}/blob/main/`;
  } catch {
    return null;
  }
}

/**
 * Options for the generate function.
 */
export type GenerateOptions = {
  /** Absolute path to the project to scan. */
  projectPath: string;
  /** Absolute path to the output directory for generated docs. */
  outputDir: string;
  /**
   * Extra directories (relative to projectPath) to scan for .ts source files.
   * When omitted, falls back to `"messenger-docs".scanDirs` in the project's
   * package.json, then to `["src"]`.
   */
  scanDirs?: string[];
};

/**
 * Result returned by the generate function.
 */
export type GenerateResult = {
  namespaces: number;
  actions: number;
  events: number;
};

/**
 * Scan a project for messenger action/event types and generate documentation.
 *
 * @param options - Generation options.
 * @returns A promise resolving to counts of generated namespaces, actions, and events.
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { projectPath, outputDir, scanDirs: scanDirsOption } = options;

  // Resolve scanDirs: CLI flag → package.json config → default ["src"]
  let scanDirs = scanDirsOption;
  if (!scanDirs) {
    try {
      const pkgRaw = await fs.readFile(
        path.join(projectPath, 'package.json'),
        'utf8',
      );
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      const config = pkg['messenger-docs'] as
        | { scanDirs?: string[] }
        | undefined;
      if (Array.isArray(config?.scanDirs)) {
        scanDirs = config.scanDirs;
      }
    } catch {
      // No package.json or invalid — use default.
    }
    scanDirs ??= ['src'];
  }

  const allItems: MessengerItemDoc[] = [];

  // Check which sources are available
  const existingScanDirs: string[] = [];
  for (const dir of scanDirs) {
    const abs = path.join(projectPath, dir);
    if (await pathExists(abs)) {
      existingScanDirs.push(dir);
    }
  }
  const packagesDir = path.join(projectPath, 'packages');
  const hasPackages = await pathExists(packagesDir);
  const nmDir = path.join(projectPath, 'node_modules', '@metamask');
  const hasNodeModules = await pathExists(nmDir);

  const sources: string[] = [];
  for (const dir of existingScanDirs) {
    sources.push(`${dir}/ (.ts)`);
  }
  if (hasPackages) {
    sources.push('packages/*/src (.ts)');
  }
  if (hasNodeModules) {
    sources.push('node_modules/@metamask/*/dist (.d.cts)');
  }
  console.log(
    `Scanning ${sources.join(', ')} for Messenger action/event types...`,
  );

  // Scan configured source directories for .ts files
  for (const dir of existingScanDirs) {
    const abs = path.join(projectPath, dir);
    const tsFiles = await findTsFiles(abs);
    for (const file of tsFiles) {
      try {
        const items = await extractFromFile(file, projectPath);
        allItems.push(...items);
      } catch (error) {
        console.warn(
          `Warning: failed to parse ${path.relative(
            projectPath,
            file,
          )}: ${String(error)}`,
        );
      }
    }
  }

  // Scan packages/*/src for .ts source files (monorepo)
  if (hasPackages) {
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    const packageDirs = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(packagesDir, dirent.name, 'src'));

    for (const srcDir of packageDirs) {
      if (!(await pathExists(srcDir))) {
        continue;
      }

      const tsFiles = await findTsFiles(srcDir);
      for (const file of tsFiles) {
        try {
          const items = await extractFromFile(file, projectPath);
          allItems.push(...items);
        } catch (error) {
          console.warn(
            `Warning: failed to parse ${path.relative(
              projectPath,
              file,
            )}: ${String(error)}`,
          );
        }
      }
    }
  }

  // Scan node_modules/@metamask/*/dist for .d.cts declaration files
  if (hasNodeModules) {
    const entries = await fs.readdir(nmDir, { withFileTypes: true });
    const pkgDirs = entries
      .filter((dirent) => dirent.isDirectory() || dirent.isSymbolicLink())
      .map((dirent) => path.join(nmDir, dirent.name, 'dist'));

    for (const distDir of pkgDirs) {
      if (!(await pathExists(distDir))) {
        continue;
      }

      const dtsFiles = await findDtsFiles(distDir);
      for (const file of dtsFiles) {
        try {
          const items = await extractFromFile(file, projectPath);
          allItems.push(...items);
        } catch (error) {
          console.warn(
            `Warning: failed to parse ${path.relative(
              projectPath,
              file,
            )}: ${String(error)}`,
          );
        }
      }
    }
  }

  if (existingScanDirs.length === 0 && !hasPackages && !hasNodeModules) {
    throw new Error(
      `No scannable directories found in ${projectPath}. ` +
        `Looked for: ${scanDirs.join(', ')}, packages/, node_modules/@metamask/`,
    );
  }

  console.log(`Found ${allItems.length} messenger items total.`);

  // Group by namespace (part before the colon), deduplicating by typeString.
  // When duplicates exist, prefer the one with JSDoc, or from the package
  // whose name matches the namespace.
  const byNamespace = new Map<string, NamespaceGroup>();
  const seen = new Map<string, MessengerItemDoc>(); // key: typeString

  for (const item of allItems) {
    const existing = seen.get(item.typeString);
    if (existing) {
      // Prefer item with JSDoc, or from the "home" package
      const existingScore = deduplicationScore(existing);
      const newScore = deduplicationScore(item);
      if (newScore <= existingScore) {
        continue;
      }
      // Replace existing with better item
      const ns = item.typeString.split(':')[0];
      const group = byNamespace.get(ns);
      if (group) {
        const list = item.kind === 'action' ? group.actions : group.events;
        const idx = list.indexOf(existing);
        if (idx !== -1) {
          list[idx] = item;
        }
      }
      seen.set(item.typeString, item);
      continue;
    }

    seen.set(item.typeString, item);
    const ns = item.typeString.split(':')[0];
    if (!byNamespace.has(ns)) {
      byNamespace.set(ns, { namespace: ns, actions: [], events: [] });
    }
    const group = byNamespace.get(ns);
    if (group) {
      if (item.kind === 'action') {
        group.actions.push(item);
      } else {
        group.events.push(item);
      }
    }
  }

  // Sort namespaces alphabetically, sort items within each namespace
  const namespaces = Array.from(byNamespace.values()).sort((a, b) =>
    a.namespace.localeCompare(b.namespace),
  );

  for (const ns of namespaces) {
    ns.actions.sort((a, b) => a.typeString.localeCompare(b.typeString));
    ns.events.sort((a, b) => a.typeString.localeCompare(b.typeString));
  }

  // Resolve repository base URL for source links
  const repoBaseUrl = await resolveRepoBaseUrl(projectPath);

  // Write output
  const docsDir = path.join(outputDir, 'docs');

  // Clean existing generated docs
  if (await pathExists(docsDir)) {
    await fs.rm(docsDir, { recursive: true });
  }
  await fs.mkdir(docsDir, { recursive: true });

  // Generate namespace pages
  for (const ns of namespaces) {
    const nsDir = path.join(docsDir, ns.namespace);
    await fs.mkdir(nsDir, { recursive: true });

    if (ns.actions.length > 0) {
      await fs.writeFile(
        path.join(nsDir, 'actions.md'),
        generateNamespacePage(ns, 'action', repoBaseUrl),
      );
    }

    if (ns.events.length > 0) {
      await fs.writeFile(
        path.join(nsDir, 'events.md'),
        generateNamespacePage(ns, 'event', repoBaseUrl),
      );
    }
  }

  // Generate index page
  await fs.writeFile(
    path.join(docsDir, 'index.md'),
    generateIndexPage(namespaces),
  );

  // Generate sidebars
  await fs.writeFile(
    path.join(outputDir, 'sidebars.ts'),
    generateSidebars(namespaces),
  );

  const totalActions = namespaces.reduce(
    (sum, ns) => sum + ns.actions.length,
    0,
  );
  const totalEvents = namespaces.reduce((sum, ns) => sum + ns.events.length, 0);

  console.log(`Generated docs for ${namespaces.length} namespaces.`);
  console.log(`  Actions: ${totalActions}`);
  console.log(`  Events: ${totalEvents}`);
  console.log(`Output: ${docsDir}/`);

  return {
    namespaces: namespaces.length,
    actions: totalActions,
    events: totalEvents,
  };
}
